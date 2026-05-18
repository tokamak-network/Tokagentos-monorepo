/**
 * Integration tests for BILLING_MODE=client.
 *
 * Boots the route factories with a mocked fetch, hits every forwarder
 * endpoint, and asserts the request lands on the right upstream URL with
 * the right method/headers/body — proving the client-mode dispatch path
 * is wired end-to-end without spinning up a real gateway or DB.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Route, RouteRequest, RouteResponse } from "@tokagentos/core";
import { loadBillingConfig } from "@tokagentos/billing";

import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../state.js";
import { createGatewayProxy } from "../lib/gateway-proxy.js";

import { getAuthRoutes } from "../routes/auth-routes.js";
import { getKeysRoutes } from "../routes/keys-routes.js";
import { getCreditsRoutes } from "../routes/credits-routes.js";
import { getTopupRoutes } from "../routes/topup-routes.js";
import { getUsageRoutes } from "../routes/usage-routes.js";
import { getEstimateRoutes } from "../routes/estimate-routes.js";
import { getDashboardRoutes } from "../routes/dashboard-routes.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const GATEWAY = "https://gw-fixture.example.com";

interface CapturedFetch {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function mountFetch(
  responseBody: unknown = { ok: true },
  status = 200,
): { captured: CapturedFetch[]; restore: () => void } {
  const captured: CapturedFetch[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
      } else {
        for (const [k, v] of Object.entries(
          init.headers as Record<string, string>,
        )) {
          headers[k.toLowerCase()] = String(v);
        }
      }
    }
    captured.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function makeRes() {
  let _status = 200;
  let _body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) {
      _status = code;
      return res;
    },
    json(data: unknown) {
      _body = data;
      return res;
    },
    send(data: unknown) {
      _body = data;
      return res;
    },
    end() {
      return res;
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return res;
    },
    get statusCode() {
      return _status;
    },
    get body() {
      return _body;
    },
    get capturedHeaders() {
      return headers;
    },
  };
  return res as unknown as RouteResponse & {
    statusCode: number;
    body: unknown;
    capturedHeaders: Record<string, string>;
  };
}

function makeReq(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    headers: { authorization: "Bearer test-jwt" },
    query: {},
    params: {},
    ...overrides,
  };
}

function findRoute(routes: Route[], method: string, path: string): Route {
  const r = routes.find((r) => r.type === method && r.path === path);
  if (!r) throw new Error(`Route not found: ${method} ${path}`);
  return r;
}

const fakeRuntime = {} as Parameters<NonNullable<Route["handler"]>>[2];

// ---------------------------------------------------------------------------
// Lifecycle — install client-mode state before every test
// ---------------------------------------------------------------------------

let restoreFetch: () => void = () => {};

beforeEach(async () => {
  await clearBillingState();
  const config = loadBillingConfig({
    BILLING_MODE: "client",
    TOKAGENT_GATEWAY_URL: GATEWAY,
  } as NodeJS.ProcessEnv);
  setBillingState({
    config,
    gateway: createGatewayProxy({ baseUrl: GATEWAY }),
  } as BillingPluginState);
});

afterEach(async () => {
  restoreFetch();
  await clearBillingState();
});

// ---------------------------------------------------------------------------
// Config sanity
// ---------------------------------------------------------------------------

describe("BILLING_MODE=client config loading", () => {
  it("defaults TOKAGENT_GATEWAY_URL to the hosted gateway when mode=client and URL unset (v2.1.0)", () => {
    const c = loadBillingConfig({
      BILLING_MODE: "client",
    } as NodeJS.ProcessEnv);
    expect(c.billingMode).toBe("client");
    expect(c.gatewayUrl).toBe("https://gateway.tokagent.ai");
  });

  it("defaults billingMode to 'client' when not set (v2.1.0 default flip)", () => {
    const c = loadBillingConfig({} as NodeJS.ProcessEnv);
    expect(c.billingMode).toBe("client");
    expect(c.gatewayUrl).toBe("https://gateway.tokagent.ai");
  });

  it("defaults BILLING_ENABLED=true in client-mode when unset (v2.1.0)", () => {
    const c = loadBillingConfig({} as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(true);
  });

  it("respects explicit BILLING_ENABLED=false even in client-mode", () => {
    const c = loadBillingConfig({
      BILLING_ENABLED: "false",
    } as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(false);
  });

  it("accepts 'client' + a custom URL and exposes gateway fields", () => {
    const c = loadBillingConfig({
      BILLING_MODE: "client",
      TOKAGENT_GATEWAY_URL: GATEWAY,
    } as NodeJS.ProcessEnv);
    expect(c.billingMode).toBe("client");
    expect(c.gatewayUrl).toBe(GATEWAY);
    expect(c.gatewayTimeoutMs).toBe(30_000);
  });

  it("explicit BILLING_MODE=server keeps the server-mode default for BILLING_ENABLED (false)", () => {
    const c = loadBillingConfig({
      BILLING_MODE: "server",
    } as NodeJS.ProcessEnv);
    expect(c.billingMode).toBe("server");
    expect(c.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route factory shape
// ---------------------------------------------------------------------------

describe("route factories in client-mode", () => {
  it("returns the same number of routes as server-mode for each tier", () => {
    expect(getAuthRoutes("client").length).toBe(getAuthRoutes("server").length);
    expect(getKeysRoutes("client").length).toBe(getKeysRoutes("server").length);
    expect(getCreditsRoutes("client").length).toBe(
      getCreditsRoutes("server").length,
    );
    expect(getTopupRoutes("client").length).toBe(
      getTopupRoutes("server").length,
    );
    expect(getUsageRoutes("client").length).toBe(
      getUsageRoutes("server").length,
    );
    expect(getEstimateRoutes("client").length).toBe(
      getEstimateRoutes("server").length,
    );
  });

  it("returns the same dashboard array in both modes", () => {
    expect(getDashboardRoutes("client")).toEqual(getDashboardRoutes("server"));
  });
});

// ---------------------------------------------------------------------------
// Forwarder smoke tests — one per major endpoint
// ---------------------------------------------------------------------------

describe("client-mode forwarders", () => {
  it("GET /v1/credits/me forwards to gateway with auth header", async () => {
    const cap = mountFetch({ wallet: "0xabc", balance: "1000" });
    restoreFetch = cap.restore;
    const route = findRoute(getCreditsRoutes("client"), "GET", "/v1/credits/me");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ wallet: "0xabc", balance: "1000" });
    expect(cap.captured).toHaveLength(1);
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/credits/me`);
    expect(cap.captured[0]!.method).toBe("GET");
    expect(cap.captured[0]!.headers["authorization"]).toBe("Bearer test-jwt");
  });

  it("GET /v1/keys forwards", async () => {
    const cap = mountFetch({ keys: [] });
    restoreFetch = cap.restore;
    const route = findRoute(getKeysRoutes("client"), "GET", "/v1/keys");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/keys`);
  });

  it("POST /v1/keys forwards the body", async () => {
    const cap = mountFetch({ id: "k1", key: "sk-ai-xyz" }, 201);
    restoreFetch = cap.restore;
    const route = findRoute(getKeysRoutes("client"), "POST", "/v1/keys");
    const res = makeRes();
    await route.handler!(
      makeReq({ body: { name: "ci-key" } }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(201);
    expect(cap.captured[0]!.method).toBe("POST");
    expect(JSON.parse(cap.captured[0]!.body ?? "{}")).toEqual({
      name: "ci-key",
    });
  });

  it("DELETE /v1/keys/:id encodes the id", async () => {
    const cap = mountFetch(null);
    restoreFetch = cap.restore;
    const route = findRoute(getKeysRoutes("client"), "DELETE", "/v1/keys/:id");
    const res = makeRes();
    await route.handler!(
      makeReq({ params: { id: "abc/def" } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/keys/abc%2Fdef`);
    expect(cap.captured[0]!.method).toBe("DELETE");
  });

  it("POST /v1/auth/nonce forwards body", async () => {
    const cap = mountFetch({ nonce: "0xfeed" });
    restoreFetch = cap.restore;
    const route = findRoute(getAuthRoutes("client"), "POST", "/v1/auth/nonce");
    const res = makeRes();
    await route.handler!(
      makeReq({ body: { wallet: "0xdead" } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/auth/nonce`);
    expect(JSON.parse(cap.captured[0]!.body ?? "{}")).toEqual({
      wallet: "0xdead",
    });
  });

  it("GET /v1/auth/nonce flattens query params", async () => {
    const cap = mountFetch({ nonce: "0xbeef" });
    restoreFetch = cap.restore;
    const route = findRoute(getAuthRoutes("client"), "GET", "/v1/auth/nonce");
    const res = makeRes();
    await route.handler!(
      makeReq({ query: { wallet: "0xabc", chainId: "1" } }),
      res,
      fakeRuntime,
    );
    const url = cap.captured[0]!.url;
    expect(url.startsWith(`${GATEWAY}/v1/auth/nonce?`)).toBe(true);
    expect(url).toContain("wallet=0xabc");
    expect(url).toContain("chainId=1");
  });

  it("POST /v1/auth/login forwards", async () => {
    const cap = mountFetch({ token: "jwt", exp: 1, wallet: "0xabc" });
    restoreFetch = cap.restore;
    const route = findRoute(getAuthRoutes("client"), "POST", "/v1/auth/login");
    const res = makeRes();
    await route.handler!(
      makeReq({ body: { wallet: "0xabc", signature: "0xsig" } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/auth/login`);
  });

  it("GET /v1/topup/info forwards", async () => {
    const cap = mountFetch({ vaultAddress: "0xvault" });
    restoreFetch = cap.restore;
    const route = findRoute(getTopupRoutes("client"), "GET", "/v1/topup/info");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/topup/info`);
  });

  it("POST /v1/topup/quote forwards the body", async () => {
    const cap = mountFetch({ topupId: "abc", amountPton: "100" });
    restoreFetch = cap.restore;
    const route = findRoute(getTopupRoutes("client"), "POST", "/v1/topup/quote");
    const res = makeRes();
    await route.handler!(
      makeReq({ body: { amountUsd: 5 } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/topup/quote`);
    expect(JSON.parse(cap.captured[0]!.body ?? "{}")).toEqual({ amountUsd: 5 });
  });

  it("POST /v1/topup/settle forwards x-payment header", async () => {
    const cap = mountFetch({ txHash: "0xtx", ok: true });
    restoreFetch = cap.restore;
    const route = findRoute(
      getTopupRoutes("client"),
      "POST",
      "/v1/topup/settle",
    );
    const res = makeRes();
    await route.handler!(
      makeReq({
        headers: {
          authorization: "Bearer test-jwt",
          "x-payment": "base64payload",
        },
        body: { topupId: "abc" },
      }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.headers["x-payment"]).toBe("base64payload");
  });

  it("GET /v1/quote/:id encodes the id", async () => {
    const cap = mountFetch({ topupId: "x/y" });
    restoreFetch = cap.restore;
    const route = findRoute(getTopupRoutes("client"), "GET", "/v1/quote/:id");
    const res = makeRes();
    await route.handler!(
      makeReq({ params: { id: "x/y" } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/quote/x%2Fy`);
  });

  it("GET /v1/usage/summary forwards query params", async () => {
    const cap = mountFetch({ totalInputTokens: 100 });
    restoreFetch = cap.restore;
    const route = findRoute(
      getUsageRoutes("client"),
      "GET",
      "/v1/usage/summary",
    );
    const res = makeRes();
    await route.handler!(
      makeReq({ query: { since: "2026-01-01" } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toContain("since=2026-01-01");
  });

  it("GET /v1/stats forwards unauthenticated", async () => {
    const cap = mountFetch({ totalWallets: 42 });
    restoreFetch = cap.restore;
    const route = findRoute(getUsageRoutes("client"), "GET", "/v1/stats");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/stats`);
  });

  it("POST /v1/estimate forwards body", async () => {
    const cap = mountFetch({ maxCostUsd: 0.001 });
    restoreFetch = cap.restore;
    const route = findRoute(getEstimateRoutes("client"), "POST", "/v1/estimate");
    const res = makeRes();
    await route.handler!(
      makeReq({
        body: { model: "claude-sonnet-4-6", messages: [], max_tokens: 4 },
      }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/estimate`);
  });

  it("POST /v1/messages/count_tokens forwards", async () => {
    const cap = mountFetch({ input_tokens: 5 });
    restoreFetch = cap.restore;
    const route = findRoute(
      getEstimateRoutes("client"),
      "POST",
      "/v1/messages/count_tokens",
    );
    const res = makeRes();
    await route.handler!(
      makeReq({ body: { model: "claude", messages: [] } }),
      res,
      fakeRuntime,
    );
    expect(cap.captured[0]!.url).toBe(
      `${GATEWAY}/v1/messages/count_tokens`,
    );
  });

  it("GET /v1/price forwards", async () => {
    const cap = mountFetch({ tonUsd: 0.05 });
    restoreFetch = cap.restore;
    const route = findRoute(getEstimateRoutes("client"), "GET", "/v1/price");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(cap.captured[0]!.url).toBe(`${GATEWAY}/v1/price`);
  });
});

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

describe("client-mode error envelope", () => {
  it("returns 503 when state is not initialized", async () => {
    await clearBillingState();
    const route = findRoute(getCreditsRoutes("client"), "GET", "/v1/credits/me");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("surfaces transport failures as 502", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("network unreachable");
    }) as unknown as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };
    const route = findRoute(getCreditsRoutes("client"), "GET", "/v1/credits/me");
    const res = makeRes();
    await route.handler!(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(502);
    expect((res.body as { type?: string }).type).toBe("gateway_error");
  });
});
