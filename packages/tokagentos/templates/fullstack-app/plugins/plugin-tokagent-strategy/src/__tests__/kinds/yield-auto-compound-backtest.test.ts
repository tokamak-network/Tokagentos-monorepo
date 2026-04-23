import { describe, expect, it, vi, afterEach } from "vitest";

// ─── Mock viem (required by kind imports) ─────────────────────────────────────

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: vi.fn() })),
    http: vi.fn(() => "http-transport"),
    encodeFunctionData: actual.encodeFunctionData,
  };
});

vi.mock("viem/chains", () => ({
  polygon: { id: 137, name: "Polygon" },
}));

vi.mock("@tokagent/plugin-tokagent-shared", () => ({
  TokagentVaultClient: class {
    executeBatch = vi.fn();
  },
  resolveAgentPrivateKey: vi.fn().mockReturnValue("0xkey"),
  getWalletClient: vi.fn().mockReturnValue({}),
}));

// ─── Mock data-sources ────────────────────────────────────────────────────────

const mockFetchAaveRateHistory = vi.fn();
vi.mock("../../backtest/data-sources.js", () => ({
  fetchAaveRateHistory: (...args: unknown[]) => mockFetchAaveRateHistory(...args),
  fetchHyperliquidFundingHistory: vi.fn(),
}));

import { yieldAutoCompoundKind } from "../../kinds/yield-auto-compound.js";
import type { BacktestContext } from "../../backtest/types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLYGON_VAULT = {
  chainId: 137,
  address: "0xVault000000000000000000000000000000001" as `0x${string}`,
};

const HYPEREVM_VAULT = {
  chainId: 999,
  address: "0xVault000000000000000000000000000000002" as `0x${string}`,
};

const PARAMS = { asset: "USDC" as const, minHarvestAmount: 10 };

const ONE_DAY_MS = 24 * 3600 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

const NOW = 1_700_000_000_000;

const BASE_CTX: BacktestContext = {
  fromMs: NOW - THIRTY_DAYS_MS,
  toMs: NOW,
  stepMs: ONE_DAY_MS,
};

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("yieldAutoCompoundKind.backtest", () => {
  it("returns supported=false for non-Polygon chainId", async () => {
    const result = await (yieldAutoCompoundKind as any).backtest(
      PARAMS,
      BASE_CTX,
      HYPEREVM_VAULT,
    );
    expect(result.supported).toBe(false);
    expect(result.reason).toContain("137");
    expect(result.reason).toContain("999");
  });

  it("returns supported=true run with insufficient data warning when fewer than 2 points", async () => {
    mockFetchAaveRateHistory.mockResolvedValue([{ ts: NOW - 1000, liquidityRate: 0.05 }]);

    const result = await (yieldAutoCompoundKind as any).backtest(
      PARAMS,
      BASE_CTX,
      POLYGON_VAULT,
    );
    expect(result.supported).toBe(true);
    expect(result.run).toBeDefined();
    expect(result.run.totalTicks).toBe(0);
    expect(result.run.warnings.some((w: string) => w.includes("fewer than 2"))).toBe(true);
  });

  it("returns supported=true with a populated run for sufficient data", async () => {
    // Provide 30 daily data points at 5% APY
    const dataPoints = Array.from({ length: 30 }, (_, i) => ({
      ts: NOW - THIRTY_DAYS_MS + i * ONE_DAY_MS,
      liquidityRate: 0.05,
    }));
    mockFetchAaveRateHistory.mockResolvedValue(dataPoints);

    const result = await (yieldAutoCompoundKind as any).backtest(
      PARAMS,
      BASE_CTX,
      POLYGON_VAULT,
    );
    expect(result.supported).toBe(true);
    expect(result.run).toBeDefined();
    expect(result.run.totalTicks).toBeGreaterThan(0);
    expect(result.run.signalCount).toBeGreaterThan(0);
    // 5% APY over 30 days ≈ 5% * (30/365) ≈ 0.411% fractional P&L
    expect(result.run.pnlPctHypothetical).toBeGreaterThan(0);
    expect(result.run.pnlPctHypothetical).toBeLessThan(0.05); // well under full year
  });

  it("calls fetchAaveRateHistory with the correct reserve ID", async () => {
    mockFetchAaveRateHistory.mockResolvedValue([
      { ts: NOW - 1000, liquidityRate: 0.04 },
      { ts: NOW, liquidityRate: 0.04 },
    ]);

    await (yieldAutoCompoundKind as any).backtest(PARAMS, BASE_CTX, POLYGON_VAULT);

    expect(mockFetchAaveRateHistory).toHaveBeenCalledWith(
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      BASE_CTX.fromMs,
      BASE_CTX.toMs,
    );
  });

  it("run includes warnings about backtest assumptions", async () => {
    const dataPoints = Array.from({ length: 10 }, (_, i) => ({
      ts: NOW - THIRTY_DAYS_MS + i * ONE_DAY_MS * 3,
      liquidityRate: 0.04,
    }));
    mockFetchAaveRateHistory.mockResolvedValue(dataPoints);

    const result = await (yieldAutoCompoundKind as any).backtest(
      PARAMS,
      BASE_CTX,
      POLYGON_VAULT,
    );
    expect(result.run.warnings.length).toBeGreaterThan(0);
  });

  it("propagates fetchAaveRateHistory errors as thrown exceptions", async () => {
    mockFetchAaveRateHistory.mockRejectedValue(new Error("aave subgraph unavailable"));

    await expect(
      (yieldAutoCompoundKind as any).backtest(PARAMS, BASE_CTX, POLYGON_VAULT),
    ).rejects.toThrow("aave subgraph unavailable");
  });
});
