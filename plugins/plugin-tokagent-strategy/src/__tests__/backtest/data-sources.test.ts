import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchHyperliquidFundingHistory, fetchAaveRateHistory } from "../../backtest/data-sources.js";

// ─── fetch mock helper ────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  });
}

function mockFetchError(status: number) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── fetchHyperliquidFundingHistory ───────────────────────────────────────────

describe("fetchHyperliquidFundingHistory", () => {
  it("makes a POST to the Hyperliquid /info endpoint", async () => {
    const rawResponse = [
      { time: 1_700_000_000_000, fundingRate: "0.00125" },
      { time: 1_700_003_600_000, fundingRate: "0.00130" },
    ];
    mockFetchOk(rawResponse);

    await fetchHyperliquidFundingHistory("BTC", 1_700_000_000_000, 1_700_007_200_000);

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.hyperliquid.xyz/info");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.type).toBe("fundingHistory");
    expect(body.coin).toBe("BTC");
  });

  it("parses response and returns sorted BacktestDataPoints", async () => {
    // Return unsorted to verify sort is applied
    const rawResponse = [
      { time: 1_700_003_600_000, fundingRate: "0.0013" },
      { time: 1_700_000_000_000, fundingRate: "0.00125" },
    ];
    mockFetchOk(rawResponse);

    const result = await fetchHyperliquidFundingHistory("ETH", 0, 9_999_999_999_999);

    expect(result).toHaveLength(2);
    // Should be sorted ascending by ts
    expect(result[0].ts).toBeLessThan(result[1].ts);
    expect(result[0].funding).toBeCloseTo(0.00125);
    expect(result[1].funding).toBeCloseTo(0.0013);
  });

  it("throws on non-ok HTTP status", async () => {
    mockFetchError(500);
    await expect(
      fetchHyperliquidFundingHistory("BTC", 0, 1),
    ).rejects.toThrow("hyperliquid fundingHistory failed: 500");
  });

  it("throws when response is not an array", async () => {
    mockFetchOk({ unexpected: "shape" });
    await expect(
      fetchHyperliquidFundingHistory("BTC", 0, 1),
    ).rejects.toThrow();
  });

  it("returns empty array for empty response", async () => {
    mockFetchOk([]);
    const result = await fetchHyperliquidFundingHistory("BTC", 0, 1);
    expect(result).toEqual([]);
  });

  it("sends startTime and endTime from fromMs/toMs", async () => {
    mockFetchOk([]);
    await fetchHyperliquidFundingHistory("SOL", 1_234_000, 5_678_000);
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.startTime).toBe(1_234_000);
    expect(body.endTime).toBe(5_678_000);
  });
});

// ─── fetchAaveRateHistory ─────────────────────────────────────────────────────

describe("fetchAaveRateHistory", () => {
  it("makes a POST to the Aave v3 Polygon subgraph", async () => {
    mockFetchOk({ data: { reserveParamsHistoryItems: [] } });

    await fetchAaveRateHistory(
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      1_700_000_000_000,
      1_700_007_200_000,
    );

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("thegraph.com");
    expect(url).toContain("aave");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.query).toContain("reserveParamsHistoryItems");
  });

  it("converts liquidityRate from ray (1e27) to fraction", async () => {
    // 5% APY = 0.05 as fraction = 5e25 in ray
    const rayValue = "50000000000000000000000000"; // 5e25 as string
    mockFetchOk({
      data: {
        reserveParamsHistoryItems: [
          { timestamp: 1_700_000, liquidityRate: rayValue },
        ],
      },
    });

    const result = await fetchAaveRateHistory("0xreserve", 0, 9_999_999_999_999);
    expect(result).toHaveLength(1);
    expect(result[0].liquidityRate).toBeCloseTo(0.05, 5);
    expect(result[0].ts).toBe(1_700_000 * 1000); // converted to ms
  });

  it("returns empty array when subgraph returns empty items", async () => {
    mockFetchOk({ data: { reserveParamsHistoryItems: [] } });
    const result = await fetchAaveRateHistory("0xreserve", 0, 1);
    expect(result).toEqual([]);
  });

  it("throws on non-ok HTTP status", async () => {
    mockFetchError(503);
    await expect(
      fetchAaveRateHistory("0xreserve", 0, 1),
    ).rejects.toThrow("aave subgraph failed: 503");
  });

  it("throws when subgraph returns errors field", async () => {
    mockFetchOk({ errors: [{ message: "field not found" }] });
    await expect(
      fetchAaveRateHistory("0xreserve", 0, 1),
    ).rejects.toThrow("aave subgraph returned errors");
  });

  it("encodes reserveId and timestamp range in GraphQL query", async () => {
    mockFetchOk({ data: { reserveParamsHistoryItems: [] } });
    const reserveId = "0xabc123def456";
    await fetchAaveRateHistory(reserveId, 1_000_000_000, 2_000_000_000);
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.query).toContain(reserveId);
    // fromMs=1000000000 → fromSec=1000000 → timestamp_gt: 1000000
    expect(body.query).toContain("timestamp_gt: 1000000");
    expect(body.query).toContain("timestamp_lt: 2000000");
  });
});
