/**
 * DB-backed top-up quote store (Phase 4 — replaces in-memory Map from
 * proxy/src/quotes.ts).
 *
 * A "quote" covers a deposit: the proxy issues a `topupId` when the wallet's
 * balance is insufficient; the client signs an EIP-3009 authorization for
 * `amountPton` and submits it back. Quotes are single-use (consumed_at set
 * on first use) and have a configurable TTL.
 */

import { eq, lt, isNull, and } from "drizzle-orm";
import type { Address } from "viem";
import { topupQuotes, type BillingDatabase } from "../ledger/schema.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a new top-up quote. The quote is valid until `expiresAt`.
 */
export async function storeQuote(
  db: BillingDatabase,
  args: {
    id: string;
    wallet: Address;
    amountPton: bigint;
    amountUsd: number;
    tonUsd: number;
    ttlMs: number;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + args.ttlMs);

  await db.insert(topupQuotes).values({
    id: args.id,
    wallet: args.wallet.toLowerCase(),
    amountPton: args.amountPton,
    amountUsd: args.amountUsd.toString(),
    tonUsd: args.tonUsd.toString(),
    expiresAt,
    consumedAt: null,
  });
}

export interface QuoteDetails {
  wallet: Address;
  amountPton: bigint;
  amountUsd: number;
  tonUsd: number;
}

/**
 * Fetch a quote if it exists, is not expired, and has not been consumed.
 * Returns `null` otherwise.
 */
export async function fetchQuote(
  db: BillingDatabase,
  id: string,
  now: Date,
): Promise<QuoteDetails | null> {
  const rows = await db
    .select()
    .from(topupQuotes)
    .where(
      and(
        eq(topupQuotes.id, id),
        isNull(topupQuotes.consumedAt),
      ),
    );

  if (rows.length === 0) return null;

  const row = rows[0]!;
  if (row.expiresAt <= now) return null;

  return {
    wallet: row.wallet as Address,
    amountPton: row.amountPton,
    amountUsd: Number(row.amountUsd),
    tonUsd: Number(row.tonUsd),
  };
}

/**
 * Atomically mark a quote as consumed. Returns `true` if this call performed
 * the consumption, `false` if the quote was already consumed (or does not
 * exist).
 *
 * Implemented as a single UPDATE ... WHERE consumed_at IS NULL ... RETURNING
 * so concurrent callers for the same quote ID serialize correctly — only the
 * winning UPDATE flips `consumed_at` and returns a row. Callers should treat
 * `false` as a 409 conflict ("quote already consumed").
 */
export async function consumeQuote(db: BillingDatabase, id: string): Promise<boolean> {
  const result = await db
    .update(topupQuotes)
    .set({ consumedAt: new Date() })
    .where(and(eq(topupQuotes.id, id), isNull(topupQuotes.consumedAt)))
    .returning();

  return result.length > 0;
}

/**
 * Delete all expired and unconsumed quotes. Returns the count deleted.
 */
export async function sweepExpiredQuotes(
  db: BillingDatabase,
  now: Date,
): Promise<number> {
  const result = await db
    .delete(topupQuotes)
    .where(
      and(
        lt(topupQuotes.expiresAt, now),
        isNull(topupQuotes.consumedAt),
      ),
    )
    .returning();

  return result.length;
}
