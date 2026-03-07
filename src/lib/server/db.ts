/**
 * Postgres connection for the standalone programmable-secrets Next.js app.
 * Uses its own isolated Postgres instance — NOT shared with registry-broker.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';
import { resolve } from 'path';

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _migrated = false;

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    'postgresql://ps:ps@localhost:5433/ps';
  _pool = new Pool({ connectionString, max: 5 });
  return _pool;
}

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

/**
 * Run migrations on startup. Safe to call multiple times — only
 * executes once per process. Creates the `hol` schema and all
 * programmable_secret_* tables if they don't exist.
 */
export async function ensureMigrated(): Promise<void> {
  if (_migrated) return;
  const pool = getPool();

  // Create the 'hol' schema if it doesn't exist
  await pool.query('CREATE SCHEMA IF NOT EXISTS "hol"');

  // Run each CREATE TABLE IF NOT EXISTS from the migration
  const statements = [
    // programmable_secret_indexer_state
    `CREATE TABLE IF NOT EXISTS "hol"."programmable_secret_indexer_state" (
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
    )`,
    // programmable_secret_policies
    `CREATE TABLE IF NOT EXISTS "hol"."programmable_secret_policies" (
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
    )`,
    // programmable_secret_key_requests
    `CREATE TABLE IF NOT EXISTS "hol"."programmable_secret_key_requests" (
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
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "programmable_secret_key_requests_policy_fk"
        FOREIGN KEY ("policy_record_id") REFERENCES "hol"."programmable_secret_policies"("id") ON DELETE CASCADE
    )`,
    // programmable_secret_purchases
    `CREATE TABLE IF NOT EXISTS "hol"."programmable_secret_purchases" (
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
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "programmable_secret_purchases_policy_fk"
        FOREIGN KEY ("policy_record_id") REFERENCES "hol"."programmable_secret_policies"("id") ON DELETE CASCADE
    )`,
    // programmable_secret_uaid_cache
    `CREATE TABLE IF NOT EXISTS "hol"."programmable_secret_uaid_cache" (
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
    )`,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }

  // Create indexes (no IF NOT EXISTS for indexes, so wrap in try/catch)
  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "hol_ps_indexer_state_contract_worker_uniq" ON "hol"."programmable_secret_indexer_state" ("network","chain_id","contract_address","worker_key")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_indexer_state_status_idx" ON "hol"."programmable_secret_indexer_state" ("network","status","updated_at")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "hol_ps_key_requests_nonce_uniq" ON "hol"."programmable_secret_key_requests" ("network","nonce")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_key_requests_policy_buyer_idx" ON "hol"."programmable_secret_key_requests" ("network","policy_id","buyer_address","created_at")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_key_requests_status_idx" ON "hol"."programmable_secret_key_requests" ("network","status","created_at")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "hol_ps_policies_chain_policy_uniq" ON "hol"."programmable_secret_policies" ("network","chain_id","contract_address","policy_id")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_policies_status_idx" ON "hol"."programmable_secret_policies" ("network","status","created_at")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_policies_provider_idx" ON "hol"."programmable_secret_policies" ("network","provider_address","created_at")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "hol_ps_purchases_chain_policy_buyer_uniq" ON "hol"."programmable_secret_purchases" ("network","chain_id","contract_address","policy_id","buyer_address")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "hol_ps_purchases_tx_uniq" ON "hol"."programmable_secret_purchases" ("purchase_tx_hash")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_purchases_policy_idx" ON "hol"."programmable_secret_purchases" ("network","policy_id","purchased_at")`,
    `CREATE INDEX IF NOT EXISTS "hol_ps_purchases_buyer_idx" ON "hol"."programmable_secret_purchases" ("network","buyer_address","purchased_at")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "hol_ps_uaid_cache_network_uaid_uniq" ON "hol"."programmable_secret_uaid_cache" ("network","uaid")`,
  ];

  for (const sql of indexes) {
    try { await pool.query(sql); } catch { /* index may already exist */ }
  }

  _migrated = true;
  console.log('[ps] database schema ready');
}

export { schema };
