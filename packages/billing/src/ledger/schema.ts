/**
 * Drizzle ORM schema for @tokagentos/billing (Phase 4).
 *
 * All tables are namespaced `billing_*` to avoid collision with existing
 * tokagentos tables managed by @elizaos/plugin-sql.
 *
 * Decision Z16: All balance/reserved/accrued/amount_pton columns use the
 * `numericBigint` custom type (numeric(78,0) ↔ bigint) for atto-PTON
 * precision without precision loss from floating-point.
 */

import {
  pgTable,
  pgEnum,
  text,
  uuid,
  smallint,
  integer,
  jsonb,
  timestamp,
  index,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { sql, type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";

// ---------------------------------------------------------------------------
// D16 — numeric(78,0) ↔ bigint custom column type
// ---------------------------------------------------------------------------

/**
 * `numeric(78, 0) ↔ bigint` custom column type for NOT NULL columns.
 * Used for atto-PTON amounts (up to ~1e27) which exceed JavaScript's
 * `Number.MAX_SAFE_INTEGER`. Use `.notNull()` on every column that uses
 * this type — the `data: bigint` generic does not model null safely
 * (`BigInt(null)` throws `SyntaxError`).
 *
 * For nullable numeric(78,0) columns, use `nullableNumericBigint` below.
 */
export const numericBigint = customType<{
  data: bigint;
  driverData: string;
}>({
  dataType: () => "numeric(78, 0)",
  fromDriver: (value: string) => BigInt(value),
  toDriver: (value: bigint) => value.toString(),
});

/**
 * Nullable variant of `numericBigint`. Defends against `BigInt(null)` crashes
 * for columns that legitimately allow NULL. `fromDriver` returns `null` for
 * null input; otherwise the round-trip is identical to `numericBigint`.
 *
 * Use this for placeholder columns reserved for future features (e.g.,
 * `billing_api_keys.quota_pton` per OQ2) where NULL means "unset".
 */
export const nullableNumericBigint = customType<{
  data: bigint | null;
  driverData: string | null;
}>({
  dataType: () => "numeric(78, 0)",
  fromDriver: (value: string | null) => (value === null ? null : BigInt(value)),
  toDriver: (value: bigint | null) => (value === null ? null : value.toString()),
});

// The numeric(20,8) type for USD amounts (no bigint, keep as string for
// driver compatibility; callers parse to number as needed).
export const numericUsd = customType<{
  data: string;
  driverData: string;
}>({
  dataType: () => "numeric(20, 8)",
  fromDriver: (value: string) => value,
  toDriver: (value: string) => value,
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const reservationOutcomeEnum = pgEnum("billing_reservation_outcome", [
  "committed",
  "released_complete",
  "released_abort",
  "released_error",
]);

export const consumeBatchStateEnum = pgEnum("billing_consume_batch_state", [
  "pending",
  "submitted",
  "confirmed",
  "dead_letter",
]);

export const preauthSlotStateEnum = pgEnum("billing_preauth_slot_state", [
  "available",
  "consumed",
  "poisoned",
  "expired",
]);

export const callLogStatusEnum = pgEnum("billing_call_log_status", [
  "ok",
  "error",
  "aborted",
]);

// ---------------------------------------------------------------------------
// Table 1: billing_credit_state
// ---------------------------------------------------------------------------

export const creditState = pgTable("billing_credit_state", {
  wallet: text("wallet").primaryKey(), // lowercased, 0x-prefixed
  // SQL defaults avoid BigInt serialization issues with drizzle-kit
  balance: numericBigint("balance").notNull().default(sql`'0'`),
  reserved: numericBigint("reserved").notNull().default(sql`'0'`),
  accrued: numericBigint("accrued").notNull().default(sql`'0'`),
  firstAccrualAt: timestamp("first_accrual_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastHydratedAt: timestamp("last_hydrated_at", {
    withTimezone: true,
    mode: "date",
  }),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CreditStateRow = InferSelectModel<typeof creditState>;
export type CreditStateInsert = InferInsertModel<typeof creditState>;

// ---------------------------------------------------------------------------
// Table 2: billing_reservations
// ---------------------------------------------------------------------------

export const reservations = pgTable("billing_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet: text("wallet")
    .notNull()
    .references(() => creditState.wallet),
  amountPton: numericBigint("amount_pton").notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .$defaultFn(() => new Date()),
  releasedAt: timestamp("released_at", {
    withTimezone: true,
    mode: "date",
  }),
  outcome: reservationOutcomeEnum("outcome"),
});

export type ReservationRow = InferSelectModel<typeof reservations>;
export type ReservationInsert = InferInsertModel<typeof reservations>;

// ---------------------------------------------------------------------------
// Table 3: billing_consume_batches
// ---------------------------------------------------------------------------

export const consumeBatches = pgTable("billing_consume_batches", {
  // keccak256(wallet || firstAccrualAt || amount) — stored as hex text for
  // portability; bytea would require hex encoding on every comparison.
  batchId: text("batch_id").primaryKey(),
  wallet: text("wallet").notNull(),
  amountPton: numericBigint("amount_pton").notNull(),
  state: consumeBatchStateEnum("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  txHash: text("tx_hash"), // hex-encoded, nullable
  firstAttemptAt: timestamp("first_attempt_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export type ConsumeBatchRow = InferSelectModel<typeof consumeBatches>;
export type ConsumeBatchInsert = InferInsertModel<typeof consumeBatches>;

// ---------------------------------------------------------------------------
// Table 4: billing_topup_quotes
// ---------------------------------------------------------------------------

export const topupQuotes = pgTable(
  "billing_topup_quotes",
  {
    id: text("id").primaryKey(), // topupId
    wallet: text("wallet").notNull(),
    amountPton: numericBigint("amount_pton").notNull(),
    amountUsd: numericUsd("amount_usd").notNull(),
    tonUsd: numericUsd("ton_usd").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    // sweepExpiredQuotes scans by expires_at; index keeps the daily DELETE fast.
    index("billing_topup_quotes_expires_at_idx").on(table.expiresAt),
  ],
);

export type TopupQuoteRow = InferSelectModel<typeof topupQuotes>;
export type TopupQuoteInsert = InferInsertModel<typeof topupQuotes>;

// ---------------------------------------------------------------------------
// Table 5: billing_topup_preauth_slots
// ---------------------------------------------------------------------------

export const topupPreauthSlots = pgTable(
  "billing_topup_preauth_slots",
  {
    wallet: text("wallet").notNull(),
    nonce: text("nonce").notNull(), // EIP-3009 nonce, hex-encoded
    amountPton: numericBigint("amount_pton").notNull(),
    validAfter: timestamp("valid_after", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    validBefore: timestamp("valid_before", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    v: smallint("v").notNull(),
    r: text("r").notNull(), // hex-encoded
    s: text("s").notNull(), // hex-encoded
    state: preauthSlotStateEnum("state").notNull().default("available"),
  },
  (table) => [
    primaryKey({ columns: [table.wallet, table.nonce] }),
    // nextAvailableSlot filters by (wallet, state) and orders by validBefore.
    index("billing_preauth_wallet_state_valid_before_idx").on(
      table.wallet,
      table.state,
      table.validBefore,
    ),
  ],
);

export type TopupPreauthSlotRow = InferSelectModel<typeof topupPreauthSlots>;
export type TopupPreauthSlotInsert = InferInsertModel<typeof topupPreauthSlots>;

// ---------------------------------------------------------------------------
// Table 6: billing_api_keys
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "billing_api_keys",
  {
    id: text("id").primaryKey(), // sk-ai-{32 random hex chars}
    wallet: text("wallet").notNull(),
    name: text("name").notNull(),
    hash: text("hash").notNull(), // hex-encoded HMAC-SHA256
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    // Phase 9+ rate-limit placeholder per OQ2 decision (docs/decisions.md).
    // Nullable: unused until quotas land. Adding it now avoids a future
    // schema migration on a hot table. Uses `nullableNumericBigint` so the
    // driver doesn't `BigInt(null)`-crash on default NULL reads.
    quotaPton: nullableNumericBigint("quota_pton"),
  },
  (table) => [
    // resolveApiKey filters by hash on every authenticated request. Without
    // an index this is a sequential scan — the highest-volume billing hot path.
    index("billing_api_keys_hash_idx").on(table.hash),
  ],
);

export type ApiKeyRow = InferSelectModel<typeof apiKeys>;
export type ApiKeyInsert = InferInsertModel<typeof apiKeys>;

// ---------------------------------------------------------------------------
// Table 7: billing_auth_nonces
// ---------------------------------------------------------------------------

export const authNonces = pgTable(
  "billing_auth_nonces",
  {
    nonce: text("nonce").primaryKey(),
    envelope: jsonb("envelope").notNull(), // EIP-712 typed-data
    issuedAt: timestamp("issued_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    // sweepExpiredNonces scans by expires_at.
    index("billing_auth_nonces_expires_at_idx").on(table.expiresAt),
  ],
);

export type AuthNonceRow = InferSelectModel<typeof authNonces>;
export type AuthNonceInsert = InferInsertModel<typeof authNonces>;

// ---------------------------------------------------------------------------
// Table 8: billing_call_log
// ---------------------------------------------------------------------------

export const callLog = pgTable(
  "billing_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wallet: text("wallet").notNull(),
    apiKeyId: text("api_key_id"),
    ts: timestamp("ts", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheInputTokens: integer("cache_input_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    costUsd: numericUsd("cost_usd").notNull(),
    costPton: numericBigint("cost_pton").notNull(),
    requestId: text("request_id").notNull(),
    status: callLogStatusEnum("status").notNull(),
  },
  (table) => [
    index("billing_call_log_wallet_ts_idx").on(table.wallet, table.ts),
    index("billing_call_log_ts_idx").on(table.ts),
    index("billing_call_log_wallet_key_ts_idx").on(
      table.wallet,
      table.apiKeyId,
      table.ts,
    ),
  ],
);

export type CallLogRow = InferSelectModel<typeof callLog>;
export type CallLogInsert = InferInsertModel<typeof callLog>;

// ---------------------------------------------------------------------------
// Schema bundle and BillingDatabase union type (Decision D11)
// ---------------------------------------------------------------------------

export const schema = {
  creditState,
  reservations,
  consumeBatches,
  topupQuotes,
  topupPreauthSlots,
  apiKeys,
  authNonces,
  callLog,
  // Enums must be included for drizzle-kit to generate CREATE TYPE statements
  reservationOutcomeEnum,
  consumeBatchStateEnum,
  preauthSlotStateEnum,
  callLogStatusEnum,
};

export type Schema = typeof schema;

/**
 * BillingDatabase — union of NodePgDatabase (production) and PgliteDatabase
 * (tests). Both implement the same Drizzle query API so ledger functions work
 * unchanged in both environments. (Decision D11)
 */
export type BillingDatabase =
  | NodePgDatabase<Schema>
  | PgliteDatabase<Schema>;
