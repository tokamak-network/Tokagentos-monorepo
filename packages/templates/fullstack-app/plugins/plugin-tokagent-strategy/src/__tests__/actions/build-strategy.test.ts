import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock @elizaos/core ────────────────────────────────────────────────────

const mockUseModel = vi.fn();

vi.mock("@elizaos/core", () => ({
  ModelType: {
    TEXT_LARGE: "TEXT_LARGE",
  },
}));

// ─── Mock persistence ─────────────────────────────────────────────────────────

const mockSaveStrategy = vi.fn();
vi.mock("../../persistence.js", () => ({
  saveStrategy: (...args: unknown[]) => mockSaveStrategy(...args),
}));

// ─── Mock kind-registry ───────────────────────────────────────────────────────

vi.mock("../../kind-registry.js", () => ({
  getKind: vi.fn(),
}));

import { buildStrategyAction } from "../../actions/build-strategy.js";
import { getKind } from "../../kind-registry.js";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_VAULT = "0xDeadBeef00000000000000000000000000000001";
const VALID_CHAIN = "polygon";

function makeRuntime(llmResponse: string) {
  return {
    getSetting: (_k: string) => null,
    useModel: mockUseModel.mockResolvedValue(llmResponse),
  } as any;
}

function makeOptions(params: Record<string, unknown>) {
  return { parameters: params } as any;
}

// Canonical LLM JSON for yield-auto-compound
const VALID_YIELD_JSON = JSON.stringify({
  name: "USDC Auto-Compound",
  description: "Automatically supplies idle USDC.e into Aave v3 to earn yield.",
  kind: "yield-auto-compound",
  params: {
    asset: "USDC",
    minHarvestAmount: 10,
  },
  scheduleEveryMs: 86400000,
});

// Canonical LLM JSON for perp-funding-arb
const VALID_PERP_JSON = JSON.stringify({
  name: "BTC/ETH Funding Arb",
  description: "Monitors BTC and ETH funding rates on Hyperliquid for arbitrage opportunities.",
  kind: "perp-funding-arb",
  params: {
    symbols: ["BTC", "ETH"],
    minFundingSpreadBps: 50,
    maxPositionUsd: 1000,
  },
  scheduleEveryMs: 3600000,
});

// Canonical LLM JSON for polymarket-value-hunt
const VALID_POLY_JSON = JSON.stringify({
  name: "Polymarket Value Hunt",
  description: "Scans active markets for potential mispricings.",
  kind: "polymarket-value-hunt",
  params: {
    minMarketVolume: 5000,
    minMispricingPct: 5,
    maxMarkets: 10,
  },
  scheduleEveryMs: 3600000,
});

// Zod schemas matching each kind (replicated here so we can mock getKind properly)
const yieldSchema = z.object({
  asset: z.enum(["USDC"]),
  minHarvestAmount: z.number().positive(),
  targetApy: z.number().positive().optional(),
});

const perpSchema = z.object({
  symbols: z.array(z.string()).min(2).max(10),
  minFundingSpreadBps: z.number().positive(),
  maxPositionUsd: z.number().positive(),
});

const polySchema = z.object({
  minMarketVolume: z.number().positive(),
  minMispricingPct: z.number().positive(),
  maxMarkets: z.number().int().positive().max(20),
});

function mockKindImpl(kind: string, schema: z.ZodTypeAny) {
  vi.mocked(getKind).mockReturnValue({
    kind: kind as any,
    paramSchema: schema,
    evaluate: vi.fn(),
    execute: vi.fn(),
  } as any);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildStrategyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveStrategy.mockResolvedValue(undefined);
  });

  describe("action metadata", () => {
    it("has name BUILD_STRATEGY", () => {
      expect(buildStrategyAction.name).toBe("BUILD_STRATEGY");
    });

    it("has 3 parameters: description, vaultAddress, chain", () => {
      expect(buildStrategyAction.parameters).toHaveLength(3);
      const names = buildStrategyAction.parameters!.map((p) => p.name);
      expect(names).toContain("description");
      expect(names).toContain("vaultAddress");
      expect(names).toContain("chain");
    });

    it("all params are required", () => {
      for (const p of buildStrategyAction.parameters!) {
        expect(p.required).toBe(true);
      }
    });

    it("has non-empty similes", () => {
      expect((buildStrategyAction.similes?.length ?? 0) > 0).toBe(true);
    });

    it("has examples", () => {
      expect((buildStrategyAction.examples?.length ?? 0) > 0).toBe(true);
    });

    it("validate always returns true", async () => {
      const result = await buildStrategyAction.validate!({} as any, {} as any);
      expect(result).toBe(true);
    });
  });

  describe("handler — parameter validation", () => {
    it("fails when description is empty", async () => {
      const runtime = makeRuntime("{}");
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("description");
    });

    it("fails when vaultAddress is invalid", async () => {
      const runtime = makeRuntime("{}");
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: "not-an-address", chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("vaultAddress");
    });

    it("fails when chain is unsupported", async () => {
      const runtime = makeRuntime("{}");
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: "solana" }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("Unsupported chain");
    });
  });

  describe("handler — happy path: yield-auto-compound", () => {
    beforeEach(() => {
      mockKindImpl("yield-auto-compound", yieldSchema);
    });

    it("succeeds and saves a draft strategy", async () => {
      const runtime = makeRuntime(VALID_YIELD_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Auto-compound USDC", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );

      expect(result?.success).toBe(true);
      expect(mockSaveStrategy).toHaveBeenCalledOnce();
    });

    it("returns strategy in data with id, kind, status=draft", async () => {
      const runtime = makeRuntime(VALID_YIELD_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Auto-compound USDC", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );

      const strategy = result?.data?.["strategy"] as any;
      expect(strategy).toBeDefined();
      expect(strategy.id).toBeTruthy();
      expect(strategy.status).toBe("draft");
      expect(strategy.kind).toBe("yield-auto-compound");
      expect(strategy.vault.address).toBe(VALID_VAULT);
      expect(strategy.vault.chainId).toBe(137); // polygon
    });

    it("text includes strategy id and next-step instructions", async () => {
      const runtime = makeRuntime(VALID_YIELD_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Auto-compound USDC", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );

      expect(result?.text).toContain("draft");
      expect(result?.text).toContain("START_STRATEGY");
      expect(result?.text).toContain("testing");
      expect(result?.text).toContain("active");
    });

    it("works with ethereum chain (chainId=1)", async () => {
      const runtime = makeRuntime(VALID_YIELD_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Auto-compound USDC", vaultAddress: VALID_VAULT, chain: "ethereum" }),
      );
      expect(result?.success).toBe(true);
      const strategy = result?.data?.["strategy"] as any;
      expect(strategy.vault.chainId).toBe(1);
    });

    it("works with hyperevm chain (chainId=999)", async () => {
      const runtime = makeRuntime(VALID_YIELD_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Yield", vaultAddress: VALID_VAULT, chain: "hyperevm" }),
      );
      expect(result?.success).toBe(true);
      const strategy = result?.data?.["strategy"] as any;
      expect(strategy.vault.chainId).toBe(999);
    });
  });

  describe("handler — happy path: perp-funding-arb", () => {
    beforeEach(() => {
      mockKindImpl("perp-funding-arb", perpSchema);
    });

    it("succeeds for perp-funding-arb", async () => {
      const runtime = makeRuntime(VALID_PERP_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "BTC/ETH funding arb", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(true);
      const strategy = result?.data?.["strategy"] as any;
      expect(strategy.kind).toBe("perp-funding-arb");
    });
  });

  describe("handler — happy path: polymarket-value-hunt", () => {
    beforeEach(() => {
      mockKindImpl("polymarket-value-hunt", polySchema);
    });

    it("succeeds for polymarket-value-hunt", async () => {
      const runtime = makeRuntime(VALID_POLY_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Polymarket mispricing", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(true);
      const strategy = result?.data?.["strategy"] as any;
      expect(strategy.kind).toBe("polymarket-value-hunt");
    });
  });

  describe("handler — LLM error paths", () => {
    it("fails when LLM returns no JSON object", async () => {
      const runtime = makeRuntime("I cannot help with that.");
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("Could not parse");
    });

    it("fails when LLM returns JSON with invalid kind", async () => {
      const badKind = JSON.stringify({
        name: "Bad",
        description: "Bad",
        kind: "unknown-kind",
        params: {},
        scheduleEveryMs: 3600000,
      });
      const runtime = makeRuntime(badKind);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("kind");
    });

    it("fails when LLM returns JSON with missing name", async () => {
      const noName = JSON.stringify({
        description: "Missing name",
        kind: "yield-auto-compound",
        params: {},
        scheduleEveryMs: 3600000,
      });
      const runtime = makeRuntime(noName);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("name");
    });

    it("fails when LLM returns JSON with scheduleEveryMs < 60000", async () => {
      const badSchedule = JSON.stringify({
        name: "Fast",
        description: "Too fast",
        kind: "yield-auto-compound",
        params: { asset: "USDC", minHarvestAmount: 10 },
        scheduleEveryMs: 30000, // < 60000
      });
      const runtime = makeRuntime(badSchedule);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("scheduleEveryMs");
    });

    it("fails when kind is not registered in registry", async () => {
      vi.mocked(getKind).mockReturnValue(undefined);

      const runtime = makeRuntime(VALID_YIELD_JSON);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Auto-compound USDC", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("not registered");
    });

    it("fails when kind params fail zod schema validation", async () => {
      // LLM output has wrong asset: "ETH" instead of "USDC"
      const badParams = JSON.stringify({
        name: "Bad Params",
        description: "Wrong asset",
        kind: "yield-auto-compound",
        params: { asset: "ETH", minHarvestAmount: -5 }, // invalid
        scheduleEveryMs: 3600000,
      });

      mockKindImpl("yield-auto-compound", yieldSchema);
      const runtime = makeRuntime(badParams);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("failed validation");
    });

    it("fails when runtime.useModel throws", async () => {
      const runtime = {
        getSetting: (_k: string) => null,
        useModel: vi.fn().mockRejectedValue(new Error("API timeout")),
      } as any;
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Do something", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("LLM call failed");
      expect(result?.text).toContain("API timeout");
    });
  });

  describe("handler — JSON extraction robustness", () => {
    it("strips prose before and after JSON block", async () => {
      mockKindImpl("yield-auto-compound", yieldSchema);

      const withProse =
        "Sure! Here's the strategy you asked for:\n" +
        VALID_YIELD_JSON +
        "\n\nLet me know if you'd like any changes!";

      const runtime = makeRuntime(withProse);
      const result = await buildStrategyAction.handler!(
        runtime,
        {} as any,
        {} as any,
        makeOptions({ description: "Auto-compound USDC", vaultAddress: VALID_VAULT, chain: VALID_CHAIN }),
      );
      expect(result?.success).toBe(true);
    });
  });
});
