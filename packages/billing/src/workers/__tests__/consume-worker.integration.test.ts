/**
 * Anvil integration test for consume-worker.ts (Decision Z20, Z7).
 *
 * Gate: BILLING_TEST_ANVIL=1  (same gate as Phase 3 vault.integration.test.ts)
 *
 * Validates the plan's hard end-to-end gate:
 *   "record N synthetic accruals, advance time/block, assert consumeCredits
 *    tx mined with expected total."
 *
 * Flow:
 *   1. Spawn Anvil + deploy PTON + ClaudeVault (anvil-harness)
 *   2. Mint PTON to USER via faucet
 *   3. depositX402 — fund the vault with credits for USER
 *   4. Seed billing_credit_state with accrued = ACCRUED_AMOUNT
 *   5. Call flushNow(deps)
 *   6. Assert:
 *      - billing_consume_batches row has state === 'confirmed'
 *      - tx_hash is a valid 0x-prefixed hex string
 *      - on-chain vault.readCredits == deposit - accrued (consume succeeded)
 *      - DB accrued is now 0n (flushAccrued was called after chain confirmation)
 *
 * Uses the same spawnAnvil() harness as Phase 3 integration tests.
 *
 * Pre-requisites:
 *   - Foundry installed at ~/.foundry/bin/
 *   - llm-api-gateway contracts at CONTRACTS_DIR
 *   - Run: BILLING_TEST_ANVIL=1 bun run test --testNamePattern=integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import {
  spawnAnvil,
  ANVIL_ACCOUNT_0,
  ANVIL_ACCOUNT_1,
  type AnvilHarness,
} from "../../chain/__tests__/anvil-harness.js";
import {
  schema,
  type Schema,
  creditState,
  consumeBatches,
} from "../../ledger/schema.js";
import { flushNow, type ConsumeWorkerDeps } from "../consume-worker.js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { depositX402, readCredits } from "../../chain/vault.js";
import { PTON_ABI } from "../../chain/abi/pton.js";
import { ptonDomain, TRANSFER_WITH_AUTH_TYPES } from "../../chain/typed-data.js";
import type { BillingClients } from "../../chain/clients.js";
import type { PaymentAuthorization, PaymentSignature } from "../../chain/pton.js";

const SKIP = !process.env.BILLING_TEST_ANVIL;

describe.skipIf(SKIP)("consume-worker integration (Anvil)", () => {
  let harness: AnvilHarness;
  let db: PgliteDatabase<Schema>;
  let pglite: PGlite;
  let deps: ConsumeWorkerDeps;
  let clients: BillingClients;

  const USER: Address = ANVIL_ACCOUNT_1.address;
  const DEPOSIT_AMOUNT = 10_000_000_000_000_000_000n; // 10 PTON-units
  const ACCRUED_AMOUNT = 600_000_000_000_000_000n; // 0.6 PTON — above 0.5 min threshold

  beforeAll(async () => {
    harness = await spawnAnvil();

    pglite = new PGlite();
    db = drizzle(pglite, { schema }) as PgliteDatabase<Schema>;
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });

    // Build BillingClients explicitly — we need the publicClient + walletClient
    // for the depositX402 seeding step below.
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
      mainnetClient: publicClient, // mainnet not needed for this test
      operatorAccount,
    };

    deps = {
      db,
      clients,
      vaultAddress: harness.vaultAddress,
      config: {
        consumeBatchMinPton: 500_000_000_000_000_000n,
        consumeMaxAgeMs: 300_000,
        consumeMaxPerCycle: 10,
      },
    };

    // ---- Seed on-chain credits for USER via faucet + depositX402 ----
    // (Mirrors the established pattern in vault.integration.test.ts.)
    const userWallet = createWalletClient({
      account: privateKeyToAccount(ANVIL_ACCOUNT_1.privateKey),
      transport: http(harness.rpcUrl),
    });

    // 1. Mint PTON to USER (faucet mode enabled in deploy harness)
    const faucetHash = await userWallet.writeContract({
      address: harness.ptonAddress,
      abi: PTON_ABI,
      functionName: "faucet",
      args: [DEPOSIT_AMOUNT],
      account: privateKeyToAccount(ANVIL_ACCOUNT_1.privateKey),
      chain: null,
    });
    await clients.publicClient.waitForTransactionReceipt({ hash: faucetHash });

    // 2. Sign EIP-3009 TransferWithAuthorization
    const chainId = 31337;
    const nonce =
      "0x0000000000000000000000000000000000000000000000000000000000000042" as const;
    const validBefore = 9_999_999_999n;

    const auth: PaymentAuthorization = {
      from: USER,
      to: harness.vaultAddress,
      value: DEPOSIT_AMOUNT,
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

    const r = ("0x" + sigHex.slice(2, 66)) as Hex;
    const s = ("0x" + sigHex.slice(66, 130)) as Hex;
    const v = parseInt(sigHex.slice(130, 132), 16);
    const sig: PaymentSignature = { r, s, v };

    // 3. depositX402 — operator-relayed
    const topupId =
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as const;
    await depositX402(clients, harness.vaultAddress, { auth, sig, topupId });

    // 4. Sanity: on-chain credits match the deposit
    const onchainBefore = await readCredits(
      clients,
      harness.vaultAddress,
      USER,
    );
    expect(onchainBefore).toBe(DEPOSIT_AMOUNT);

    // ---- Seed billing_credit_state with accrued amount ----
    // In production this is set by `commit()`. Here we seed directly.
    const firstAccrualAt = new Date();
    await db.insert(creditState).values({
      wallet: USER.toLowerCase(),
      balance: 0n,
      reserved: 0n,
      accrued: ACCRUED_AMOUNT,
      firstAccrualAt,
      lastHydratedAt: null,
      updatedAt: new Date(),
    });
  }, 90_000);

  afterAll(async () => {
    if (harness) harness.stop();
    if (pglite) await pglite.close();
  });

  it("flushNow consumes the seeded accrual on-chain and updates DB state", async () => {
    const result = await flushNow(deps);

    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.deadLettered).toBe(0);

    // ---- Assert: DB consume_batches row is 'confirmed' with a real tx hash ----
    const batches = await db.select().from(consumeBatches);
    expect(batches).toHaveLength(1);
    const batch = batches[0]!;
    expect(batch.wallet).toBe(USER.toLowerCase());
    expect(batch.amountPton).toBe(ACCRUED_AMOUNT);
    expect(batch.state).toBe("confirmed");
    expect(batch.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // ---- Assert: on-chain credits dropped by exactly ACCRUED_AMOUNT ----
    const onchainAfter = await readCredits(
      clients,
      harness.vaultAddress,
      USER,
    );
    expect(onchainAfter).toBe(DEPOSIT_AMOUNT - ACCRUED_AMOUNT);

    // ---- Assert: DB accrued is now 0n (flushAccrued was called) ----
    const stateRows = await db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, USER.toLowerCase()));
    expect(stateRows).toHaveLength(1);
    expect(stateRows[0]!.accrued).toBe(0n);
  });

  it("selectFlushable correctly reads from DB after a successful flush", async () => {
    const { selectFlushable } = await import("../consume-worker.js");

    // After the prior test, accrued is 0n — no candidates.
    const now = new Date();
    const candidates = await selectFlushable(deps, now);
    expect(candidates).toHaveLength(0);

    // Re-seed and verify selectFlushable picks it up.
    await db
      .update(creditState)
      .set({ accrued: ACCRUED_AMOUNT, firstAccrualAt: new Date() })
      .where(eq(creditState.wallet, USER.toLowerCase()));

    const candidates2 = await selectFlushable(deps, now);
    expect(candidates2.length).toBeGreaterThan(0);
    expect(candidates2[0]!.wallet.toLowerCase()).toBe(USER.toLowerCase());
    expect(candidates2[0]!.amount).toBe(ACCRUED_AMOUNT);
    expect(candidates2[0]!.batchId).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
