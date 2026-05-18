#!/usr/bin/env bun
/**
 * check-readiness.ts — post-deploy smoke for tokagent-billing-server.
 *
 * Invoked by .github/workflows/deploy-billing-server.yml after every deploy
 * to confirm the new revision is actually serving requests. Can also be run
 * locally against staging.
 *
 *   bun tokagentos/scripts/billing-server/check-readiness.ts <BASE_URL>
 *   bun tokagentos/scripts/billing-server/check-readiness.ts <BASE_URL> --full
 *
 *   --full also exercises the SIWE nonce shape, the price endpoint, and
 *   the billing-status endpoint. Default (without --full) only checks the
 *   process-level health surface — useful in deploys where the DB might
 *   still be migrating.
 *
 * Exits 0 on all-green, 1 on any failure. Output is machine-readable JSON
 * on stdout (one line per check) plus a human-readable summary on stderr.
 */

interface Check {
  name: string;
  url: string;
  expectStatus: number;
  validate?: (body: unknown) => string | null;
}

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
const full = process.argv.includes("--full");
if (!baseUrl) {
  console.error("usage: check-readiness.ts <BASE_URL> [--full]");
  process.exit(2);
}

const checks: Check[] = [
  {
    name: "agent_health",
    url: `${baseUrl}/api/health`,
    expectStatus: 200,
    validate: (body) => {
      const b = body as { ready?: boolean; database?: string; agentState?: string };
      if (!b || b.ready !== true) return "ready != true";
      if (b.database && b.database !== "ok") return `database=${b.database}`;
      if (b.agentState && b.agentState !== "running") return `agentState=${b.agentState}`;
      return null;
    },
  },
];

if (full) {
  checks.push(
    {
      name: "billing_status",
      url: `${baseUrl}/tokagent-billing/v1/billing/status`,
      expectStatus: 200,
      validate: (body) => {
        const b = body as { enabled?: boolean };
        return b?.enabled === true ? null : "billing.enabled != true";
      },
    },
    {
      name: "price_endpoint",
      url: `${baseUrl}/tokagent-billing/v1/price`,
      // /v1/price may return 401 if BILLING_AUTH_REQUIRED=true; accept either.
      expectStatus: 200,
    },
    {
      name: "auth_nonce",
      // SIWE nonce — public route, takes a real wallet + chainId. Use a
      // throwaway zero-address; we only care about envelope shape, not the
      // resulting nonce being usable.
      url: `${baseUrl}/tokagent-billing/v1/auth/nonce?wallet=0x0000000000000000000000000000000000000001&chainId=1`,
      expectStatus: 200,
      validate: (body) => {
        const b = body as { nonce?: string; envelope?: { wallet?: string; expiresAt?: number } };
        if (!b?.nonce || !/^0x[a-fA-F0-9]{64}$/.test(b.nonce)) return "nonce shape wrong";
        if (!b.envelope?.wallet) return "envelope.wallet missing";
        if (!b.envelope?.expiresAt) return "envelope.expiresAt missing";
        return null;
      },
    },
  );
}

let failed = 0;
for (const c of checks) {
  const start = Date.now();
  let status = 0;
  let body: unknown = null;
  let err: string | null = null;
  try {
    const r = await fetch(c.url, {
      method: "GET",
      headers: { "user-agent": "tokagent-readiness-check/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    status = r.status;
    if (r.headers.get("content-type")?.includes("application/json")) {
      body = await r.json().catch(() => null);
    }
    if (status !== c.expectStatus) {
      err = `expected ${c.expectStatus}, got ${status}`;
    } else if (c.validate && body) {
      err = c.validate(body);
    } else if (c.validate && !body) {
      err = "no JSON body to validate";
    }
  } catch (e) {
    err = (e as Error).message ?? String(e);
  }
  const ms = Date.now() - start;
  const ok = err === null;
  if (!ok) failed++;

  console.log(JSON.stringify({
    check: c.name,
    url: c.url,
    status,
    ok,
    err,
    elapsed_ms: ms,
  }));
  console.error(`${ok ? "✓" : "✗"} ${c.name} (${ms}ms)${err ? `  — ${err}` : ""}`);
}

console.error("");
if (failed === 0) {
  console.error(`All ${checks.length} checks passed.`);
  process.exit(0);
} else {
  console.error(`${failed}/${checks.length} checks FAILED.`);
  process.exit(1);
}
