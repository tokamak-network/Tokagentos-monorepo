CREATE TYPE "public"."billing_call_log_status" AS ENUM('ok', 'error', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."billing_consume_batch_state" AS ENUM('pending', 'submitted', 'confirmed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."billing_preauth_slot_state" AS ENUM('available', 'consumed', 'poisoned', 'expired');--> statement-breakpoint
CREATE TYPE "public"."billing_reservation_outcome" AS ENUM('committed', 'released_complete', 'released_abort', 'released_error');--> statement-breakpoint
CREATE TABLE "billing_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"envelope" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"api_key_id" text,
	"ts" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(20, 8) NOT NULL,
	"cost_pton" numeric(78, 0) NOT NULL,
	"request_id" text NOT NULL,
	"status" "billing_call_log_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_consume_batches" (
	"batch_id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"amount_pton" numeric(78, 0) NOT NULL,
	"state" "billing_consume_batch_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"tx_hash" text,
	"first_attempt_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_credit_state" (
	"wallet" text PRIMARY KEY NOT NULL,
	"balance" numeric(78, 0) DEFAULT '0' NOT NULL,
	"reserved" numeric(78, 0) DEFAULT '0' NOT NULL,
	"accrued" numeric(78, 0) DEFAULT '0' NOT NULL,
	"first_accrual_at" timestamp with time zone,
	"last_hydrated_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"amount_pton" numeric(78, 0) NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"outcome" "billing_reservation_outcome"
);
--> statement-breakpoint
CREATE TABLE "billing_topup_preauth_slots" (
	"wallet" text NOT NULL,
	"nonce" text NOT NULL,
	"amount_pton" numeric(78, 0) NOT NULL,
	"valid_after" timestamp with time zone NOT NULL,
	"valid_before" timestamp with time zone NOT NULL,
	"v" smallint NOT NULL,
	"r" text NOT NULL,
	"s" text NOT NULL,
	"state" "billing_preauth_slot_state" DEFAULT 'available' NOT NULL,
	CONSTRAINT "billing_topup_preauth_slots_wallet_nonce_pk" PRIMARY KEY("wallet","nonce")
);
--> statement-breakpoint
CREATE TABLE "billing_topup_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"amount_pton" numeric(78, 0) NOT NULL,
	"amount_usd" numeric(20, 8) NOT NULL,
	"ton_usd" numeric(20, 8) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_reservations" ADD CONSTRAINT "billing_reservations_wallet_billing_credit_state_wallet_fk" FOREIGN KEY ("wallet") REFERENCES "public"."billing_credit_state"("wallet") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_call_log_wallet_ts_idx" ON "billing_call_log" USING btree ("wallet","ts");--> statement-breakpoint
CREATE INDEX "billing_call_log_ts_idx" ON "billing_call_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "billing_call_log_wallet_key_ts_idx" ON "billing_call_log" USING btree ("wallet","api_key_id","ts");