/**
 * Unit tests for the typed HTTPS gateway client (BILLING_MODE=client).
 *
 * These tests stub `globalThis.fetch` and assert that each client method
 * issues the right HTTP request and surfaces the upstream response.
 *
 * Run alongside the existing plugin tests via `bun run test` /
 * `vitest run` — no PGLite, no DB, no chain.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createGatewayClient,
  createGatewayProxy,
  GatewayProxyError,
  resetGatewayClient,
  getGatewayClient,
} from "../../lib/gateway-proxy.js";

// ---------------------------------------------------------------------------
// fetch stub helpers
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function captureFetch(
  response: {
    status?: number;
    body?: unknown;
    contentType?: string;
    headers?: Record<string, string>;
  } = {},
): { captured: CapturedRequest[]; restore: () => void } {
  const captured: CapturedRequest[] = [];
  const status = response.status ?? 200;
  const contentType = response.contentType ?? "application/json";
  const body = response.body ?? {};
  const extraHeaders = response.headers ?? {};

  const stub = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    // Normalize headers passed into fetch to a plain record.
    const hRecord: Record<string, string> = {};
    const rawHeaders = init?.headers as
      | Record<string, string>
      | undefined
      | Headers;
    if (rawHeaders) {
      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => (hRecord[k.toLowerCase()] = v));
      } else {
        for (const [k, v] of Object.entries(rawHeaders))
          hRecord[k.toLowerCase()] = String(v);
      }
    }
    captured.push({
      url,
      method: init?.method ?? "GET",
      headers: hRecord,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const headers = new Headers({
      "content-type": contentType,
      ...extraHeaders,
    });
    const payload =
      typeof body === "string"
        ? body
        : contentType.includes("json")
          ? JSON.stringify(body)
          : String(body);
    return new Response(payload, { status, headers });
  });

  const original = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let restore: () => void = () => {};

beforeEach(() => {
  resetGatewayClient();
});

afterEach(() => {
  restore();
  resetGatewayClient();
});

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("createGatewayClient()", () => {
  it("strips a trailing slash from baseUrl", async () => {
    const cap = captureFetch();
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com/" });
    await client.health();
    expect(cap.captured[0]!.url).toBe("https://gw.example.com/healthz");
  });

  it("returns a singleton via getGatewayClient() when TOKAGENT_GATEWAY_URL is set", () => {
    // v2.0.5: getGatewayClient throws if TOKAGENT_GATEWAY_URL is unset
    // (self-hosted-first — no default URL). Provide one for this test.
    const prev = process.env.TOKAGENT_GATEWAY_URL;
    process.env.TOKAGENT_GATEWAY_URL = "https://gw-singleton.example.com";
    try {
      resetGatewayClient();
      const a = getGatewayClient();
      const b = getGatewayClient();
      expect(a).toBe(b);
      resetGatewayClient();
      const c = getGatewayClient();
      expect(c).not.toBe(a);
    } finally {
      if (prev === undefined) {
        delete process.env.TOKAGENT_GATEWAY_URL;
      } else {
        process.env.TOKAGENT_GATEWAY_URL = prev;
      }
      resetGatewayClient();
    }
  });

  it("throws GatewayProxyError(503) when TOKAGENT_GATEWAY_URL is unset (v2.0.5 self-hosted-first)", () => {
    const prev = process.env.TOKAGENT_GATEWAY_URL;
    delete process.env.TOKAGENT_GATEWAY_URL;
    try {
      resetGatewayClient();
      expect(() => getGatewayClient()).toThrow(/TOKAGENT_GATEWAY_URL/);
    } finally {
      if (prev !== undefined) process.env.TOKAGENT_GATEWAY_URL = prev;
      resetGatewayClient();
    }
  });
});

// ---------------------------------------------------------------------------
// Endpoint methods — verify correct path, method, headers, body
// ---------------------------------------------------------------------------

describe("GatewayClient endpoint methods", () => {
  it("health() issues GET /healthz", async () => {
    const cap = captureFetch({ body: { ok: true } });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    const res = await client.health();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(cap.captured[0]!.method).toBe("GET");
    expect(cap.captured[0]!.url).toBe("https://gw.example.com/healthz");
  });

  it("billingStatus() issues GET /v1/billing/status", async () => {
    const cap = captureFetch({ body: { enabled: true } });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    await client.billingStatus();
    expect(cap.captured[0]!.url).toBe(
      "https://gw.example.com/v1/billing/status",
    );
  });

  it("authNonceGet() encodes wallet + chainId as query params", async () => {
    const cap = captureFetch({ body: { nonce: "0xabc" } });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    await client.authNonceGet({ wallet: "0xabc", chainId: 1 });
    expect(cap.captured[0]!.url).toContain("wallet=0xabc");
    expect(cap.captured[0]!.url).toContain("chainId=1");
  });

  it("authNoncePost() sends a JSON body", async () => {
    const cap = captureFetch({ body: { nonce: "0x123" } });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    await client.authNoncePost({ wallet: "0xdeadbeef" });
    expect(cap.captured[0]!.method).toBe("POST");
    expect(cap.captured[0]!.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(cap.captured[0]!.body ?? "{}")).toEqual({
      wallet: "0xdeadbeef",
    });
  });

  it("keysList() forwards authorization + x-api-key headers", async () => {
    const cap = captureFetch({ body: { keys: [] } });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    await client.keysList({
      authorization: "Bearer jwt-token",
      "x-api-key": "sk-ai-abc",
    });
    expect(cap.captured[0]!.headers["authorization"]).toBe("Bearer jwt-token");
    expect(cap.captured[0]!.headers["x-api-key"]).toBe("sk-ai-abc");
  });

  it("keysDelete() URL-encodes the id", async () => {
    const cap = captureFetch({ body: null });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    await client.keysDelete({ authorization: "Bearer x" }, "abc/def");
    expect(cap.captured[0]!.url).toBe(
      "https://gw.example.com/v1/keys/abc%2Fdef",
    );
    expect(cap.captured[0]!.method).toBe("DELETE");
  });

  it("messages() returns the raw Response for streaming", async () => {
    const cap = captureFetch({
      body: "stream-chunk-1\nstream-chunk-2",
      contentType: "text/event-stream",
    });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    const res = await client.messages(
      { authorization: "Bearer x" },
      { model: "claude" },
    );
    // Body is null when stream=true so the caller can pipe `raw.body`.
    expect(res.body).toBeNull();
    expect(res.raw).toBeInstanceOf(Response);
  });

  it("usageSummary() includes query params", async () => {
    const cap = captureFetch({ body: { totalInputTokens: 100 } });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    await client.usageSummary(
      { authorization: "Bearer x" },
      { since: "2026-01-01", limit: "50" },
    );
    expect(cap.captured[0]!.url).toContain("since=2026-01-01");
    expect(cap.captured[0]!.url).toContain("limit=50");
  });
});

// ---------------------------------------------------------------------------
// Error surface
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("wraps transport errors in GatewayProxyError with status 502", async () => {
    const stub = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const original = globalThis.fetch;
    globalThis.fetch = stub as unknown as typeof fetch;
    restore = () => {
      globalThis.fetch = original;
    };
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    try {
      await client.health();
      throw new Error("expected GatewayProxyError");
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayProxyError);
      expect((err as GatewayProxyError).status).toBe(502);
      expect((err as GatewayProxyError).message).toContain(
        "Gateway transport error",
      );
    }
  });

  it("times out and surfaces as 502 with timeout marker", async () => {
    // A fetch that never resolves — we set a 5ms timeout to trip the abort.
    const stub = vi.fn(
      async (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            },
            { once: true },
          );
        }),
    );
    const original = globalThis.fetch;
    globalThis.fetch = stub as unknown as typeof fetch;
    restore = () => {
      globalThis.fetch = original;
    };
    const client = createGatewayClient({
      baseUrl: "https://gw.example.com",
      timeoutMs: 5,
    });
    try {
      await client.health();
      throw new Error("expected GatewayProxyError");
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayProxyError);
      expect((err as GatewayProxyError).message).toContain("timed out");
    }
  });

  it("handles non-JSON upstream responses without throwing", async () => {
    const cap = captureFetch({
      body: "<html>oops</html>",
      contentType: "text/html",
    });
    restore = cap.restore;
    const client = createGatewayClient({ baseUrl: "https://gw.example.com" });
    const res = await client.health();
    expect(res.status).toBe(200);
    expect(res.body).toBe("<html>oops</html>");
  });
});

// ---------------------------------------------------------------------------
// Proxy grouping
// ---------------------------------------------------------------------------

describe("createGatewayProxy()", () => {
  it("exposes route-friendly groupings", async () => {
    const cap = captureFetch({ body: { ok: true } });
    restore = cap.restore;
    const proxy = createGatewayProxy({ baseUrl: "https://gw.example.com" });
    await proxy.credits.me({ authorization: "Bearer x" });
    expect(cap.captured[0]!.url).toBe(
      "https://gw.example.com/v1/credits/me",
    );
    await proxy.usage.summary({ authorization: "Bearer y" }, { limit: "10" });
    expect(cap.captured[1]!.url).toContain("/v1/usage/summary?limit=10");
  });
});
