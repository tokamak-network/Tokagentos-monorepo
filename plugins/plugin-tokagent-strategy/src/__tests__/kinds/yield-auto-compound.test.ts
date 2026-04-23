import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock viem ────────────────────────────────────────────────────────────────

const mockReadContract = vi.fn();
const mockWriteContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
    http: vi.fn(() => "http-transport"),
    encodeFunctionData: actual.encodeFunctionData,
  };
});

vi.mock("viem/chains", () => ({
  polygon: { id: 137, name: "Polygon" },
}));

// ─── Mock shared plugin ───────────────────────────────────────────────────────

const mockExecuteBatch = vi.fn();

vi.mock("@tokagent/plugin-tokagent-shared", () => {
  class MockTokagentVaultClient {
    executeBatch = mockExecuteBatch;
  }
  return {
    TokagentVaultClient: MockTokagentVaultClient,
    resolveAgentPrivateKey: vi.fn().mockReturnValue(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ),
    getWalletClient: vi.fn().mockReturnValue({
      account: { address: "0xOperator0000000000000000000000000000001" },
      chain: { id: 137 },
    }),
  };
});

import { yieldAutoCompoundKind } from "../../kinds/yield-auto-compound.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT = {
  chainId: 137,
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as `0x${string}`,
};
const FAKE_RUNTIME = {
  getSetting: (_k: string) => null,
} as any;

// 20 USDC.e in 6-decimal raw units
const TWENTY_USDC_RAW = 20_000_000n;
// 50 aUSDC.e in raw units
const FIFTY_A_USDC_RAW = 50_000_000n;
// currentLiquidityRate in ray (≈5% APY)
const LIQUIDITY_RATE_RAY = 50_000_000_000_000_000_000_000_000n; // 5e25 ≈ 5%

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("yieldAutoCompoundKind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("paramSchema", () => {
    it("accepts valid USDC params", () => {
      const result = yieldAutoCompoundKind.paramSchema.safeParse({
        asset: "USDC",
        minHarvestAmount: 10,
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional targetApy", () => {
      const result = yieldAutoCompoundKind.paramSchema.safeParse({
        asset: "USDC",
        minHarvestAmount: 50,
        targetApy: 5.5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid asset", () => {
      const result = yieldAutoCompoundKind.paramSchema.safeParse({
        asset: "DAI",
        minHarvestAmount: 10,
      });
      expect(result.success).toBe(false);
    });

    it("rejects zero minHarvestAmount", () => {
      const result = yieldAutoCompoundKind.paramSchema.safeParse({
        asset: "USDC",
        minHarvestAmount: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("evaluate — below threshold (no-op)", () => {
    beforeEach(() => {
      // USDC balance < minHarvestAmount (5 USDC < 10)
      const FIVE_USDC_RAW = 5_000_000n;
      mockReadContract
        .mockResolvedValueOnce(FIVE_USDC_RAW)           // balanceOf USDC.e
        .mockResolvedValueOnce(FIFTY_A_USDC_RAW)        // balanceOf aUSDC.e
        .mockResolvedValueOnce({ currentLiquidityRate: LIQUIDITY_RATE_RAY }); // getReserveData
    });

    it("returns shouldExecute=false with informative summary", async () => {
      const result = await yieldAutoCompoundKind.evaluate(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      expect(result.shouldExecute).toBe(false);
      expect(result.summary).toContain("nothing to compound");
      expect(result.summary).toContain("5.00");    // $5 balance
      expect(result.summary).toContain("10");       // minHarvestAmount
    });

    it("does not set context", async () => {
      const result = await yieldAutoCompoundKind.evaluate(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      // context is undefined or empty — execute should not be called
      expect(result.context?.["amountToSupply"]).toBeUndefined();
    });
  });

  describe("evaluate — above threshold (will supply)", () => {
    beforeEach(() => {
      mockReadContract
        .mockResolvedValueOnce(TWENTY_USDC_RAW)         // balanceOf USDC.e = $20
        .mockResolvedValueOnce(FIFTY_A_USDC_RAW)        // balanceOf aUSDC.e = $50
        .mockResolvedValueOnce({ currentLiquidityRate: LIQUIDITY_RATE_RAY });
    });

    it("returns shouldExecute=true", async () => {
      const result = await yieldAutoCompoundKind.evaluate(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      expect(result.shouldExecute).toBe(true);
    });

    it("sets amountToSupply in context as string", async () => {
      const result = await yieldAutoCompoundKind.evaluate(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      expect(result.context?.["amountToSupply"]).toBe(TWENTY_USDC_RAW.toString());
    });

    it("summary mentions vault balance and Aave deposit", async () => {
      const result = await yieldAutoCompoundKind.evaluate(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      expect(result.summary).toContain("20.00");
      expect(result.summary).toContain("Aave");
    });
  });

  describe("evaluate — APY read failure is non-fatal", () => {
    it("proceeds even when getReserveData throws", async () => {
      mockReadContract
        .mockResolvedValueOnce(TWENTY_USDC_RAW)
        .mockResolvedValueOnce(FIFTY_A_USDC_RAW)
        .mockRejectedValueOnce(new Error("RPC error"));

      const result = await yieldAutoCompoundKind.evaluate(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        FAKE_RUNTIME,
      );
      expect(result.shouldExecute).toBe(true);
      expect(result.summary).toContain("0.00%"); // APY defaults to 0 on error
    });
  });

  describe("execute", () => {
    it("calls executeBatch with Pool.supply calldata for correct amount", async () => {
      const FAKE_TX = "0xTxHashFakeBeef0000000000000000000000000001";
      mockExecuteBatch.mockResolvedValue(FAKE_TX);

      const context = { amountToSupply: TWENTY_USDC_RAW.toString(), amountHuman: 20 };
      const result = await yieldAutoCompoundKind.execute(
        { asset: "USDC", minHarvestAmount: 10 },
        VAULT,
        context,
        FAKE_RUNTIME,
      );

      expect(result.txHashes).toEqual([FAKE_TX]);
      expect(result.summary).toContain("20.00");
      expect(result.summary).toContain("Aave v3");

      // Verify the call structure
      expect(mockExecuteBatch).toHaveBeenCalledOnce();
      const [calls] = mockExecuteBatch.mock.calls[0] as any[];
      expect(calls).toHaveLength(1);
      expect(calls[0].target).toBe("0x794a61358D6845594F94dc1DB02A252b5b4814aD"); // Aave Pool

      // The calldata should start with the Pool.supply selector 0x617ba037
      expect(calls[0].data.startsWith("0x617ba037")).toBe(true);
    });

    it("encodes correct Pool.supply calldata with vault as onBehalfOf", async () => {
      mockExecuteBatch.mockResolvedValue("0xTx");
      const context = { amountToSupply: "5000000", amountHuman: 5 };
      await yieldAutoCompoundKind.execute(
        { asset: "USDC", minHarvestAmount: 1 },
        VAULT,
        context,
        FAKE_RUNTIME,
      );

      const [calls] = mockExecuteBatch.mock.calls[0] as any[];
      const calldata: string = calls[0].data;
      // onBehalfOf = vault address should appear in calldata (padded to 32 bytes)
      // strip the "0x" prefix and lowercase for comparison
      const vaultHex = VAULT.address.slice(2).toLowerCase();
      expect(calldata.toLowerCase()).toContain(vaultHex.toLowerCase());
    });

    it("throws if context is missing", async () => {
      await expect(
        yieldAutoCompoundKind.execute(
          { asset: "USDC", minHarvestAmount: 10 },
          VAULT,
          undefined,
          FAKE_RUNTIME,
        ),
      ).rejects.toThrow();
    });
  });

  describe("kind metadata", () => {
    it("has kind = yield-auto-compound", () => {
      expect(yieldAutoCompoundKind.kind).toBe("yield-auto-compound");
    });
  });
});
