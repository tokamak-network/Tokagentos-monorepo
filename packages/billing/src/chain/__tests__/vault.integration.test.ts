/**
 * Integration tests for chain/vault.ts against a live Anvil node.
 *
 * Decision Z7: these tests are env-gated. They run ONLY when
 * `BILLING_TEST_ANVIL=1` is set. Without the flag they are silently skipped.
 *
 * Requirements when BILLING_TEST_ANVIL=1:
 *   - Foundry installed (~/.foundry/bin/anvil + forge).
 *   - llm-api-gateway/contracts/ buildable (forge script Deploy.s.sol).
 *   - No network required — fresh Anvil chain (chainId=31337, no fork).
 *
 * Run manually:
 *   BILLING_TEST_ANVIL=1 bun run test --filter=@tokagentos/billing
 *
 * Expected runtime: ~15-20s total (anvil start 5s + deploy 5s + 4 write txs).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signTypedData } from "viem/accounts";
import {
  spawnAnvil,
  ANVIL_ACCOUNT_0,
  ANVIL_ACCOUNT_1,
  type AnvilHarness,
} from "./anvil-harness.js";
import {
  readCredits,
  ptonBalance,
  depositX402,
  consumeCredits,
} from "../vault.js";
import { verifyEip3009Signature } from "../pton.js";
import { ptonDomain, TRANSFER_WITH_AUTH_TYPES } from "../typed-data.js";
import type { BillingClients } from "../clients.js";
import type { PaymentAuthorization, PaymentSignature } from "../pton.js";

// ---------------------------------------------------------------------------
// Gate: skip if BILLING_TEST_ANVIL is not set
// ---------------------------------------------------------------------------

vi.setConfig({ testTimeout: 30_000 });

const ANVIL_ENABLED = !!process.env.BILLING_TEST_ANVIL;

// ---------------------------------------------------------------------------
// Harness setup
// ---------------------------------------------------------------------------

let harness: AnvilHarness;
let clients: BillingClients;

beforeAll(async () => {
  if (!ANVIL_ENABLED) return;

  try {
    harness = await spawnAnvil();
  } catch (err) {
    console.warn(
      "[vault.integration] Anvil harness failed to start — integration tests will be skipped.\n" +
        String(err),
    );
    return;
  }

  const operatorAccount = privateKeyToAccount(ANVIL_ACCOUNT_0.privateKey);
  const publicClient = createPublicClient({
    transport: http(harness.rpcUrl),
  }) as PublicClient;
  const walletClient = createWalletClient({
    account: operatorAccount,
    transport: http(harness.rpcUrl),
  });

  clients = {
    publicClient,
    walletClient,
    mainnetClient: publicClient, // mainnet not needed for vault tests; reuse
    operatorAccount,
  };
});

afterAll(() => {
  if (harness) harness.stop();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ANVIL_ENABLED)("vault integration (Anvil)", () => {
  it("readCredits returns 0n for a fresh address", async () => {
    const credits = await readCredits(clients, harness.vaultAddress, ANVIL_ACCOUNT_1.address);
    expect(credits).toBe(0n);
  });

  it("ptonBalance returns 0n for a fresh address before any faucet call", async () => {
    // Anvil account #1 hasn't called faucet or received PTON yet.
    const balance = await ptonBalance(clients, harness.ptonAddress, ANVIL_ACCOUNT_1.address);
    expect(balance).toBe(0n);
  });

  it("depositX402 round-trip: sign EIP-3009 → deposit → readCredits matches", async () => {
    // Step 1: mint PTON to account #1 via the faucet (ENABLE_FAUCET=true in harness).
    const amount = 10_000_000_000_000_000_000n; // 10 PTON-units in test
    const { PTON_ABI } = await import("../abi/pton.js");

    const userWallet = createWalletClient({
      account: privateKeyToAccount(ANVIL_ACCOUNT_1.privateKey),
      transport: http(harness.rpcUrl),
    });

    // Call faucet(amount) on PTON as account #1
    const faucetHash = await userWallet.writeContract({
      address: harness.ptonAddress,
      abi: PTON_ABI,
      functionName: "faucet",
      args: [amount],
      account: privateKeyToAccount(ANVIL_ACCOUNT_1.privateKey),
      chain: null,
    });
    await clients.publicClient.waitForTransactionReceipt({ hash: faucetHash });

    // Verify balance was minted
    const balanceAfterFaucet = await ptonBalance(
      clients,
      harness.ptonAddress,
      ANVIL_ACCOUNT_1.address,
    );
    expect(balanceAfterFaucet).toBe(amount);

    // Step 2: sign EIP-3009 TransferWithAuthorization as account #1
    const chainId = 31337;
    const nonce = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
    const validBefore = 9_999_999_999n;

    const auth: PaymentAuthorization = {
      from: ANVIL_ACCOUNT_1.address,
      to: harness.vaultAddress as `0x${string}`,
      value: amount,
      validAfter: 0n,
      validBefore,
      nonce,
    };

    const sigHex = await signTypedData({
      privateKey: ANVIL_ACCOUNT_1.privateKey,
      domain: ptonDomain(chainId, harness.ptonAddress),
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: auth.from,
        to: auth.to,
        value: auth.value,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
      },
    });

    const r = ("0x" + sigHex.slice(2, 66)) as `0x${string}`;
    const s = ("0x" + sigHex.slice(66, 130)) as `0x${string}`;
    const v = parseInt(sigHex.slice(130, 132), 16);
    const sig: PaymentSignature = { r, s, v };

    // Sanity: off-chain verify matches
    const valid = await verifyEip3009Signature({
      auth,
      sig,
      chainId,
      ptonAddress: harness.ptonAddress,
    });
    expect(valid).toBe(true);

    // Step 3: submit depositX402
    const topupId =
      "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd" as const;
    const txHash = await depositX402(clients, harness.vaultAddress as `0x${string}`, {
      auth,
      sig,
      topupId,
    });
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

    // Step 4: verify credits were credited
    const creditsAfter = await readCredits(
      clients,
      harness.vaultAddress as `0x${string}`,
      ANVIL_ACCOUNT_1.address,
    );
    expect(creditsAfter).toBe(amount);
  });

  it("consumeCredits reduces user credits; same batchId reverts on replay", async () => {
    // At this point account #1 should have credits from the previous test.
    // Read the current balance.
    const creditsBefore = await readCredits(
      clients,
      harness.vaultAddress as `0x${string}`,
      ANVIL_ACCOUNT_1.address,
    );
    expect(creditsBefore).toBeGreaterThan(0n);

    const consumeAmount = creditsBefore; // consume all
    const batchId =
      "0x1122334455667788112233445566778811223344556677881122334455667788" as const;

    // First consume — should succeed
    const txHash = await consumeCredits(
      clients,
      harness.vaultAddress as `0x${string}`,
      {
        user: ANVIL_ACCOUNT_1.address,
        amount: consumeAmount,
        batchId,
      },
    );
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

    const creditsAfter = await readCredits(
      clients,
      harness.vaultAddress as `0x${string}`,
      ANVIL_ACCOUNT_1.address,
    );
    expect(creditsAfter).toBe(0n);

    // Second consume with the same batchId — should revert (deterministic
    // batchId enforcement on-chain prevents double-consume). We match /revert/i
    // specifically so the test does not pass falsely on unrelated thrown
    // errors (network timeout, gas estimation failure, etc.).
    await expect(
      consumeCredits(clients, harness.vaultAddress as `0x${string}`, {
        user: ANVIL_ACCOUNT_1.address,
        amount: 1n, // amount doesn't matter — the credits are 0 and batchId is used
        batchId,
      }),
    ).rejects.toThrow(/revert/i);
  });
});
