import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { polymarketValueHuntKind } from "../../kinds/polymarket-value-hunt.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const VAULT = {
  chainId: 137,
  address: "0xVault000000000000000000000000000000001" as `0x${string}`,
};
const FAKE_RUNTIME = { getSetting: (_k: string) => null } as any;

const DEFAULT_PARAMS = {
  minMarketVolume: 1000,
  minMispricingPct: 5,
  maxMarkets: 10,
};

// Build a fake Gamma market response
function makeFakeMarket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "market-1",
    question: "Will X happen before Y?",
    slug: "will-x-happen",
    volume: "500000",
    bestBid: "0.40",
    bestAsk: "0.60",
    lastTradePrice: "0.50",
    active: true,
    closed: false,
    ...overrides,
  };
}

// Helper to mock global fetch
function mockFetch(response: unknown, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    json: vi.fn().mockResolvedValue(response),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("polymarketValueHuntKind", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("paramSchema", () => {
    it("accepts valid params", () => {
      const r = polymarketValueHuntKind.paramSchema.safeParse({
        minMarketVolume: 1000,
        minMispricingPct: 5,
        maxMarkets: 10,
      });
      expect(r.success).toBe(true);
    });

    it("rejects maxMarkets > 20", () => {
      const r = polymarketValueHuntKind.paramSchema.safeParse({
        minMarketVolume: 1000,
        minMispricingPct: 5,
        maxMarkets: 21,
      });
      expect(r.success).toBe(false);
    });

    it("rejects zero minMispricingPct", () => {
      const r = polymarketValueHuntKind.paramSchema.safeParse({
        minMarketVolume: 1000,
        minMispricingPct: 0,
        maxMarkets: 5,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("evaluate", () => {
    it("always returns shouldExecute=false", async () => {
      mockFetch([makeFakeMarket()]);
      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      expect(result.shouldExecute).toBe(false);
    });

    it("returns summary with scanned count when no mispricing found", async () => {
      // A tight-spread market — not flagged
      const market = makeFakeMarket({
        bestBid: "0.49",
        bestAsk: "0.51",
        lastTradePrice: "0.50",
      });
      mockFetch([market]);

      const result = await polymarketValueHuntKind.evaluate(
        { ...DEFAULT_PARAMS, minMispricingPct: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      expect(result.summary).toContain("Scanned 1 markets");
      expect(result.summary).toContain("no markets flagged");
      expect(result.context?.["flaggedMarkets"]).toEqual([]);
    });

    it("flags market with wide spread exceeding threshold", async () => {
      // spread = (0.80 - 0.20) / 0.50 * 100 = 120% > 5%
      const market = makeFakeMarket({
        bestBid: "0.20",
        bestAsk: "0.80",
        lastTradePrice: "0.50",
      });
      mockFetch([market]);

      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      const flagged = result.context?.["flaggedMarkets"] as Array<{ reason: string }>;
      expect(flagged).toHaveLength(1);
      expect(flagged[0].reason).toContain("wide spread");
      expect(result.summary).toContain("flagged 1");
    });

    it("flags market where lastTradePrice drifted from midpoint beyond threshold", async () => {
      // Use a very narrow spread that is BELOW the threshold (won't trigger spread rule)
      // bestBid=0.490, bestAsk=0.510 → midpoint=0.500, spreadPct=(0.020/0.500)*100 = 4% < 5%
      // lastTradePrice=0.39 → drift = |0.39-0.50|/0.50*100 = 22% > 5% threshold
      const market = makeFakeMarket({
        bestBid: "0.490",
        bestAsk: "0.510",
        lastTradePrice: "0.39", // far from midpoint 0.50 → 22% drift
      });
      mockFetch([market]);

      const result = await polymarketValueHuntKind.evaluate(
        { ...DEFAULT_PARAMS, minMispricingPct: 5 },
        VAULT,
        FAKE_RUNTIME,
      );
      const flagged = result.context?.["flaggedMarkets"] as Array<{ reason: string }>;
      expect(flagged).toHaveLength(1);
      expect(flagged[0].reason).toContain("drifted");
    });

    it("skips markets with no bid/ask data", async () => {
      const market = makeFakeMarket({ bestBid: undefined, bestAsk: undefined });
      mockFetch([market]);

      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      expect((result.context?.["flaggedMarkets"] as unknown[]).length).toBe(0);
    });

    it("caps summary at 5 flagged markets", async () => {
      // Create 8 wide-spread markets
      const markets = Array.from({ length: 8 }, (_, i) =>
        makeFakeMarket({
          id: `market-${i}`,
          question: `Market ${i}`,
          bestBid: "0.10",
          bestAsk: "0.90",
        }),
      );
      mockFetch(markets);

      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      // All 8 should be in context
      expect((result.context?.["flaggedMarkets"] as unknown[]).length).toBe(8);
      // But summary only shows first 5 bullet points + "and N more"
      expect(result.summary).toContain("and 3 more");
    });

    it("handles fetch error gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network timeout"));

      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      expect(result.shouldExecute).toBe(false);
      expect(result.summary).toContain("failed to fetch");
      expect(result.summary).toContain("network timeout");
    });

    it("handles non-200 HTTP response", async () => {
      mockFetch({}, false, 503);

      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      expect(result.summary).toContain("failed to fetch");
      expect(result.summary).toContain("503");
    });

    it("handles API returning object with markets property", async () => {
      const market = makeFakeMarket({ bestBid: "0.20", bestAsk: "0.80" });
      mockFetch({ markets: [market] });

      const result = await polymarketValueHuntKind.evaluate(DEFAULT_PARAMS, VAULT, FAKE_RUNTIME);
      // Should still find the market
      expect(result.context?.["scannedCount"]).toBe(1);
    });
  });

  describe("execute", () => {
    it("always throws with alert-only message", async () => {
      await expect(
        polymarketValueHuntKind.execute(DEFAULT_PARAMS, VAULT, undefined, FAKE_RUNTIME),
      ).rejects.toThrow("alert-only");
    });
  });

  describe("kind metadata", () => {
    it("has kind = polymarket-value-hunt", () => {
      expect(polymarketValueHuntKind.kind).toBe("polymarket-value-hunt");
    });
  });
});
