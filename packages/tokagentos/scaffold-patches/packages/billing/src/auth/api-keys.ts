/**
 * DB-backed API key store (Phase 4 — replaces in-memory Map from
 * proxy/src/apiKeys.ts). Keys use the sk-ai-* prefix convention and are
 * HMAC-SHA256 hashed before storage; plaintext is never persisted.
 *
 * Decision G3/G4: `resolveApiKey` does NOT update `last_used_at` synchronously
 * (that would be a write on every authenticated request). Instead, expose
 * `bumpLastUsed()` for batch updates by a Phase 5 cron job.
 */

import { createHmac, randomBytes } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import type { Address } from "viem";
import { apiKeys, type BillingDatabase } from "../ledger/schema.js";

const KEY_PREFIX = "sk-ai-";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hashKey(plaintext: string, authSecret: string): string {
  return createHmac("sha256", authSecret).update(plaintext).digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MintedApiKey {
  id: string;
  plaintext: string; // shown ONCE to user, never persisted
}

/**
 * Mint a new API key for `wallet`. Returns the plaintext (shown once) and
 * the stable key `id` for display/revocation purposes.
 *
 * ID format: `sk-ai-` prefix + first 8 hex chars (display-safe, collision-
 * resistant enough for display). Full random part is 32 hex chars (128 bits).
 */
export async function mintApiKey(
  db: BillingDatabase,
  args: { wallet: Address; name: string; authSecret: string },
): Promise<MintedApiKey> {
  const raw = randomBytes(32).toString("hex");
  const plaintext = `${KEY_PREFIX}${raw}`;
  const id = `${KEY_PREFIX}${raw.slice(0, 8)}`;
  const hash = hashKey(plaintext, args.authSecret);
  const wallet = args.wallet.toLowerCase() as Address;

  await db.insert(apiKeys).values({
    id,
    wallet,
    name: args.name,
    hash,
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  });

  return { id, plaintext };
}

/**
 * Resolve a plaintext API key to its wallet identity. Returns `null` if the
 * key is missing, malformed, or revoked.
 *
 * Does NOT update `last_used_at` (Decision G4 — async batch update).
 */
export async function resolveApiKey(
  db: BillingDatabase,
  plaintext: string,
  authSecret: string,
): Promise<{ id: string; wallet: Address } | null> {
  if (typeof plaintext !== "string" || !plaintext.startsWith(KEY_PREFIX)) {
    return null;
  }

  const hash = hashKey(plaintext, authSecret);

  const rows = await db
    .select({ id: apiKeys.id, wallet: apiKeys.wallet })
    .from(apiKeys)
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)));

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return { id: row.id, wallet: row.wallet as Address };
}

export interface ApiKeyListEntry {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * List all API keys for a wallet (including revoked). Sorted by `created_at`
 * descending (most recent first), matching source semantics.
 */
export async function listApiKeys(
  db: BillingDatabase,
  wallet: Address,
): Promise<ApiKeyListEntry[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.wallet, wallet.toLowerCase()));

  // Sort descending by createdAt in-process (small result sets, avoids SQL
  // ORDER BY which requires an explicit index in PGLite).
  return rows
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt ?? null,
      revokedAt: r.revokedAt ?? null,
    }));
}

/**
 * Revoke an API key by `id`. ACL check: the key must belong to `wallet`.
 * Throws if the key does not exist or belongs to a different wallet.
 * Idempotent: revoking an already-revoked key is a no-op (no error).
 */
export async function revokeApiKey(
  db: BillingDatabase,
  id: string,
  wallet: Address,
): Promise<void> {
  const rows = await db
    .select({ id: apiKeys.id, wallet: apiKeys.wallet, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, id));

  if (rows.length === 0) {
    throw new Error(`revokeApiKey: key ${id} not found`);
  }

  const row = rows[0]!;
  if (row.wallet.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error(`revokeApiKey: key ${id} does not belong to wallet ${wallet}`);
  }

  if (row.revokedAt !== null) return; // already revoked — idempotent

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, id));
}

/**
 * Hard-delete an API key row from the database (vs. {@link revokeApiKey},
 * which sets `revokedAt` and keeps the row for audit trail).
 *
 * Use this when the operator wants to reclaim disk space or when revoked
 * keys would otherwise accumulate unbounded over the lifetime of a wallet.
 * The historical `billing_call_log` rows still reference `apiKeyId` as a
 * plain text column (no FK constraint), so call-log history survives.
 *
 * Authorization: the caller MUST already have proven ownership — same
 * checks as {@link revokeApiKey}.
 *
 * Idempotent: if the key doesn't exist, returns silently (no throw).
 */
export async function deleteApiKey(
  db: BillingDatabase,
  id: string,
  wallet: Address,
): Promise<void> {
  const rows = await db
    .select({ id: apiKeys.id, wallet: apiKeys.wallet })
    .from(apiKeys)
    .where(eq(apiKeys.id, id));

  if (rows.length === 0) return; // already gone — idempotent

  const row = rows[0]!;
  if (row.wallet.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error(`deleteApiKey: key ${id} does not belong to wallet ${wallet}`);
  }

  await db.delete(apiKeys).where(eq(apiKeys.id, id));
}

/**
 * Batch-update `last_used_at` for a set of key IDs.
 * Called by the Phase 5 cron worker, not on the hot request path.
 */
export async function bumpLastUsed(
  db: BillingDatabase,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date();
  // Update each ID individually — in practice the batch is small (< 100).
  // A single `WHERE id IN (...)` update would also work but requires manual
  // SQL construction; the per-row approach keeps Drizzle typesafe.
  for (const id of ids) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(apiKeys.id, id));
  }
}
