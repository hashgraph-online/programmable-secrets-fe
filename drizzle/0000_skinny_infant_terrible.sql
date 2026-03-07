CREATE SCHEMA "hol";
--> statement-breakpoint
CREATE TABLE "hol"."programmable_secret_indexer_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"chain_id" integer DEFAULT 46630 NOT NULL,
	"contract_address" text NOT NULL,
	"payment_module_address" text,
	"policy_vault_address" text,
	"access_receipt_address" text,
	"worker_key" text DEFAULT 'programmable-secrets-indexer' NOT NULL,
	"latest_indexed_block" bigint DEFAULT 0 NOT NULL,
	"latest_indexed_block_hash" text,
	"latest_indexed_at" timestamp with time zone,
	"last_seen_head_block" bigint,
	"replay_from_block" bigint,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hol"."programmable_secret_key_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"chain_id" integer DEFAULT 46630 NOT NULL,
	"contract_address" text NOT NULL,
	"payment_module_address" text NOT NULL,
	"policy_vault_address" text NOT NULL,
	"access_receipt_address" text NOT NULL,
	"policy_record_id" uuid NOT NULL,
	"policy_id" bigint NOT NULL,
	"receipt_token_id" bigint,
	"buyer_address" text NOT NULL,
	"status" text DEFAULT 'nonce-issued' NOT NULL,
	"nonce" text NOT NULL,
	"nonce_issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nonce_expires_at" timestamp with time zone NOT NULL,
	"nonce_consumed_at" timestamp with time zone,
	"challenge_message" text NOT NULL,
	"buyer_rsa_public_key_pem" text,
	"buyer_public_key_fingerprint" text,
	"signature" text,
	"encrypted_key" text,
	"ciphertext_url" text,
	"ciphertext_hash" text,
	"key_commitment" text,
	"metadata_json" jsonb,
	"result_payload" jsonb,
	"error_code" text,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hol"."programmable_secret_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"chain_id" integer DEFAULT 46630 NOT NULL,
	"contract_address" text NOT NULL,
	"payment_module_address" text NOT NULL,
	"policy_vault_address" text NOT NULL,
	"access_receipt_address" text NOT NULL,
	"policy_id" bigint,
	"status" text DEFAULT 'staged' NOT NULL,
	"provider_address" text NOT NULL,
	"payout_address" text NOT NULL,
	"payment_token" text DEFAULT '0x0000000000000000000000000000000000000000' NOT NULL,
	"price_wei" text NOT NULL,
	"expires_at" timestamp with time zone,
	"expires_at_unix" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"allowlist_enabled" boolean DEFAULT false NOT NULL,
	"ciphertext_hash" text NOT NULL,
	"key_commitment" text NOT NULL,
	"metadata_hash" text NOT NULL,
	"provider_uaid" text,
	"provider_uaid_hash" text NOT NULL,
	"ciphertext_path" text,
	"content_key_enc" text,
	"content_key_enc_iv" text,
	"content_key_enc_tag" text,
	"content_key_enc_aad" text,
	"content_key_enc_version" integer DEFAULT 1 NOT NULL,
	"metadata_json" jsonb,
	"created_tx_hash" text,
	"created_block_number" bigint,
	"created_block_hash" text,
	"created_log_index" integer,
	"policy_created_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"indexed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hol"."programmable_secret_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"chain_id" integer DEFAULT 46630 NOT NULL,
	"contract_address" text NOT NULL,
	"payment_module_address" text NOT NULL,
	"policy_vault_address" text NOT NULL,
	"access_receipt_address" text NOT NULL,
	"policy_record_id" uuid NOT NULL,
	"policy_id" bigint NOT NULL,
	"receipt_token_id" bigint NOT NULL,
	"buyer_address" text NOT NULL,
	"recipient_address" text NOT NULL,
	"payment_token" text NOT NULL,
	"price_wei" text NOT NULL,
	"purchase_tx_hash" text NOT NULL,
	"purchase_block_number" bigint,
	"purchase_block_hash" text,
	"purchase_log_index" integer,
	"purchased_at_unix" bigint NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"ciphertext_hash" text NOT NULL,
	"key_commitment" text NOT NULL,
	"status" text DEFAULT 'indexed' NOT NULL,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hol"."programmable_secret_uaid_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"uaid" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"validation_result" jsonb,
	"resolution_result" jsonb,
	"agent_detail_result" jsonb,
	"verification_result" jsonb,
	"error_message" text,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hol"."programmable_secret_key_requests" ADD CONSTRAINT "programmable_secret_key_requests_policy_record_id_programmable_secret_policies_id_fk" FOREIGN KEY ("policy_record_id") REFERENCES "hol"."programmable_secret_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hol"."programmable_secret_purchases" ADD CONSTRAINT "programmable_secret_purchases_policy_record_id_programmable_secret_policies_id_fk" FOREIGN KEY ("policy_record_id") REFERENCES "hol"."programmable_secret_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hol_programmable_secret_indexer_state_contract_worker_unique" ON "hol"."programmable_secret_indexer_state" USING btree ("network","chain_id","contract_address","worker_key");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_indexer_state_status_idx" ON "hol"."programmable_secret_indexer_state" USING btree ("network","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hol_programmable_secret_key_requests_nonce_unique" ON "hol"."programmable_secret_key_requests" USING btree ("network","nonce");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_key_requests_policy_buyer_idx" ON "hol"."programmable_secret_key_requests" USING btree ("network","policy_id","buyer_address","created_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_key_requests_status_idx" ON "hol"."programmable_secret_key_requests" USING btree ("network","status","created_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_key_requests_fingerprint_idx" ON "hol"."programmable_secret_key_requests" USING btree ("network","buyer_public_key_fingerprint","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hol_programmable_secret_policies_chain_policy_unique" ON "hol"."programmable_secret_policies" USING btree ("network","chain_id","contract_address","policy_id");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_policies_policy_idx" ON "hol"."programmable_secret_policies" USING btree ("network","policy_id");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_policies_status_idx" ON "hol"."programmable_secret_policies" USING btree ("network","status","created_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_policies_provider_idx" ON "hol"."programmable_secret_policies" USING btree ("network","provider_address","created_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_policies_uaid_idx" ON "hol"."programmable_secret_policies" USING btree ("network","provider_uaid","updated_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_policies_metadata_idx" ON "hol"."programmable_secret_policies" USING btree ("network","metadata_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "hol_programmable_secret_purchases_chain_policy_buyer_unique" ON "hol"."programmable_secret_purchases" USING btree ("network","chain_id","contract_address","policy_id","buyer_address");--> statement-breakpoint
CREATE UNIQUE INDEX "hol_programmable_secret_purchases_tx_unique" ON "hol"."programmable_secret_purchases" USING btree ("purchase_tx_hash");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_purchases_policy_idx" ON "hol"."programmable_secret_purchases" USING btree ("network","policy_id","purchased_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_purchases_buyer_idx" ON "hol"."programmable_secret_purchases" USING btree ("network","buyer_address","purchased_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_purchases_status_idx" ON "hol"."programmable_secret_purchases" USING btree ("network","status","purchased_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hol_programmable_secret_uaid_cache_network_uaid_unique" ON "hol"."programmable_secret_uaid_cache" USING btree ("network","uaid");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_uaid_cache_status_idx" ON "hol"."programmable_secret_uaid_cache" USING btree ("network","status","cached_at");--> statement-breakpoint
CREATE INDEX "hol_programmable_secret_uaid_cache_cached_at_idx" ON "hol"."programmable_secret_uaid_cache" USING btree ("network","cached_at");