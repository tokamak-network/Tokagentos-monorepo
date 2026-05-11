/**
 * Anvil harness for Phase 3 integration tests.
 *
 * Decision Z7: integration tests are env-gated (BILLING_TEST_ANVIL=1).
 * This file is a private helper — not re-exported from the package index.
 *
 * Requirements:
 *   - Foundry installed: foundry bin at ~/.foundry/bin/anvil and forge.
 *   - llm-api-gateway contracts buildable at the source root.
 *   - Network access (for MAINNET_RPC_URL) is NOT required — Deploy.s.sol
 *     creates fresh contracts; no fork is needed for the unit round-trip.
 *
 * Usage:
 *   const harness = await spawnAnvil();
 *   // ... tests ...
 *   harness.stop();
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const FOUNDRY_BIN_DIR = `${process.env.HOME ?? "~"}/.foundry/bin`;
const ANVIL_BIN = `${FOUNDRY_BIN_DIR}/anvil`;
const FORGE_BIN = `${FOUNDRY_BIN_DIR}/forge`;

/**
 * The source contracts directory.
 * Deploy.s.sol lives here and is the source of PTON + ClaudeVault.
 */
const CONTRACTS_DIR = path.resolve(
  import.meta.dirname,
  "../../../../../../../llm-api-gateway/contracts",
);

// ---------------------------------------------------------------------------
// Anvil default accounts (publicly known)
// ---------------------------------------------------------------------------

/** Anvil account #0 — deployer and default operator in tests. */
export const ANVIL_ACCOUNT_0 = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const,
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const,
};

/** Anvil account #1 — used as a test user wallet. */
export const ANVIL_ACCOUNT_1 = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const,
  privateKey:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnvilHarness {
  /** HTTP RPC URL for the Anvil node. */
  rpcUrl: string;
  /** Deployed PTON contract address. */
  ptonAddress: `0x${string}`;
  /** Deployed ClaudeVault contract address. */
  vaultAddress: `0x${string}`;
  /** Stops the Anvil process. */
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll an Anvil RPC endpoint until it responds to `eth_blockNumber`,
 * or until the timeout expires.
 */
async function waitForAnvil(rpcUrl: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Anvil did not become ready within ${timeoutMs}ms`);
}

/**
 * Parse deployed addresses from a Forge broadcast JSON file.
 * Forge writes `broadcast/Deploy.s.sol/<chainId>/run-latest.json` after
 * `forge script --broadcast`.
 */
function parseDeployedAddresses(chainId: number): {
  ptonAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
} {
  const broadcastPath = path.join(
    CONTRACTS_DIR,
    "broadcast",
    "Deploy.s.sol",
    String(chainId),
    "run-latest.json",
  );

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(readFileSync(broadcastPath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Could not read broadcast file at ${broadcastPath}. ` +
        `Did 'forge script --broadcast' run successfully?\n${err}`,
    );
  }

  // The broadcast file has a `transactions` array. Contracts are created by
  // `contractAddress` fields on CREATE transactions, in deployment order.
  // Deploy.s.sol deploys: PTON first, ClaudeVault second.
  const transactions = (json as { transactions?: unknown[] }).transactions ?? [];
  const creates = transactions.filter(
    (t): t is { contractAddress: string; contractName: string } =>
      typeof t === "object" &&
      t !== null &&
      (t as Record<string, unknown>).transactionType === "CREATE" &&
      typeof (t as Record<string, unknown>).contractAddress === "string",
  );

  if (creates.length < 2) {
    throw new Error(
      `Expected at least 2 CREATE transactions in broadcast, found ${creates.length}. ` +
        `PTON and ClaudeVault must both be deployed.`,
    );
  }

  return {
    ptonAddress: creates[0].contractAddress.toLowerCase() as `0x${string}`,
    vaultAddress: creates[1].contractAddress.toLowerCase() as `0x${string}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawns a local Anvil node on port 8545 and deploys PTON + ClaudeVault using
 * the source repo's Deploy.s.sol script.
 *
 * The harness uses a fresh non-forked chain (chainId=31337, the default Anvil
 * chain). A fake TON token address is passed to PTON (the deployment only
 * uses the address as a reference; the faucet mode bypasses TON wrapping in
 * tests). `ENABLE_FAUCET=true` is set so tests can mint PTON directly.
 *
 * @returns The harness object with rpcUrl, ptonAddress, vaultAddress, and stop().
 * @throws If Anvil or Forge are not installed, or if deployment fails.
 */
export async function spawnAnvil(): Promise<AnvilHarness> {
  const port = 8545;
  const rpcUrl = `http://127.0.0.1:${port}`;
  const chainId = 31337;

  // ---- 1. Start Anvil ----
  let anvilProcess: ChildProcess;
  try {
    anvilProcess = spawn(ANVIL_BIN, ["--port", String(port), "--silent"], {
      detached: false,
      stdio: "ignore",
    });
  } catch (err) {
    throw new Error(
      `Failed to spawn Anvil at ${ANVIL_BIN}. ` +
        `Is foundry installed? Try: curl -L https://foundry.paradigm.xyz | bash\n${err}`,
    );
  }

  const stop = () => {
    try {
      anvilProcess.kill("SIGTERM");
    } catch {
      // already dead
    }
  };

  try {
    await waitForAnvil(rpcUrl);
  } catch (err) {
    stop();
    throw err;
  }

  // ---- 2. Deploy contracts ----
  // Fake TON address — faucet mode means PTON doesn't call `transferFrom` on
  // TON in tests, so the address just needs to be a valid 20-byte hex value.
  const FAKE_TON = "0x1111111111111111111111111111111111111111";

  try {
    execSync(
      `${FORGE_BIN} script script/Deploy.s.sol --rpc-url ${rpcUrl} --broadcast --private-key ${ANVIL_ACCOUNT_0.privateKey}`,
      {
        cwd: CONTRACTS_DIR,
        env: {
          ...process.env,
          DEPLOYER_PRIVATE_KEY: ANVIL_ACCOUNT_0.privateKey,
          TON_TOKEN_ADDRESS: FAKE_TON,
          ADMIN_ADDRESS: ANVIL_ACCOUNT_0.address,
          OPERATOR_ADDRESS: ANVIL_ACCOUNT_0.address,
          ENABLE_FAUCET: "true",
        },
        stdio: "pipe",
      },
    );
  } catch (err) {
    stop();
    throw new Error(
      `forge script Deploy.s.sol failed.\n` +
        `cwd: ${CONTRACTS_DIR}\n` +
        `Error: ${err}`,
    );
  }

  // ---- 3. Parse deployed addresses ----
  const { ptonAddress, vaultAddress } = parseDeployedAddresses(chainId);

  return { rpcUrl, ptonAddress, vaultAddress, stop };
}
