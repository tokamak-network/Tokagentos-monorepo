/**
 * Billing setup routes (Phase 9).
 *
 * POST /v1/billing/setup    — validates, persists config, triggers re-init
 * POST /v1/billing/validate — dry-run validation only, no persistence
 *
 * Auth model (Z46): these routes are gated on the env flag
 * BILLING_SETUP_ENABLED (default: true). In a production-locked deployment
 * an operator can set BILLING_SETUP_ENABLED=false to prevent reconfiguration
 * from the chat UI.
 *
 * Pre-setup there are no API keys and no SIWE wallets — so these routes
 * are intentionally unauthenticated. Access is restricted to localhost-only
 * by the server's existing DNS rebinding and CORS guards.
 *
 * Decision Z49: the restart is triggered by calling initBillingPlugin()
 * and disposeBillingPlugin() in-process rather than a full process restart,
 * so the agent runtime stays alive and the Billing tab appears after the
 * next GET /v1/billing/status poll without a page reload.
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { BillingSetupValues } from "../lib/billing-config-writer.js";
import { writeBillingConfig } from "../lib/billing-config-writer.js";
import {
  validateDatabaseUrl,
  validateChainRpcUrl,
  validateVaultAddress,
  validateOperatorPrivateKey,
  validateAuthSecret,
} from "../lib/billing-config-validator.js";
import { isBillingStateInitialized } from "../state.js";
import { initBillingPlugin, disposeBillingPlugin } from "../init.js";

const log = logger.child({ src: "billing:setup-routes" });

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function setupEnabled(): boolean {
  const raw = process.env.BILLING_SETUP_ENABLED?.trim().toLowerCase();
  // Default true — operator must explicitly disable.
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  return true;
}

function setupDisabled(res: RouteResponse): void {
  res.status(403).json({
    error: "Billing setup is disabled on this deployment (BILLING_SETUP_ENABLED=false).",
  });
}

// ---------------------------------------------------------------------------
// POST /v1/billing/validate — dry-run only
// ---------------------------------------------------------------------------

async function handleValidate(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!setupEnabled()) return setupDisabled(res);

  const body = req.body as Partial<BillingSetupValues> | undefined;
  if (!body) {
    res.status(400).json({ error: "Request body is required." });
    return;
  }

  const errors: Record<string, string> = {};

  // Database
  if (body.databaseUrl !== undefined) {
    const r = await validateDatabaseUrl(body.databaseUrl);
    if (!r.ok) errors.databaseUrl = r.error ?? "Invalid";
  }

  // RPC + chain ID
  if (body.chainRpcUrl !== undefined) {
    const r = await validateChainRpcUrl(
      body.chainRpcUrl,
      body.chainId !== undefined ? Number(body.chainId) : undefined,
    );
    if (!r.ok) errors.chainRpcUrl = r.error ?? "Invalid";
  }

  // Vault + PTON
  if (body.vaultAddress !== undefined && body.ptonAddress !== undefined && body.chainRpcUrl !== undefined) {
    const r = await validateVaultAddress({
      rpcUrl: body.chainRpcUrl,
      vaultAddress: body.vaultAddress,
      ptonAddress: body.ptonAddress,
    });
    if (!r.ok) errors.vaultAddress = r.error ?? "Invalid";
  }

  // Operator key
  if (body.operatorPrivateKey !== undefined) {
    const r = validateOperatorPrivateKey(body.operatorPrivateKey);
    if (!r.ok) errors.operatorPrivateKey = r.error ?? "Invalid";
  }

  // Auth secret
  if (body.authSecret !== undefined) {
    const r = validateAuthSecret(body.authSecret);
    if (!r.ok) errors.authSecret = r.error ?? "Invalid";
  }

  if (Object.keys(errors).length > 0) {
    res.status(422).json({ ok: false, errors });
    return;
  }

  res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /v1/billing/setup — validate + persist + re-init
// ---------------------------------------------------------------------------

async function handleSetup(
  req: RouteRequest,
  res: RouteResponse,
  runtime: IAgentRuntime,
): Promise<void> {
  if (!setupEnabled()) return setupDisabled(res);

  const body = req.body as Partial<BillingSetupValues> | undefined;
  if (!body) {
    res.status(400).json({ error: "Request body is required." });
    return;
  }

  // ---- Required field check ----
  const required: (keyof BillingSetupValues)[] = [
    "databaseUrl",
    "chainRpcUrl",
    "chainId",
    "vaultAddress",
    "ptonAddress",
    "operatorPrivateKey",
    "authSecret",
  ];
  const missing = required.filter((k) => body[k] === undefined || body[k] === null || body[k] === "");
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }

  const values = body as BillingSetupValues;

  // ---- Full validation ----
  const errors: Record<string, string> = {};

  const dbResult = await validateDatabaseUrl(values.databaseUrl);
  if (!dbResult.ok) errors.databaseUrl = dbResult.error ?? "Invalid";

  const rpcResult = await validateChainRpcUrl(values.chainRpcUrl, Number(values.chainId));
  if (!rpcResult.ok) errors.chainRpcUrl = rpcResult.error ?? "Invalid";

  const vaultResult = await validateVaultAddress({
    rpcUrl: values.chainRpcUrl,
    vaultAddress: values.vaultAddress,
    ptonAddress: values.ptonAddress,
  });
  if (!vaultResult.ok) errors.vaultAddress = vaultResult.error ?? "Invalid";

  const keyResult = validateOperatorPrivateKey(values.operatorPrivateKey);
  if (!keyResult.ok) errors.operatorPrivateKey = keyResult.error ?? "Invalid";

  const secretResult = validateAuthSecret(values.authSecret);
  if (!secretResult.ok) errors.authSecret = secretResult.error ?? "Invalid";

  if (Object.keys(errors).length > 0) {
    res.status(422).json({ ok: false, errors });
    return;
  }

  // ---- Persist ----
  try {
    await writeBillingConfig({
      ...values,
      chainId: Number(values.chainId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "billing setup: writeBillingConfig failed");
    res.status(500).json({ error: `Failed to persist billing config: ${msg}` });
    return;
  }

  // ---- In-process re-init (Decision Z49) ----
  // dispose → init with the newly-written env (which is now in process.env).
  // This makes BILLING_ENABLED=true take effect immediately without a full
  // process restart.
  try {
    if (isBillingStateInitialized()) {
      await disposeBillingPlugin();
    }
    await initBillingPlugin(runtime);
    log.info("billing setup complete — plugin re-initialized");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "billing setup: re-init failed after persist");
    // Config was written successfully — the agent will pick it up on the
    // next manual restart. Surface the error so the panel can inform the user.
    res.status(207).json({
      ok: false,
      persisted: true,
      restarted: false,
      error: `Config saved but in-process re-init failed: ${msg}. The agent will pick up the new config on the next restart.`,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    persisted: true,
    restarted: true,
    // The AppContext fetches /v1/billing/status once at app boot to decide
    // whether to show the Billing nav tab — it does NOT poll. The user must
    // reload the Tokagent UI tab in their browser before the tab appears.
    message:
      "Billing is now active. Reload your Tokagent app tab in the browser " +
      "(Cmd/Ctrl+Shift+R) to make the Billing tab appear in the sidebar.",
  });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const setupRoutes: Route[] = [
  {
    type: "POST",
    path: "/v1/billing/validate",
    rawPath: true,
    public: true, // Auth model: unauthenticated pre-setup (see module doc)
    name: "billing-setup-validate",
    handler: handleValidate,
  },
  {
    type: "POST",
    path: "/v1/billing/setup",
    rawPath: true,
    public: true, // Auth model: unauthenticated pre-setup (see module doc)
    name: "billing-setup",
    handler: handleSetup,
  },
];

// ---------------------------------------------------------------------------
// Client-mode setup routes
// ---------------------------------------------------------------------------
//
// In BILLING_MODE=client the wizard collects ONE value: the gateway URL
// (and an optional timeout). No DB, no chain config, no operator key.
// We expose `/v1/billing/validate` and `/v1/billing/setup` with the same
// public unauth contract — but client-mode validators accept a tiny shape.

async function handleClientSetup(
  req: RouteRequest,
  res: RouteResponse,
  runtime: IAgentRuntime,
): Promise<void> {
  if (!setupEnabled()) return setupDisabled(res);
  const body = req.body as
    | { gatewayUrl?: string; timeoutMs?: number }
    | undefined;
  if (!body) {
    res.status(400).json({ error: "Request body is required." });
    return;
  }
  const url = typeof body.gatewayUrl === "string" ? body.gatewayUrl.trim() : "";
  if (!url) {
    res
      .status(400)
      .json({ error: "Missing required field: gatewayUrl (HTTPS URL of the upstream gateway)" });
    return;
  }
  try {
    new URL(url);
  } catch {
    res.status(422).json({
      ok: false,
      errors: { gatewayUrl: "gatewayUrl must be a valid URL" },
    });
    return;
  }

  // Persist + re-init. Setup writer is server-shaped, but the persistence
  // primitives (config.env + .env mirror) are mode-agnostic. We bypass the
  // full writeBillingConfig helper and write the two keys directly here so
  // we never accidentally trigger BILLING_ENABLED=true for client-mode.
  try {
    const { persistKey } = await loadPersistKey();
    await persistKey("BILLING_MODE", "client");
    await persistKey("TOKAGENT_GATEWAY_URL", url);
    if (typeof body.timeoutMs === "number" && body.timeoutMs > 0) {
      await persistKey("TOKAGENT_GATEWAY_TIMEOUT_MS", String(body.timeoutMs));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "client-mode billing setup: persist failed");
    res.status(500).json({ error: `Failed to persist gateway config: ${msg}` });
    return;
  }

  // In-process re-init so the plugin starts forwarding immediately.
  try {
    if (isBillingStateInitialized()) {
      await disposeBillingPlugin();
    }
    await initBillingPlugin(runtime);
    log.info({ url }, "client-mode billing setup complete — forwarder online");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "client-mode billing setup: re-init failed");
    res.status(207).json({
      ok: false,
      persisted: true,
      restarted: false,
      error: `Config saved but re-init failed: ${msg}. Restart the agent to pick up the new config.`,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    persisted: true,
    restarted: true,
    mode: "client",
    gatewayUrl: url,
    message:
      "Client-mode billing is now active — every /v1/* request will forward " +
      "to the configured gateway.",
  });
}

async function handleClientValidate(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!setupEnabled()) return setupDisabled(res);
  const body = req.body as { gatewayUrl?: string } | undefined;
  if (!body) {
    res.status(400).json({ error: "Request body is required." });
    return;
  }
  if (body.gatewayUrl !== undefined) {
    try {
      new URL(body.gatewayUrl);
    } catch {
      res.status(422).json({
        ok: false,
        errors: { gatewayUrl: "gatewayUrl must be a valid URL" },
      });
      return;
    }
  }
  res.status(200).json({ ok: true });
}

/**
 * Minimal persist helper. Avoids dragging the full writeBillingConfig
 * machinery (which assumes server-mode keys + rollback semantics) into the
 * single-key client-mode path.
 */
async function loadPersistKey(): Promise<{
  persistKey: (key: string, value: string) => Promise<void>;
}> {
  // Reuse the same config.env + .env mirror logic by going through the
  // writeBillingConfig module's exported `clearBillingConfig` import path.
  // The writer module already exports its own persistence shape; we
  // duplicate the minimal surface here for clarity.
  const fs = await import("node:fs/promises");
  const fsSync = await import("node:fs");
  const pathMod = await import("node:path");
  const os = await import("node:os");

  function resolveConfigEnvPath(): string {
    const stateDir =
      process.env.TOKAGENT_STATE_DIR?.trim() ||
      pathMod.join(os.homedir(), ".tokagent");
    return pathMod.join(stateDir, "config.env");
  }

  function resolveProjectDotenv(): string | null {
    try {
      const c = pathMod.join(process.cwd(), ".env");
      fsSync.accessSync(c);
      return c;
    } catch {
      return null;
    }
  }

  async function writeOne(
    filePath: string,
    key: string,
    value: string,
    mode: number,
  ): Promise<void> {
    await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const lines = existing ? existing.split(/\r?\n/) : [];
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const filtered = lines.filter((line) => {
      const eq = line.indexOf("=");
      if (eq <= 0) return true;
      return line.slice(0, eq).trim() !== key;
    });
    if (value !== "") filtered.push(`${key}=${value}`);
    const tmp = `${filePath}.setup.tmp`;
    await fs.writeFile(tmp, `${filtered.join("\n")}\n`, {
      encoding: "utf8",
      mode,
    });
    await fs.rename(tmp, filePath);
    try {
      await fs.chmod(filePath, mode);
    } catch {
      /* non-fatal */
    }
  }

  return {
    persistKey: async (key, value) => {
      await writeOne(resolveConfigEnvPath(), key, value, 0o600);
      const dot = resolveProjectDotenv();
      if (dot) await writeOne(dot, key, value, 0o600);
      process.env[key] = value;
    },
  };
}

export function getSetupRoutes(mode: "server" | "client"): Route[] {
  if (mode === "client") {
    return [
      {
        type: "POST",
        path: "/v1/billing/validate",
        rawPath: true,
        public: true,
        name: "billing-setup-validate",
        handler: handleClientValidate,
      },
      {
        type: "POST",
        path: "/v1/billing/setup",
        rawPath: true,
        public: true,
        name: "billing-setup",
        handler: handleClientSetup,
      },
    ];
  }
  return setupRoutes;
}
