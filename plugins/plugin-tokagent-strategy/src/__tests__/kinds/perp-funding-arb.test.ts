import { describe, expect, it, vi, afterEach } from "vitest";
import { perpFundingArbKind } from "../../kinds/perp-funding-arb.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VAULT = {
  chainId: 999,
  address: "0xVault000000000000000000000000000000001" as `0x${string}`,
};
const FAKE_RUNTIME = { getSetting: (_k: string) => null } as any;

const DEFAULT_PARAMS = {
  symbols: ["BTC", "ETH", "SOL"],
  minFundingSpreadBps: 50,
  maxPositionUsd: 1000,
};

/**
 * Build a fake metaAndAssetCtxs response.
 * universe: list of {name, szDecimals}
 * assetCtxs: matching list of {funding, ...}
 */
function makeFakeHLResponse(
  assets: Array<{ name: string; funding: string }>,
): [{ universe: Array<{ name: string; szDecimals: number }> }, Array<{ funding: string }>] {
  return [
    { universe: assets.map((a) => ({ name: a.name, szDecimals: 0 })) },
    assets.map((a) => ({ funding: a.funding, openInterest: "0", prevDayPx: "0", dayNtlVlm: "0", premium: "0", oraclePx: "0", markPx: "0", midPx: "0", impactPxs: null })),
  ];
}

function mockFetch(response: unknown, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Internal Server Error",
    json: vi.fn().mockResolvedValue(response),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("perpFundingArbKind", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("paramSchema", () => {
    it("accepts valid params", () => {
      const r = perpFundingArbKind.paramSchema.safeParse({
        symbols: ["BTC", "ETH"],
        minFundingSpreadBps: 50,
        maxPositionUsd: 1000,
      });
      expect(r.success).toBe(true);
    });

    it("rejects single symbol (min 2)", () => {
      const r = perpFundingArbKind.paramSchema.safeParse({
        symbols: ["BTC"],
        minFundingSpreadBps: 50,
        maxPositionUsd: 1000,
      });
      expect(r.success).toBe(false);
    });

    it("rejects more than 10 symbols", () => {
      const r = perpFundingArbKind.paramSchema.safeParse({
        symbols: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
        minFundingSpreadBps: 50,
        maxPositionUsd: 1000,
      });
      expect(r.success).toBe(false);
    });

    it("rejects zero minFundingSpreadBps", () => {
      const r = perpFundingArbKind.paramSchema.safeParse({
        symbols: ["BTC", "ETH"],
        minFundingSpreadBps: 0,
        maxPositionUsd: 1000,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("evaluate — spread below threshold", () => {
    it("returns shouldExecute=false when spread < minFundingSpreadBps", async () => {
      // BTC: 0.0001 (1bps/hr), ETH: 0.00008 (0.8bps/hr), SOL: 0.00005 (0.5bps/hr)
      // spread = (0.0001 - 0.00005) * 10000 = 0.5 bps → well below 50bps threshold
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.0001" },
        { name: "ETH", funding: "0.00008" },
        { name: "SOL", funding: "0.00005" },
      ]);
      mockFetch(hlResp);

      const result = await perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);

      expect(result.shouldExecute).toBe(false);
      expect(result.summary).toContain("below threshold");
      expect(result.summary).toContain("BTC");
      expect(result.summary).toContain("ETH");
      expect(result.summary).toContain("SOL");
    });

    it("includes bps and rates in summary", async () => {
      // BTC: 0.001 (10bps/hr), ETH: 0.0005 (5bps/hr)
      // spread fraction = 0.001 - 0.0005 = 0.0005 → 5bps (below 50bps threshold)
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.001" },
        { name: "ETH", funding: "0.0005" },
      ]);
      mockFetch(hlResp);

      const params = { ...DEFAULT_PARAMS, symbols: ["BTC", "ETH"], minFundingSpreadBps: 50 };
      const result = await perpFundingArbKind.evaluate(params, VAULT, FAKE_RUNTIME);

      // spread = 5bps, threshold = 50bps → no trade
      expect(result.summary).toContain("5bps");
      expect(result.context?.["spreadBps"]).toBe(5);
    });
  });

  describe("evaluate — spread above threshold", () => {
    it("returns shouldExecute=true when spread >= threshold", async () => {
      // BTC: 0.01 (100bps/hr), ETH: 0.001 (10bps/hr), SOL: 0.005 (50bps/hr)
      // spread = (0.01 - 0.001) * 10000 = 90bps → above 50bps threshold
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.01" },
        { name: "ETH", funding: "0.001" },
        { name: "SOL", funding: "0.005" },
      ]);
      mockFetch(hlResp);

      const result = await perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);

      expect(result.shouldExecute).toBe(true);
    });

    it("context has longSymbol, shortSymbol, spreadBps, fundingRates", async () => {
      // ETH has lowest funding (0.001 = 10bps) → long ETH
      // BTC has highest funding (0.01 = 100bps) → short BTC
      // spread = 90bps > 50bps threshold
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.01" },   // highest → short
        { name: "ETH", funding: "0.001" },  // lowest → long
        { name: "SOL", funding: "0.005" },
      ]);
      mockFetch(hlResp);

      const result = await perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);

      expect(result.context?.["longSymbol"]).toBe("ETH");
      expect(result.context?.["shortSymbol"]).toBe("BTC");
      expect(result.context?.["spreadBps"]).toBeGreaterThan(50);
      const rates = result.context?.["fundingRates"] as Record<string, number>;
      expect(rates).toHaveProperty("BTC");
      expect(rates).toHaveProperty("ETH");
    });

    it("summary mentions long/short symbols and spread", async () => {
      // BTC: 0.01 (100bps/hr), ETH: 0.001 (10bps/hr) → 90bps > 50bps threshold
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.01" },
        { name: "ETH", funding: "0.001" },
      ]);
      mockFetch(hlResp);

      const params = { symbols: ["BTC", "ETH"], minFundingSpreadBps: 50, maxPositionUsd: 1000 };
      const result = await perpFundingArbKind.evaluate(params, VAULT, FAKE_RUNTIME);

      expect(result.summary).toContain("Long ETH");
      expect(result.summary).toContain("Short BTC");
    });
  });

  describe("evaluate — exact threshold boundary", () => {
    it("returns shouldExecute=true when spread exactly equals threshold", async () => {
      // threshold = 50 bps; spread = exactly 50 bps
      // funding_hi - funding_lo = 0.005 in decimal (= 50 bps)
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.006" },
        { name: "ETH", funding: "0.001" },
      ]);
      mockFetch(hlResp);

      const params = { symbols: ["BTC", "ETH"], minFundingSpreadBps: 50, maxPositionUsd: 1000 };
      const result = await perpFundingArbKind.evaluate(params, VAULT, FAKE_RUNTIME);

      expect(result.context?.["spreadBps"]).toBe(50);
      expect(result.shouldExecute).toBe(true);
    });
  });

  describe("evaluate — error handling", () => {
    it("throws when a requested symbol is not found", async () => {
      const hlResp = makeFakeHLResponse([
        { name: "BTC", funding: "0.001" },
        // ETH and SOL missing
      ]);
      mockFetch(hlResp);

      await expect(
        perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME),
      ).rejects.toThrow("not found on Hyperliquid");
    });

    it("throws on HTTP error", async () => {
      mockFetch({}, false, 500);
      await expect(
        perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME),
      ).rejects.toThrow("HTTP 500");
    });

    it("throws on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      await expect(
        perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME),
      ).rejects.toThrow("ECONNREFUSED");
    });

    it("throws on unexpected API response structure", async () => {
      mockFetch({ unexpected: "shape" });
      await expect(
        perpFundingArbKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME),
      ).rejects.toThrow("Unexpected Hyperliquid API response");
    });
  });

  describe("execute — stub", () => {
    it("throws with 'not yet implemented' message mentioning HyperliquidAdapter", async () => {
      await expect(
        perpFundingArbKind.execute(DEFAULT_PARAMS, VAULT, undefined, FAKE_RUNTIME),
      ).rejects.toThrow(/not yet implemented/);
    });

    it("error message mentions HyperliquidAdapter integration", async () => {
      let caught: Error | undefined;
      try {
        await perpFundingArbKind.execute(DEFAULT_PARAMS, VAULT, undefined, FAKE_RUNTIME);
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught!.message).toContain("HyperliquidAdapter");
    });

    it("error message mentions testing mode workaround", async () => {
      let caught: Error | undefined;
      try {
        await perpFundingArbKind.execute(DEFAULT_PARAMS, VAULT, undefined, FAKE_RUNTIME);
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught!.message).toContain("testing");
    });
  });

  describe("kind metadata", () => {
    it("has kind = perp-funding-arb", () => {
      expect(perpFundingArbKind.kind).toBe("perp-funding-arb");
    });
  });
});
