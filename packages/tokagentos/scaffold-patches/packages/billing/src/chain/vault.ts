import { type Address, type Hex } from "viem";
import { logger } from "@elizaos/core";
import { CLAUDE_VAULT_ABI } from "./abi/vault.js";
import { PTON_ABI } from "./abi/pton.js";
import type { BillingClients } from "./clients.js";
import type { PaymentAuthorization, PaymentSignature } from "./pton.js";

const log = logger.child({ src: "billing:chain:vault" });

/**
 * Submit a PTON EIP-3009 `depositX402` transaction to the ClaudeVault.
 *
 * Pulls PTON from `auth.from` into the vault via `transferWithAuthorization`
 * and credits the signer's on-chain balance. The `topupId` is single-use
 * on-chain; the operator generates it deterministically from the chain-side
 * nonce so retries do not double-credit.
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts:122-156 (depositOnChain)
 * Renamed: `depositOnChain` → `depositX402` — matches the on-chain function
 * name and is unambiguous when the function lives in the `chain/` directory.
 *
 * @param clients - BillingClients bundle (walletClient + publicClient).
 * @param vaultAddress - ClaudeVault contract address.
 * @param args.auth - EIP-3009 authorization parameters.
 * @param args.sig - ECDSA signature components.
 * @param args.topupId - Unique bytes32 top-up ID (replay guard on-chain).
 * @returns The confirmed transaction hash.
 * @throws If the transaction reverts on-chain.
 */
export async function depositX402(
  clients: BillingClients,
  vaultAddress: Address,
  args: {
    auth: PaymentAuthorization;
    sig: PaymentSignature;
    topupId: Hex;
  },
): Promise<Hex> {
  const { auth, sig, topupId } = args;
  log.info(
    { from: auth.from, value: auth.value.toString(), topupId },
    "submitting vault.depositX402",
  );

  const txHash = await clients.walletClient.writeContract({
    address: vaultAddress,
    abi: CLAUDE_VAULT_ABI,
    functionName: "depositX402",
    args: [
      auth.from,
      auth.value,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
      sig.v,
      sig.r,
      sig.s,
      topupId,
    ],
    account: clients.operatorAccount,
    // chain: null — do not validate against a hardcoded chain object; the wallet
    // client's configured transport is the source of truth. Source used this
    // same pattern (onchain.ts:150).
    chain: null,
  });

  const rcpt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (rcpt.status !== "success") {
    throw new Error(`depositX402 tx reverted: ${txHash}`);
  }

  log.info(
    { txHash, block: rcpt.blockNumber.toString() },
    "depositX402 confirmed",
  );
  return txHash;
}

/**
 * Move accrued credits from a user's on-chain balance to operator revenue.
 *
 * Called by the consume worker (Phase 5) in batches. The `batchId` must be
 * globally unique — the source generates it as
 * `keccak256(wallet || firstAccrualAt || amount)` (consumeWorker.ts:36-40).
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts:162-181 (consumeCreditsOnChain)
 * Renamed: `consumeCreditsOnChain` → `consumeCredits`
 *
 * @param clients - BillingClients bundle.
 * @param vaultAddress - ClaudeVault contract address.
 * @param args.user - Wallet address whose accrued credits are being consumed.
 * @param args.amount - Amount in PTON atto-units to consume.
 * @param args.batchId - Unique bytes32 batch identifier.
 * @returns The confirmed transaction hash.
 * @throws If the transaction reverts on-chain.
 */
export async function consumeCredits(
  clients: BillingClients,
  vaultAddress: Address,
  args: {
    user: Address;
    amount: bigint;
    batchId: Hex;
  },
): Promise<Hex> {
  const { user, amount, batchId } = args;
  log.info(
    { user, amount: amount.toString(), batchId },
    "submitting vault.consumeCredits",
  );

  const txHash = await clients.walletClient.writeContract({
    address: vaultAddress,
    abi: CLAUDE_VAULT_ABI,
    functionName: "consumeCredits",
    args: [user, amount, batchId],
    account: clients.operatorAccount,
    chain: null,
  });

  const rcpt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (rcpt.status !== "success") {
    throw new Error(`consumeCredits tx reverted: ${txHash}`);
  }

  log.info(
    { txHash, block: rcpt.blockNumber.toString() },
    "consumeCredits confirmed",
  );
  return txHash;
}

/**
 * Read a user's on-chain credit balance from ClaudeVault.
 *
 * Pure read — no state change, no wallet required.
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts:183-194 (readCreditsOnChain)
 * Renamed: `readCreditsOnChain` → `readCredits`
 *
 * @param clients - BillingClients bundle (only publicClient is used).
 * @param vaultAddress - ClaudeVault contract address.
 * @param user - Wallet address to query.
 * @returns On-chain credit balance in PTON atto-units.
 */
export async function readCredits(
  clients: BillingClients,
  vaultAddress: Address,
  user: Address,
): Promise<bigint> {
  // CLAUDE_VAULT_ABI is declared `as const`; viem infers `bigint` from the
  // uint256 output. Explicit cast was redundant and would mask future ABI
  // edits (e.g. uint128 narrowing).
  return await clients.publicClient.readContract({
    address: vaultAddress,
    abi: CLAUDE_VAULT_ABI,
    functionName: "credits",
    args: [user],
  });
}

/**
 * Check whether a `Consumed` event with the given `batchId` has been emitted
 * by the vault. Used by the consume worker's crash-recovery path (Phase 5.2
 * Fix 2): when a DB row is stuck in `state='submitted'` past the timeout, the
 * worker queries the chain to determine whether the consume actually landed.
 *
 * Implementation: `getContractEvents` with the indexed `batchId` filter.
 * Scans from genesis (`fromBlock: 0n`) — acceptable because (a) `batchId` is
 * unique per `(wallet, firstAccrualAt, amount)` triple so the filter is highly
 * selective, and (b) recovery is a rare path. Phase 9+ may switch to a
 * bounded `fromBlock` if production scan time becomes problematic.
 *
 * @returns `true` if the chain has a `Consumed(_, _, batchId)` event,
 *          `false` otherwise (treat as "tx never landed").
 */
export async function wasConsumedOnChain(
  clients: BillingClients,
  vaultAddress: Address,
  batchId: Hex,
): Promise<boolean> {
  const events = await clients.publicClient.getContractEvents({
    address: vaultAddress,
    abi: CLAUDE_VAULT_ABI,
    eventName: "Consumed",
    args: { batchId },
    fromBlock: 0n,
    toBlock: "latest",
  });
  return events.length > 0;
}

/**
 * Read a user's PTON token balance.
 *
 * Pure read — used by Phase 6 `/v1/credits/me` to show the user their
 * undeposited PTON balance alongside their vault credits.
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts:196-207 (ptonBalance)
 *
 * @param clients - BillingClients bundle (only publicClient is used).
 * @param ptonAddress - PTON token contract address.
 * @param user - Wallet address to query.
 * @returns PTON token balance in atto-units.
 */
export async function ptonBalance(
  clients: BillingClients,
  ptonAddress: Address,
  user: Address,
): Promise<bigint> {
  // PTON_ABI is declared `as const`; viem infers `bigint` from the uint256
  // output. See note on readCredits above.
  return await clients.publicClient.readContract({
    address: ptonAddress,
    abi: PTON_ABI,
    functionName: "balanceOf",
    args: [user],
  });
}
