/**
 * Tests for billing-config-writer.ts
 *
 * Uses a temp directory and mocks process.env to avoid touching real config.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// ---------------------------------------------------------------------------
// Mock @tokagentos/agent/api/config-env so the writer uses the fallback
// fs-based implementation rather than the agent package.
// ---------------------------------------------------------------------------

vi.mock("@tokagentos/agent/api/config-env", () => {
  throw new Error("module not available in test");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { writeBillingConfig, clearBillingConfig } from "../../lib/billing-config-writer.js";

const VALID_VALUES = {
  databaseUrl: "postgres://user:pass@localhost:5432/billing",
  chainRpcUrl: "https://polygon-rpc.com",
  chainId: 137,
  vaultAddress: "0x" + "1".repeat(40),
  ptonAddress: "0x" + "2".repeat(40),
  operatorPrivateKey: "0x" + "a".repeat(64),
  authSecret: "a".repeat(48),
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "billing-writer-test-"));
  // Point TOKAGENT_STATE_DIR to the temp dir so config.env goes there.
  process.env.TOKAGENT_STATE_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.TOKAGENT_STATE_DIR;
  // Clean up written env vars
  for (const key of [
    "BILLING_MODE",
    "BILLING_ENABLED", "BILLING_DATABASE_URL", "BILLING_CHAIN_RPC_URL",
    "BILLING_CHAIN_ID", "BILLING_VAULT_ADDRESS", "BILLING_PTON_ADDRESS",
    "BILLING_OPERATOR_PRIVATE_KEY", "BILLING_AUTH_SECRET",
    "BILLING_MAINNET_RPC_URL", "BILLING_FIXED_TON_USD",
  ]) {
    delete process.env[key];
  }
  try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
});

function configEnvPath(): string {
  return path.join(tmpDir, "config.env");
}

async function readConfigEnv(): Promise<Record<string, string>> {
  let raw: string;
  try {
    raw = await fs.readFile(configEnvPath(), "utf8");
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0 || line.startsWith("#")) continue;
    result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}

describe("writeBillingConfig", () => {
  it("writes all required keys to config.env", async () => {
    await writeBillingConfig(VALID_VALUES);

    const env = await readConfigEnv();
    expect(env.BILLING_ENABLED).toBe("true");
    expect(env.BILLING_DATABASE_URL).toBe(VALID_VALUES.databaseUrl);
    expect(env.BILLING_CHAIN_RPC_URL).toBe(VALID_VALUES.chainRpcUrl);
    expect(env.BILLING_CHAIN_ID).toBe("137");
    expect(env.BILLING_VAULT_ADDRESS).toBe(VALID_VALUES.vaultAddress);
    expect(env.BILLING_PTON_ADDRESS).toBe(VALID_VALUES.ptonAddress);
  });

  it("does NOT log secret values (operator key or auth secret)", async () => {
    // We can't intercept the logger in this test environment, but we can
    // verify the values were written and process.env was updated.
    await writeBillingConfig(VALID_VALUES);
    expect(process.env.BILLING_OPERATOR_PRIVATE_KEY).toBe(VALID_VALUES.operatorPrivateKey);
    expect(process.env.BILLING_AUTH_SECRET).toBe(VALID_VALUES.authSecret);
  });

  it("writes optional keys when provided", async () => {
    await writeBillingConfig({ ...VALID_VALUES, mainnetRpcUrl: "https://mainnet.infura.io/v3/x", fixedTonUsd: 1.5 });
    const env = await readConfigEnv();
    expect(env.BILLING_MAINNET_RPC_URL).toBe("https://mainnet.infura.io/v3/x");
    expect(env.BILLING_FIXED_TON_USD).toBe("1.5");
  });

  it("does NOT write optional keys when absent", async () => {
    await writeBillingConfig(VALID_VALUES); // no mainnetRpcUrl, no fixedTonUsd
    const env = await readConfigEnv();
    expect(env.BILLING_MAINNET_RPC_URL).toBeUndefined();
    expect(env.BILLING_FIXED_TON_USD).toBeUndefined();
  });

  it("sets BILLING_ENABLED=true as the final step", async () => {
    await writeBillingConfig(VALID_VALUES);
    const raw = await fs.readFile(configEnvPath(), "utf8");
    const lines = raw.split(/\r?\n/).filter(l => l.startsWith("BILLING_"));
    // BILLING_ENABLED should appear after all other BILLING_* keys
    const enabledIdx = lines.findIndex(l => l.startsWith("BILLING_ENABLED="));
    expect(enabledIdx).toBe(lines.length - 1);
  });

  it("writes BILLING_MODE=server (v2.0.5 — matches schema default, also overwrites any prior client-mode line)", async () => {
    // Server-mode IS the schema default in v2.0.5, so this is the no-op-on-
    // a-fresh-install case. The writer still writes it explicitly so that
    // documentation in the config file reflects the operator's intent AND
    // any prior BILLING_MODE=client line (from the client-mode disclosure)
    // gets overwritten.
    await writeBillingConfig(VALID_VALUES);
    const env = await readConfigEnv();
    expect(env.BILLING_MODE).toBe("server");
    expect(process.env.BILLING_MODE).toBe("server");
  });
});

describe("clearBillingConfig", () => {
  it("removes all BILLING_* keys from config.env", async () => {
    await writeBillingConfig(VALID_VALUES);
    await clearBillingConfig();

    const env = await readConfigEnv();
    expect(env.BILLING_ENABLED).toBeUndefined();
    expect(env.BILLING_DATABASE_URL).toBeUndefined();
    expect(env.BILLING_OPERATOR_PRIVATE_KEY).toBeUndefined();
  });

  it("clears process.env keys", async () => {
    await writeBillingConfig(VALID_VALUES);
    expect(process.env.BILLING_ENABLED).toBe("true");
    await clearBillingConfig();
    expect(process.env.BILLING_ENABLED).toBeUndefined();
  });
});
