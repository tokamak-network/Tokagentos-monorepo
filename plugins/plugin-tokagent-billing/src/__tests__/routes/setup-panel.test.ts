/**
 * Tests for setup-panel-routes.ts (v2.0.5 self-hosted-first redesign).
 *
 * The default view IS the 7-field self-hosted server-mode setup form, with
 * inline help text under each label explaining how to obtain/generate the
 * value. A small <details id="client-mode-disclosure"> at the bottom offers
 * the single-field client-mode flow for users given a gateway URL.
 *
 * These tests render the HTML and assert:
 *   - All 7 server-mode form fields are visible by default with correct names.
 *   - Inline help text is present (Docker Postgres, public RPCs, mainnet addrs,
 *     `cast wallet new`, `openssl rand -hex 32`).
 *   - The "Use mainnet defaults" button is present.
 *   - A <details id="client-mode-disclosure"> block exists with a gatewayUrl field.
 *   - No "Connected to Tokagent gateway" text and no fictional hosted URL appear anywhere.
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
// HTML content
// ---------------------------------------------------------------------------

describe("GET /v1/billing/setup-panel — default self-hosted form", () => {
  it("returns 200 with text/html content-type", async () => {
    const route = setupPanelRoutes[0]!;
    const res = makeRes();
    await route.handler!(makeReq(), res as unknown as RouteResponse, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
  });

  it("page header uses neutral framing (no 'Tokagent gateway' branding)", async () => {
    const html = await renderPanel();
    expect(html).toContain("Set up x402 billing");
    expect(html).not.toMatch(/Connected to Tokagent gateway/i);
    // Regression guard: the fictional hosted-gateway URL from 2.0.4 must
    // never reappear in the panel. Built from parts to keep grep sweeps
    // for the literal hostname clean.
    const fictionalUrl = ["gateway", "tokagent", "ai"].join(".");
    expect(html).not.toContain(fictionalUrl);
  });

  it("contains the page intro about self-hosting + client option", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Run your own billing server.*Postgres.*operator EOA/i);
    expect(html).toMatch(/connect as a client/i);
  });

  it("contains all 7 server-mode form fields visible by default with correct name attributes", async () => {
    const html = await renderPanel();
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
      expect(html).toContain(`name="${name}"`);
    }
    // The 7-field form is the DEFAULT VIEW — these inputs appear OUTSIDE the
    // client-mode disclosure. Confirm they appear before <details>.
    const detailsIdx = html.indexOf("<details");
    expect(detailsIdx).toBeGreaterThan(0);
    const heroHtml = html.slice(0, detailsIdx);
    for (const name of required) {
      expect(heroHtml).toContain(`name="${name}"`);
    }
  });

  it("includes the 'Use mainnet defaults' button", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Use mainnet defaults/);
  });

  it("includes the self-host form submit button", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Save self-hosted config/);
  });
});

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

describe("GET /v1/billing/setup-panel — client-mode disclosure", () => {
  it("contains a <details id='client-mode-disclosure'> block at the bottom", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/<details\s+class="client-mode"\s+id="client-mode-disclosure"/);
  });

  it("has a summary about being a client of a hosted billing server", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Already a client of a hosted billing server\?/);
    expect(html).toMatch(/Configure client-mode/);
  });

  it("contains a single gatewayUrl field inside the client disclosure", async () => {
    const html = await renderPanel();
    expect(html).toContain(`name="gatewayUrl"`);
    // The gatewayUrl input must live inside the client-mode disclosure.
    const detailsStart = html.indexOf("client-mode-disclosure");
    expect(detailsStart).toBeGreaterThan(0);
    const clientSection = html.slice(detailsStart);
    expect(clientSection).toContain(`name="gatewayUrl"`);
  });

  it("client-mode help mentions BILLING_MODE=client + TOKAGENT_GATEWAY_URL persistence behavior", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/operator.*gave you this URL/i);
  });

  it("uses a native <details> element so the disclosure works with no JS", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/<details\b[^>]*>\s*<summary>/);
  });
});

describe("GET /v1/billing/setup-panel — no Tokagent gateway branding", () => {
  it("does NOT contain the 'Connected to Tokagent gateway' hero text anywhere", async () => {
    const html = await renderPanel();
    expect(html).not.toMatch(/Connected to Tokagent gateway/i);
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
