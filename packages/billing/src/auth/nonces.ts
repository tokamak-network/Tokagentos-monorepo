/**
 * DB-backed SIWE nonce store (Phase 4 — replaces in-memory Map from
 * proxy/src/auth.ts).
 *
 * Nonces are one-shot: `consumeNonce` deletes the row and returns the
 * envelope only if the nonce is valid and not yet expired.
 */

import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { authNonces, type BillingDatabase } from "../ledger/schema.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Issue a new nonce and store it alongside the EIP-712 `envelope` (typed-data
 * object). The nonce is a 32-byte random hex string (64 chars, 0x-prefixed).
 *
 * Returns the nonce string. The caller includes it in the login challenge
 * response so the client can sign it.
 */
export async function issueNonce(
  db: BillingDatabase,
  envelope: object,
  ttlMs: number,
): Promise<string> {
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlMs);

  await db.insert(authNonces).values({
    nonce,
    envelope,
    issuedAt,
    expiresAt,
  });

  return nonce;
}

/**
 * Consume a nonce: delete the row and return the stored envelope if the nonce
 * is valid and not expired. Returns `null` if the nonce does not exist or has
 * already expired.
 *
 * Deletion is unconditional (even on expiry) so stale rows are cleaned up
 * eagerly. `sweepExpiredNonces` handles bulk cleanup.
 */
export async function consumeNonce(
  db: BillingDatabase,
  nonce: string,
  now: Date,
): Promise<object | null> {
  // Fetch first so we can check expiry before deleting.
  const rows = await db
    .select()
    .from(authNonces)
    .where(eq(authNonces.nonce, nonce));

  if (rows.length === 0) return null;

  const row = rows[0]!;

  // Always delete the row (one-shot semantics).
  await db.delete(authNonces).where(eq(authNonces.nonce, nonce));

  if (row.expiresAt <= now) return null;

  return row.envelope as object;
}

/**
 * Delete all expired nonces. Called by a maintenance sweep (Phase 5 worker).
 * Returns the count of rows deleted.
 */
export async function sweepExpiredNonces(
  db: BillingDatabase,
  now: Date,
): Promise<number> {
  const result = await db
    .delete(authNonces)
    .where(lt(authNonces.expiresAt, now))
    .returning();

  return result.length;
}
