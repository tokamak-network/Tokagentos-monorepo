/**
 * Tests for setup-panel-routes.ts (v2.1.0 mode-picker redesign).
 *
 * The default view is a calm "Connected to Tokagent gateway" hero with a
 * single CTA to the dashboard. A native <details> disclosure reveals the
 * existing 7-field self-host form for advanced users.
 *
 * These tests render the HTML and assert:
 *   - The hero text is present.
 *   - The <details id="advanced-self-host"> block exists.
 *   - All 7 server-mode form fields are inside the advanced section with the
 *     correct `name` attributes.
 *   - The Connect-wallet CTA links to the dashboard.
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

describe("GET /v1/billing/setup-panel — default hero view", () => {
  it("returns 200 with text/html content-type", async () => {
    const route = setupPanelRoutes[0]!;
    const res = makeRes();
    await route.handler!(makeReq(), res as unknown as RouteResponse, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
  });

  it("contains the 'Connected to Tokagent gateway' hero text", async () => {
    const html = await renderPanel();
    expect(html).toContain("Connected to Tokagent gateway");
  });

  it("mentions the hosted gateway URL gateway.tokagent.ai", async () => {
    const html = await renderPanel();
    expect(html).toContain("gateway.tokagent.ai");
  });

  it("provides a Connect-wallet CTA that links to the dashboard", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/href="\/v1\/billing\/dashboard\/"/);
    expect(html).toMatch(/Connect wallet/i);
  });

  it("does NOT show any form input fields above the disclosure (zero default form fields)", async () => {
    const html = await renderPanel();
    // The hero section ends at the <details> block. Everything before it
    // should contain no <input> elements at all.
    const detailsIdx = html.indexOf("<details");
    expect(detailsIdx).toBeGreaterThan(0);
    const heroHtml = html.slice(0, detailsIdx);
    expect(heroHtml).not.toMatch(/<input\b/);
  });
});

describe("GET /v1/billing/setup-panel — advanced self-host disclosure", () => {
  it("contains a <details> block with id='advanced-self-host'", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/<details\s+class="advanced"\s+id="advanced-self-host"/);
  });

  it("has a summary saying 'Advanced: self-host billing'", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/<summary>\s*Advanced: self-host billing\s*<\/summary>/);
  });

  it("contains all 7 server-mode form fields with correct name attributes", async () => {
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
  });

  it("includes the self-host form submit button", async () => {
    const html = await renderPanel();
    expect(html).toMatch(/Save self-hosted config/);
  });

  it("warns about operator-EOA responsibility in the disclosure intro", async () => {
    const html = await renderPanel();
    // HTML may wrap whitespace anywhere in the sentence — match flexibly.
    expect(html).toMatch(/responsible[\s\S]+?for funding[\s\S]+?operator[\s\S]+?EOA/i);
  });

  it("uses a native <details> element so the disclosure works with no JS", async () => {
    const html = await renderPanel();
    // The disclosure widget MUST be a native <details><summary>...</summary>
    // so screen readers and progressive-enhancement clients can use it.
    expect(html).toMatch(/<details\b[^>]*>\s*<summary>/);
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

  it("returns the same single route in server-mode (mode-picker is universal)", () => {
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
