CREATE INDEX "billing_api_keys_hash_idx" ON "billing_api_keys" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "billing_auth_nonces_expires_at_idx" ON "billing_auth_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "billing_preauth_wallet_state_valid_before_idx" ON "billing_topup_preauth_slots" USING btree ("wallet","state","valid_before");--> statement-breakpoint
CREATE INDEX "billing_topup_quotes_expires_at_idx" ON "billing_topup_quotes" USING btree ("expires_at");