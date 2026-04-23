import { describe, expect, it, vi, afterEach } from "vitest";

// ─── Mock @tokagent/plugin-tokagent-perps ─────────────────────────────────────

vi.mock("@tokagent/plugin-tokagent-perps", () => ({
  buildLimitOrderCall: vi.fn(),
  resolveAssetInfo: vi.fn(),
}));

vi.mock("@tokagent/plugin-tokagent-shared", () => ({
  TokagentVaultClient: class {
    executeBatch = vi.fn();
  },
  resolveAgentPrivateKey: vi.fn().mockReturnValue("0xkey"),
  getWalletClient: vi.fn().mockReturnValue({}),
  getPublicClient: vi.fn().mockReturnValue({}),
}));

// ─── Mock data-sources ────────────────────────────────────────────────────────

const mockFetchHL = vi.fn();
vi.mock("../../backtest/data-sources.js", () => ({
  fetchHyperliquidFundingHistory: (...args: unknown[]) => mockFetchHL(...args),
  fetchAaveRateHistory: vi.fn(),
}));

import { perpFundingArbKind } from "../../kinds/perp-funding-arb.js";
import type { BacktestContext } from "../../backtest/types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT = {
  chainId: 999,
  address: "0xVault000000000000000000000000000000001" as `0x${string}`,
};

const ONE_HOUR_MS = 3600 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * ONE_HOUR_MS;
const NOW = 1_700_000_000_000;

const BASE_CTX: BacktestContext = {
  fromMs: NOW - THIRTY_DAYS_MS,
  toMs: NOW,
  stepMs: ONE_HOUR_MS,
};

const BASE_PARAMS = {
  symbols: ["BTC", "ETH"],
  minFundingSpreadBps: 50,
  maxPositionUsd: 1000,
};

// Helper: generate hourly data for a symbol with constant funding
function makeHourlyData(fromMs: number, toMs: number, funding: number) {
  const points = [];
  for (let ts = fromMs; ts <= toMs; ts += ONE_HOUR_MS) {
    points.push({ ts, funding });
  }
  return points;
}

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("perpFundingArbKind.backtest", () => {
  it("returns supported=true with a run for 2 symbols with wide spread", async () => {
    // BTC: 0.01/hr (100 bps), ETH: 0.001/hr (10 bps) → spread = 90 bps > 50 bps threshold
    mockFetchHL
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.01))
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.001));

    const result = await (perpFundingArbKind as any).backtest(BASE_PARAMS, BASE_CTX, VAULT);

    expect(result.supported).toBe(true);
    expect(result.run).toBeDefined();
    expect(result.run.signalCount).toBeGreaterThan(0);
    expect(result.run.pnlPctHypothetical).toBeGreaterThan(0);
  });

  it("returns zero signals when spread is below threshold", async () => {
    // BTC: 0.003/hr (30 bps), ETH: 0.001/hr (10 bps) → spread = 20 bps < 50 bps threshold
    mockFetchHL
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.003))
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.001));

    const result = await (perpFundingArbKind as any).backtest(BASE_PARAMS, BASE_CTX, VAULT);

    expect(result.supported).toBe(true);
    expect(result.run.signalCount).toBe(0);
    expect(result.run.pnlPctHypothetical).toBe(0);
  });

  it("calls fetchHyperliquidFundingHistory for each symbol", async () => {
    const data = makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.01);
    mockFetchHL.mockResolvedValue(data);

    await (perpFundingArbKind as any).backtest(BASE_PARAMS, BASE_CTX, VAULT);

    expect(mockFetchHL).toHaveBeenCalledTimes(2);
    const calls = mockFetchHL.mock.calls as [string, number, number][];
    const calledSymbols = calls.map(([sym]) => sym);
    expect(calledSymbols).toContain("BTC");
    expect(calledSymbols).toContain("ETH");
  });

  it("returns insufficient data run when one symbol has fewer than 2 points", async () => {
    mockFetchHL
      .mockResolvedValueOnce([{ ts: NOW, funding: 0.01 }]) // only 1 point
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.001));

    const result = await (perpFundingArbKind as any).backtest(BASE_PARAMS, BASE_CTX, VAULT);

    expect(result.supported).toBe(true);
    expect(result.run.totalTicks).toBe(0);
    expect(result.run.summary.toLowerCase()).toContain("insufficient");
  });

  it("merges multi-symbol series into composite data points", async () => {
    // Two symbols with different timestamps
    const btcData = [
      { ts: NOW - ONE_HOUR_MS * 2, funding: 0.01 },
      { ts: NOW - ONE_HOUR_MS, funding: 0.01 },
      { ts: NOW, funding: 0.01 },
    ];
    const ethData = [
      { ts: NOW - ONE_HOUR_MS * 2, funding: 0.001 },
      { ts: NOW - ONE_HOUR_MS, funding: 0.001 },
      { ts: NOW, funding: 0.001 },
    ];
    mockFetchHL
      .mockResolvedValueOnce(btcData)
      .mockResolvedValueOnce(ethData);

    const ctx: BacktestContext = {
      fromMs: NOW - ONE_HOUR_MS * 2,
      toMs: NOW,
      stepMs: ONE_HOUR_MS,
    };

    const result = await (perpFundingArbKind as any).backtest(BASE_PARAMS, ctx, VAULT);

    expect(result.supported).toBe(true);
    expect(result.run.totalTicks).toBe(3); // 3 hourly ticks
    expect(result.run.signalCount).toBe(3); // 90bps spread on every tick
  });

  it("run includes warnings about backtest assumptions", async () => {
    mockFetchHL.mockResolvedValue(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.01));

    const result = await (perpFundingArbKind as any).backtest(BASE_PARAMS, BASE_CTX, VAULT);

    expect(result.run.warnings.length).toBeGreaterThan(0);
    // Should mention slippage or fees
    const warningsText = result.run.warnings.join(" ");
    expect(warningsText.toLowerCase()).toMatch(/slippage|fee/);
  });

  it("propagates fetchHyperliquidFundingHistory errors", async () => {
    mockFetchHL.mockRejectedValue(new Error("HL API timeout"));

    await expect(
      (perpFundingArbKind as any).backtest(BASE_PARAMS, BASE_CTX, VAULT),
    ).rejects.toThrow("HL API timeout");
  });

  it("works with 3 symbols, picks max-min spread", async () => {
    // BTC: 0.01/hr (100 bps), ETH: 0.001/hr (10 bps), SOL: 0.005/hr (50 bps)
    // Spread = BTC - ETH = 90 bps > 50 bps threshold
    mockFetchHL
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.01))
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.001))
      .mockResolvedValueOnce(makeHourlyData(BASE_CTX.fromMs, BASE_CTX.toMs, 0.005));

    const params3sym = { ...BASE_PARAMS, symbols: ["BTC", "ETH", "SOL"] };
    const result = await (perpFundingArbKind as any).backtest(params3sym, BASE_CTX, VAULT);

    expect(result.supported).toBe(true);
    expect(result.run.signalCount).toBeGreaterThan(0);
  });
});
