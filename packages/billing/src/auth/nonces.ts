/**
 * DB-backed SIWE nonce store (Phase 4 — replaces in-memory Map from
 * proxy/src/auth.ts).
 *
 * Nonces are one-shot: `consumeNonce` deletes the row and returns the
 * envelope only if the nonce is valid and not yet expired.
 */

import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
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

  // CRITICAL: overwrite envelope.nonce with the actual generated nonce.
  // Callers pass an envelope with a placeholder nonce and expect this
  // function to fill it in — without the overwrite, the stored envelope
  // would have the placeholder while the client signs over the real
  // nonce, producing a signature that fails verification.
  const enrichedEnvelope = { ...(envelope as Record<string, unknown>), nonce };

  await db.insert(authNonces).values({
    nonce,
    envelope: enrichedEnvelope,
    issuedAt,
    expiresAt,
  });

  return nonce;
}

/**
 * Consume a nonce: atomically delete the row and return the stored envelope
 * if the nonce is valid and not expired. Returns `null` if the nonce does not
 * exist or has already expired.
 *
 * Implemented as a single conditional DELETE...RETURNING so concurrent callers
 * for the same nonce serialize correctly — only the winning DELETE returns a
 * row, and losers receive `null`. This avoids the TOCTOU race that would exist
 * if SELECT and DELETE were two separate statements.
 *
 * Expired rows are NOT deleted here (the predicate filters them out instead);
 * `sweepExpiredNonces` handles bulk cleanup of expired entries.
 */
export async function consumeNonce(
  db: BillingDatabase,
  nonce: string,
  now: Date,
): Promise<object | null> {
  const deleted = await db
    .delete(authNonces)
    .where(and(eq(authNonces.nonce, nonce), gt(authNonces.expiresAt, now)))
    .returning();

  if (deleted.length === 0) return null;
  return deleted[0]!.envelope as object;
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
