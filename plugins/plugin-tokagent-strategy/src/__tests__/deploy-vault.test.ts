import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock shared library
vi.mock("@tokagent/plugin-tokagent-shared", () => {
  const mockDeployTokagentVault = vi.fn();
  class MockTokagentFactoryClient {
    deployTokagentVault = mockDeployTokagentVault;
  }
  return {
    TokagentFactoryClient: MockTokagentFactoryClient,
    getChainConfig: vi.fn().mockReturnValue({
      chainId: 137,
      name: "Polygon",
      factoryProxy: "0xFactory",
      defaultRpc: "https://polygon-rpc.publicnode.com",
      nativeSymbol: "MATIC",
      explorerUrl: "https://polygonscan.com",
    }),
    getPublicClient: vi.fn().mockReturnValue({}),
    getWalletClient: vi.fn().mockReturnValue({
      account: { address: "0xOperator0000000000000000000000000000001" },
    }),
    resolveAgentPrivateKey: vi.fn().mockReturnValue(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ),
    findPack: vi.fn(),
    SUPPORTED_CHAIN_IDS: new Set([1, 137, 999]),
  };
});

import { deployTokagentVaultAction } from "../actions/deploy-vault.js";
import {
  resolveAgentPrivateKey,
  findPack,
  TokagentFactoryClient,
} from "@tokagent/plugin-tokagent-shared";

const FAKE_VAULT = "0xVault000000000000000000000000000000001";
const FAKE_TX = "0xTxHash00000000000000000000000000000001";
const FAKE_PACK = {
  id: "aave-v3-polygon",
  chainId: 137,
  displayName: "Aave v3 on Polygon",
  entries: [
    {
      target: "0xAavePool0000000000000000000000000000001" as `0x${string}`,
      selector: "0x617ba037" as `0x${string}`,
      humanLabel: "Pool.supply",
    },
  ],
  approvals: [
    {
      token: "0xUSDC000000000000000000000000000000001" as `0x${string}`,
      spender: "0xAavePool0000000000000000000000000000001" as `0x${string}`,
      humanLabel: "USDC -> Aave Pool (max)",
    },
  ],
};

function makeRuntime(settings: Record<string, string | undefined> = {}) {
  return {
    getSetting: (key: string): string | undefined => settings[key],
  };
}

function makeOptions(params: Record<string, unknown>) {
  return { parameters: params };
}

describe("deployTokagentVaultAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAgentPrivateKey).mockReturnValue(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    vi.mocked(findPack).mockReturnValue(FAKE_PACK);
    // Mock deployTokagentVault on the prototype
    const instance = new (TokagentFactoryClient as any)();
    instance.deployTokagentVault.mockResolvedValue({ vault: FAKE_VAULT, txHash: FAKE_TX });
  });

  describe("validate", () => {
    it("returns true when private key can be resolved", async () => {
      const runtime = makeRuntime({ TOKAGENT_PRIVATE_KEY: "0xabc" });
      const valid = await deployTokagentVaultAction.validate!(runtime as any, {} as any);
      expect(valid).toBe(true);
    });

    it("returns false when resolveAgentPrivateKey throws", async () => {
      vi.mocked(resolveAgentPrivateKey).mockImplementation(() => {
        throw new Error("no key");
      });
      const runtime = makeRuntime({});
      const valid = await deployTokagentVaultAction.validate!(runtime as any, {} as any);
      expect(valid).toBe(false);
    });
  });

  describe("handler", () => {
    it("returns error for unsupported chain", async () => {
      const runtime = makeRuntime();
      const result = await deployTokagentVaultAction.handler!(
        runtime as any,
        {} as any,
        {} as any,
        makeOptions({ chain: "solana", packs: ["aave-v3-polygon"] }) as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("Unsupported chain");
    });

    it("returns error when packs array is empty", async () => {
      const runtime = makeRuntime();
      const result = await deployTokagentVaultAction.handler!(
        runtime as any,
        {} as any,
        {} as any,
        makeOptions({ chain: "polygon", packs: [] }) as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("No protocol packs");
    });

    it("returns error for unknown pack id", async () => {
      vi.mocked(findPack).mockReturnValue(undefined);
      const runtime = makeRuntime();
      const result = await deployTokagentVaultAction.handler!(
        runtime as any,
        {} as any,
        {} as any,
        makeOptions({ chain: "polygon", packs: ["unknown-pack"] }) as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("Unknown pack");
    });

    it("succeeds and returns vault address + txHash", async () => {
      const instance = new (TokagentFactoryClient as any)();
      instance.deployTokagentVault.mockResolvedValue({ vault: FAKE_VAULT, txHash: FAKE_TX });

      const runtime = makeRuntime();
      const result = await deployTokagentVaultAction.handler!(
        runtime as any,
        {} as any,
        {} as any,
        makeOptions({ chain: "polygon", packs: ["aave-v3-polygon"] }) as any,
      );
      expect(result?.success).toBe(true);
      expect(result?.text).toContain(FAKE_VAULT);
      expect(result?.text).toContain(FAKE_TX);
      expect(result?.data?.["chainId"]).toBe(137);
    });

    it("flatmaps entries and approvals from multiple packs", async () => {
      const pack2 = {
        id: "pack-2",
        chainId: 137,
        displayName: "Pack 2",
        entries: [{ target: "0xTarget2" as `0x${string}`, selector: "0x12345678" as `0x${string}`, humanLabel: "Target2.fn" }],
        approvals: [{ token: "0xToken2" as `0x${string}`, spender: "0xSpender2" as `0x${string}`, humanLabel: "Token2 approval" }],
      };
      vi.mocked(findPack)
        .mockReturnValueOnce(FAKE_PACK)
        .mockReturnValueOnce(pack2);

      const instance = new (TokagentFactoryClient as any)();
      instance.deployTokagentVault.mockResolvedValue({ vault: FAKE_VAULT, txHash: FAKE_TX });

      const runtime = makeRuntime();
      const result = await deployTokagentVaultAction.handler!(
        runtime as any,
        {} as any,
        {} as any,
        makeOptions({ chain: "polygon", packs: ["aave-v3-polygon", "pack-2"] }) as any,
      );
      expect(result?.success).toBe(true);
      // Both packs' text should appear
      expect(result?.data?.["packs"]).toEqual(["aave-v3-polygon", "pack-2"]);
    });

    it("handles CHAIN_IDS_BY_NAME aliases", async () => {
      const instance = new (TokagentFactoryClient as any)();
      instance.deployTokagentVault.mockResolvedValue({ vault: FAKE_VAULT, txHash: FAKE_TX });
      const runtime = makeRuntime();

      const aliases = ["mainnet", "eth", "matic", "hyper"];
      for (const alias of aliases) {
        vi.mocked(findPack).mockReturnValue(FAKE_PACK);
        const result = await deployTokagentVaultAction.handler!(
          runtime as any,
          {} as any,
          {} as any,
          makeOptions({ chain: alias, packs: ["aave-v3-polygon"] }) as any,
        );
        // Should resolve to a known chain (success or pack-not-found, not "unsupported chain")
        expect(result?.text).not.toContain("Unsupported chain");
      }
    });

    it("returns error when factory deploy throws", async () => {
      const instance = new (TokagentFactoryClient as any)();
      instance.deployTokagentVault.mockRejectedValue(new Error("out of gas"));

      const runtime = makeRuntime();
      const result = await deployTokagentVaultAction.handler!(
        runtime as any,
        {} as any,
        {} as any,
        makeOptions({ chain: "polygon", packs: ["aave-v3-polygon"] }) as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("out of gas");
    });
  });
});
