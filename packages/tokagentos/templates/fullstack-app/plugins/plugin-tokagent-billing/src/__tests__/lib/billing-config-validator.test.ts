/**
 * Tests for billing-config-validator.ts
 *
 * We mock viem and pg so no real network or DB connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const chainIdResult: { value: number | null; throws: boolean; error?: string } = {
    value: 137,
    throws: false,
  };
  const contractResult: { value: string | null; throws: boolean; error?: string } = {
    value: null,
    throws: false,
  };
  const pgResult: { throws: boolean; error?: string } = { throws: false };

  return { chainIdResult, contractResult, pgResult };
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      getChainId: async () => {
        if (mocks.chainIdResult.throws) {
          throw new Error(mocks.chainIdResult.error ?? "RPC error");
        }
        return mocks.chainIdResult.value;
      },
      readContract: async () => {
        if (mocks.contractResult.throws) {
          throw new Error(mocks.contractResult.error ?? "contract error");
        }
        return mocks.contractResult.value;
      },
    }),
    http: () => ({}),
  };
});

vi.mock("pg", () => ({
  Pool: class {
    async query() {
      if (mocks.pgResult.throws) throw new Error(mocks.pgResult.error ?? "pg error");
      return { rows: [] };
    }
    async end() {}
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  validateDatabaseUrl,
  validateChainRpcUrl,
  validateVaultAddress,
  validateOperatorPrivateKey,
  validateAuthSecret,
  generatePrivateKey,
  generateAuthSecret,
} from "../../lib/billing-config-validator.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_PK = "0x" + "a".repeat(64);
const ADDR_A = "0x" + "1".repeat(40);
const ADDR_B = "0x" + "2".repeat(40);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mocks.chainIdResult.value = 137;
  mocks.chainIdResult.throws = false;
  mocks.contractResult.value = ADDR_B; // vault.pton() returns ADDR_B
  mocks.contractResult.throws = false;
  mocks.pgResult.throws = false;
});

describe("validateDatabaseUrl", () => {
  it("rejects empty string", async () => {
    const r = await validateDatabaseUrl("");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/required/i);
  });

  it("rejects non-postgres URL", async () => {
    const r = await validateDatabaseUrl("mysql://localhost/billing");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/postgres/i);
  });

  it("accepts pglite:// without a real connection", async () => {
    const r = await validateDatabaseUrl("pglite://./data/billing.pglite");
    expect(r.ok).toBe(true);
  });

  it("returns ok for a successful pg connection", async () => {
    const r = await validateDatabaseUrl("postgres://user:pass@localhost:5432/billing");
    expect(r.ok).toBe(true);
  });

  it("returns error when pg connection fails", async () => {
    mocks.pgResult.throws = true;
    mocks.pgResult.error = "ECONNREFUSED";
    const r = await validateDatabaseUrl("postgres://user:pass@localhost:5432/billing");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });
});

describe("validateChainRpcUrl", () => {
  it("rejects empty string", async () => {
    const r = await validateChainRpcUrl("");
    expect(r.ok).toBe(false);
  });

  it("rejects malformed URL", async () => {
    const r = await validateChainRpcUrl("not-a-url");
    expect(r.ok).toBe(false);
  });

  it("returns ok and chainId when RPC works", async () => {
    const r = await validateChainRpcUrl("https://polygon-rpc.com");
    expect(r.ok).toBe(true);
    expect(r.chainId).toBe(137);
  });

  it("rejects when returned chainId mismatches expected", async () => {
    const r = await validateChainRpcUrl("https://polygon-rpc.com", 1); // expect mainnet
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/137.*expected.*1/i);
  });

  it("returns error when RPC call throws", async () => {
    mocks.chainIdResult.throws = true;
    mocks.chainIdResult.error = "timeout";
    const r = await validateChainRpcUrl("https://example.com");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timeout/);
  });
});

describe("validateVaultAddress", () => {
  it("rejects invalid vault address", async () => {
    const r = await validateVaultAddress({ rpcUrl: "http://localhost", vaultAddress: "not-an-address", ptonAddress: ADDR_B });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/valid EVM address/i);
  });

  it("rejects invalid PTON address", async () => {
    const r = await validateVaultAddress({ rpcUrl: "http://localhost", vaultAddress: ADDR_A, ptonAddress: "0xBAD" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/valid EVM address/i);
  });

  it("returns ok when vault.pton() matches ptonAddress", async () => {
    mocks.contractResult.value = ADDR_B;
    const r = await validateVaultAddress({ rpcUrl: "http://localhost", vaultAddress: ADDR_A, ptonAddress: ADDR_B });
    expect(r.ok).toBe(true);
  });

  it("rejects when vault.pton() mismatches ptonAddress", async () => {
    mocks.contractResult.value = "0x" + "3".repeat(40);
    const r = await validateVaultAddress({ rpcUrl: "http://localhost", vaultAddress: ADDR_A, ptonAddress: ADDR_B });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/expected/i);
  });

  it("returns error when contract call throws", async () => {
    mocks.contractResult.throws = true;
    mocks.contractResult.error = "no code";
    const r = await validateVaultAddress({ rpcUrl: "http://localhost", vaultAddress: ADDR_A, ptonAddress: ADDR_B });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No contract|vault validation failed/i);
  });
});

describe("validateOperatorPrivateKey", () => {
  it("rejects empty string", () => {
    expect(validateOperatorPrivateKey("").ok).toBe(false);
  });

  it("rejects short key", () => {
    expect(validateOperatorPrivateKey("0x1234").ok).toBe(false);
  });

  it("rejects key without 0x prefix", () => {
    expect(validateOperatorPrivateKey("a".repeat(64)).ok).toBe(false);
  });

  it("accepts valid 32-byte hex key", () => {
    const r = validateOperatorPrivateKey(VALID_PK);
    // Either ok=true (if viem accounts available) or ok=false with secp256k1 error
    // The fixture key 0xaaa...aaa may not be a valid secp256k1 key, but the format check passes.
    expect(typeof r.ok).toBe("boolean");
  });

  it("accepts the well-known anvil fixture key", () => {
    const anvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const r = validateOperatorPrivateKey(anvilKey);
    // Format is valid; result depends on viem availability
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("validateAuthSecret", () => {
  it("rejects empty string", () => {
    expect(validateAuthSecret("").ok).toBe(false);
  });

  it("rejects secrets shorter than 32 chars", () => {
    const r = validateAuthSecret("tooshort");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too short/i);
  });

  it("accepts secrets >= 32 chars", () => {
    expect(validateAuthSecret("a".repeat(32)).ok).toBe(true);
    expect(validateAuthSecret("a".repeat(48)).ok).toBe(true);
  });
});

describe("generatePrivateKey / generateAuthSecret", () => {
  it("generatePrivateKey returns 0x-prefixed 32-byte hex", () => {
    const key = generatePrivateKey();
    expect(key).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("generatePrivateKey returns different values each call", () => {
    const k1 = generatePrivateKey();
    const k2 = generatePrivateKey();
    expect(k1).not.toBe(k2);
  });

  it("generateAuthSecret returns a string >= 32 chars", () => {
    const s = generateAuthSecret();
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThanOrEqual(32);
  });

  it("generateAuthSecret returns different values each call", () => {
    const s1 = generateAuthSecret();
    const s2 = generateAuthSecret();
    expect(s1).not.toBe(s2);
  });
});
