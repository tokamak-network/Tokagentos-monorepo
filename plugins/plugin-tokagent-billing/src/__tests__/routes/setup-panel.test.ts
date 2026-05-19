/**
 * Tests for setup-panel-routes.ts (v2.0.7 Railway-hosted-first redesign).
 *
 * The default view IS the calm hero "Connected to Tokamak billing gateway"
 * showing the Railway URL. Below the hero is a simple gateway-URL override
 * field (client section). The 7-field self-hosted server-mode setup form is
 * behind a native <details id="self-host-disclosure"> disclosure at the bottom.
 *
 * These tests render the HTML and assert:
 *   - The hero section is present with the Railway URL.
 *   - The Railway URL appears in the hero (billing-service-production-a8e7.up.railway.app).
 *   - A gatewayUrl field is present in the client section (OUTSIDE the disclosure).
 *   - A <details id="self-host-disclosure"> block exists for the self-host form.
 *   - All 7 server-mode form fields are inside the self-host disclosure.
 *   - Inline help text is still present (Docker Postgres, public RPCs, mainnet addrs,
 *     `cast wallet new`, `openssl rand -hex 32`).
 *   - The "Use mainnet defaults" button is inside the disclosure.
 *   - The fictional fictional hosted URL from 2.0.4 does NOT appear anywhere.
 *   - BILLING_SETUP_ENABLED=false short-circuits to 403.
 *   - getSetupPanelRoutes returns the same single route in both modes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IAgentRuntime, RouteRequest, RouteResponse } from "@tokagentos/core";
import {
  setupPanelRoutes,
  getSetupPanelRoutes,
} from "../../routes/setup-panel-routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WriteHeadCall = { code: number; headers: Record<string, string> };

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHeadCalls: WriteHeadCall[];
  writeHead(code: number, headers: Record<string, string>): void;
  end(body: string): void;
  status(code: number): { json(b: unknown): void; send(b: string): void };
  send(body: string): void;
  json(body: unknown): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHeadCalls: [],
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
      this.writeHeadCalls.push({ code, headers });
    },
    end(body) {
      this.body = body;
    },
    status(code) {
      this.statusCode = code;
      return {
        json: (b) => {
          this.body = JSON.stringify(b);
        },
        send: (b) => {
          this.body = b;
        },
      };
    },
    send(body) {
      this.body = body;
    },
    json(body) {
      this.body = JSON.stringify(body);
    },
  };
  return res;
}

function makeReq(): RouteRequest {
  return { headers: {}, query: {}, params: {} } as RouteRequest;
}

const fakeRuntime = {} as unknown as IAgentRuntime;

const RAILWAY_URL = "billing-service-production-a8e7.up.railway.app";

async function renderPanel(): Promise<string> {
  const route = setupPanelRoutes[0]!;
  const res = makeRes();
  await route.handler!(makeReq(), res as unknown as RouteResponse, fakeRuntime);
  expect(res.statusCode).toBe(200);
  return res.body;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  delete process.env.BILLING_SETUP_ENABLED;
});

afterEach(() => {
  delete process.env.BILLING_SETUP_ENABLED;
});

// ---------------------------------------------------------------------------
// HTML content — hero section (v2.0.7 default view)
// ---------------------------------------------------------------------------

describe("GET /v1/billing/setup-panel — hero section (v2.0.7 default)", () => {
  it("returns 200 with text/html content-type", async () => {
    const route = setupPanelRoutes[0]!;
    const res = makeRes();
    await route.handler!(makeReq(), res as unknown as RouteResponse, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
  });

  it("contains the 'Connected to Tokamak billing gateway' hero badge", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Connected to Tokamak billing gateway/i);
  });

  it("contains the Railway URL in the hero", async () => {
    const html = await renderPanel();
    expect(html).toContain(RAILWAY_URL);
  });

  it("hero URL appears before the self-host disclosure", async () => {
    const html = await renderPanel();
    const railwayIdx = html.indexOf(RAILWAY_URL);
    const disclosureIdx = html.indexOf("self-host-disclosure");
    expect(railwayIdx).toBeGreaterThan(0);
    expect(disclosureIdx).toBeGreaterThan(railwayIdx);
  });

  it("does NOT contain the fictional hosted-gateway URL from 2.0.4", async () => {
    // Regression guard. URL built from parts so a verbatim string-grep across
    // the codebase stays clean — the literal hostname should appear nowhere.
    const html = await renderPanel();
    const fictionalUrl = ["gateway", "tokagent", "ai"].join(".");
    expect(html).not.toContain(fictionalUrl);
  });
});

// ---------------------------------------------------------------------------
// Client gateway URL section (outside the disclosure)
// ---------------------------------------------------------------------------

describe("GET /v1/billing/setup-panel — client gateway URL section", () => {
  it("contains a gatewayUrl input field for the URL override", async () => {
    const html = await renderPanel();
    expect(html).toContain(`name="gatewayUrl"`);
  });

  it("gatewayUrl input appears BEFORE the self-host disclosure", async () => {
    const html = await renderPanel();
    const gatewayIdx = html.indexOf(`name="gatewayUrl"`);
    const disclosureIdx = html.indexOf("self-host-disclosure");
    expect(gatewayIdx).toBeGreaterThan(0);
    expect(disclosureIdx).toBeGreaterThan(gatewayIdx);
  });

  it("contains a 'Save gateway URL' or save button for the client URL field", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Save gateway URL/i);
  });
});

// ---------------------------------------------------------------------------
// Self-host disclosure (advanced — behind <details>)
// ---------------------------------------------------------------------------

describe("GET /v1/billing/setup-panel — self-host disclosure", () => {
  it("contains a <details id='self-host-disclosure'> block", async () => {
    const html = await renderPanel();
    expect(html).toContain(`id="self-host-disclosure"`);
    expect(html).toMatch(/<details[^>]+self-host/);
  });

  it("has a summary about self-hosting", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Advanced.*self-host/i);
  });

  it("contains all 7 server-mode form fields inside the self-host disclosure", async () => {
    const html = await renderPanel();
    const disclosureStart = html.indexOf("self-host-disclosure");
    expect(disclosureStart).toBeGreaterThan(0);
    const selfHostSection = html.slice(disclosureStart);
    const required = [
      "databaseUrl",
      "chainRpcUrl",
      "chainId",
      "vaultAddress",
      "ptonAddress",
      "operatorPrivateKey",
      "authSecret",
    ];
    for (const name of required) {
      expect(selfHostSection).toContain(`name="${name}"`);
    }
  });

  it("includes the 'Use mainnet defaults' button inside the self-host disclosure", async () => {
    const html = await renderPanel();
    const disclosureStart = html.indexOf("self-host-disclosure");
    const selfHostSection = html.slice(disclosureStart);
    expect(selfHostSection).toMatch(/Use mainnet defaults/);
  });

  it("includes the self-host form submit button inside the disclosure", async () => {
    const html = await renderPanel();
    const disclosureStart = html.indexOf("self-host-disclosure");
    const selfHostSection = html.slice(disclosureStart);
    expect(selfHostSection).toMatch(/Save self-hosted config/);
  });

  it("uses a native <details> element so the disclosure works with no JS", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/<details\b[^>]*>\s*<summary>/);
  });
});

// ---------------------------------------------------------------------------
// Inline help text (still present, just inside the disclosure)
// ---------------------------------------------------------------------------

describe("GET /v1/billing/setup-panel — inline help text", () => {
  it("Database field help mentions the Docker Postgres one-liner", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/docker run.*postgres:16/);
    expect(html).toMatch(/Any Postgres 14\+/);
  });

  it("Chain RPC help lists the public Ethereum endpoints", async () => {
    const html = await renderPanel();
    expect(html).toContain("https://eth.llamarpc.com");
    expect(html).toContain("https://rpc.ankr.com/eth");
    expect(html).toContain("https://ethereum.publicnode.com");
  });

  it("ClaudeVault help shows the canonical mainnet address", async () => {
    const html = await renderPanel();
    expect(html).toContain("0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F");
  });

  it("PTON help shows the canonical mainnet address", async () => {
    const html = await renderPanel();
    expect(html).toContain("0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0");
  });

  it("Operator key help mentions `cast wallet new` and gas funding", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/cast wallet new/);
    expect(html).toMatch(/0\.1 ETH/);
    expect(html).toMatch(/OPERATOR_ROLE/);
  });

  it("Auth secret help mentions `openssl rand -hex 32`", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/openssl rand -hex 32/);
  });

  it("uses small.hint blocks for inline help", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/<small class="hint">/);
  });
});

// ---------------------------------------------------------------------------
// Auth + gating
// ---------------------------------------------------------------------------

describe("BILLING_SETUP_ENABLED gating", () => {
  it("returns 403 when BILLING_SETUP_ENABLED=false", async () => {
    process.env.BILLING_SETUP_ENABLED = "false";
    const route = setupPanelRoutes[0]!;
    const res = makeRes();
    await route.handler!(makeReq(), res as unknown as RouteResponse, fakeRuntime);
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 when BILLING_SETUP_ENABLED is unset (default enabled)", async () => {
    const route = setupPanelRoutes[0]!;
    const res = makeRes();
    await route.handler!(makeReq(), res as unknown as RouteResponse, fakeRuntime);
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Mode-aware factory
// ---------------------------------------------------------------------------

describe("getSetupPanelRoutes(mode)", () => {
  it("returns a single route in client-mode", () => {
    const routes = getSetupPanelRoutes("client");
    expect(routes).toHaveLength(1);
    expect(routes[0]!.path).toBe("/v1/billing/setup-panel");
  });

  it("returns the same single route in server-mode (panel is universal)", () => {
    const clientRoutes = getSetupPanelRoutes("client");
    const serverRoutes = getSetupPanelRoutes("server");
    expect(clientRoutes).toEqual(serverRoutes);
  });
});

// ---------------------------------------------------------------------------
// Route definition shape
// ---------------------------------------------------------------------------

describe("setupPanelRoutes export", () => {
  it("exposes exactly one GET route on /v1/billing/setup-panel", () => {
    expect(setupPanelRoutes).toHaveLength(1);
    const r = setupPanelRoutes[0]!;
    expect(r.type).toBe("GET");
    expect(r.path).toBe("/v1/billing/setup-panel");
    expect(r.public).toBe(true);
    expect(r.rawPath).toBe(true);
  });
});
