import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const holProgrammableSecrets = pgSchema('hol');

export const holProgrammableSecretPolicies = holProgrammableSecrets.table(
  'programmable_secret_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    network: text('network').notNull().default('testnet'),
    chainId: integer('chain_id').notNull().default(46630),
    contractAddress: text('contract_address').notNull(),
    paymentModuleAddress: text('payment_module_address').notNull(),
    policyVaultAddress: text('policy_vault_address').notNull(),
    accessReceiptAddress: text('access_receipt_address').notNull(),
    policyId: bigint('policy_id', { mode: 'number' }),
    status: text('status').notNull().default('staged'),
    providerAddress: text('provider_address').notNull(),
    payoutAddress: text('payout_address').notNull(),
    paymentToken: text('payment_token')
      .notNull()
      .default('0x0000000000000000000000000000000000000000'),
    priceWei: text('price_wei').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    expiresAtUnix: bigint('expires_at_unix', { mode: 'number' }),
    active: boolean('active').notNull().default(true),
    allowlistEnabled: boolean('allowlist_enabled').notNull().default(false),
    ciphertextHash: text('ciphertext_hash').notNull(),
    keyCommitment: text('key_commitment').notNull(),
    metadataHash: text('metadata_hash').notNull(),
    providerUaid: text('provider_uaid'),
    providerUaidHash: text('provider_uaid_hash').notNull(),
    ciphertextPath: text('ciphertext_path'),
    contentKeyEnc: text('content_key_enc'),
    contentKeyEncIv: text('content_key_enc_iv'),
    contentKeyEncTag: text('content_key_enc_tag'),
    contentKeyEncAad: text('content_key_enc_aad'),
    contentKeyEncVersion: integer('content_key_enc_version')
      .notNull()
      .default(1),
    metadataJson: jsonb('metadata_json'),
    createdTxHash: text('created_tx_hash'),
    createdBlockNumber: bigint('created_block_number', { mode: 'number' }),
    createdBlockHash: text('created_block_hash'),
    createdLogIndex: integer('created_log_index'),
    policyCreatedAt: timestamp('policy_created_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    chainPolicyUnique: uniqueIndex('hol_programmable_secret_policies_chain_policy_unique').on(
      table.network,
      table.chainId,
      table.contractAddress,
      table.policyId,
    ),
    policyIdx: index('hol_programmable_secret_policies_policy_idx').on(
      table.network,
      table.policyId,
    ),
    statusIdx: index('hol_programmable_secret_policies_status_idx').on(
      table.network,
      table.status,
      table.createdAt,
    ),
    providerIdx: index('hol_programmable_secret_policies_provider_idx').on(
      table.network,
      table.providerAddress,
      table.createdAt,
    ),
    uaidIdx: index('hol_programmable_secret_policies_uaid_idx').on(
      table.network,
      table.providerUaid,
      table.updatedAt,
    ),
    metadataIdx: index('hol_programmable_secret_policies_metadata_idx').on(
      table.network,
      table.metadataHash,
    ),
  }),
);

export const holProgrammableSecretPurchases = holProgrammableSecrets.table(
  'programmable_secret_purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    network: text('network').notNull().default('testnet'),
    chainId: integer('chain_id').notNull().default(46630),
    contractAddress: text('contract_address').notNull(),
    paymentModuleAddress: text('payment_module_address').notNull(),
    policyVaultAddress: text('policy_vault_address').notNull(),
    accessReceiptAddress: text('access_receipt_address').notNull(),
    policyRecordId: uuid('policy_record_id')
      .references(() => holProgrammableSecretPolicies.id, { onDelete: 'cascade' })
      .notNull(),
    policyId: bigint('policy_id', { mode: 'number' }).notNull(),
    receiptTokenId: bigint('receipt_token_id', { mode: 'number' }).notNull(),
    buyerAddress: text('buyer_address').notNull(),
    recipientAddress: text('recipient_address').notNull(),
    paymentToken: text('payment_token').notNull(),
    priceWei: text('price_wei').notNull(),
    purchaseTxHash: text('purchase_tx_hash').notNull(),
    purchaseBlockNumber: bigint('purchase_block_number', { mode: 'number' }),
    purchaseBlockHash: text('purchase_block_hash'),
    purchaseLogIndex: integer('purchase_log_index'),
    purchasedAtUnix: bigint('purchased_at_unix', { mode: 'number' }).notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
    ciphertextHash: text('ciphertext_hash').notNull(),
    keyCommitment: text('key_commitment').notNull(),
    status: text('status').notNull().default('indexed'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    chainPolicyBuyerUnique: uniqueIndex(
      'hol_programmable_secret_purchases_chain_policy_buyer_unique',
    ).on(
      table.network,
      table.chainId,
      table.contractAddress,
      table.policyId,
      table.buyerAddress,
    ),
    purchaseTxUnique: uniqueIndex(
      'hol_programmable_secret_purchases_tx_unique',
    ).on(table.purchaseTxHash),
    policyIdx: index('hol_programmable_secret_purchases_policy_idx').on(
      table.network,
      table.policyId,
      table.purchasedAt,
    ),
    buyerIdx: index('hol_programmable_secret_purchases_buyer_idx').on(
      table.network,
      table.buyerAddress,
      table.purchasedAt,
    ),
    statusIdx: index('hol_programmable_secret_purchases_status_idx').on(
      table.network,
      table.status,
      table.purchasedAt,
    ),
  }),
);

export const holProgrammableSecretKeyRequests = holProgrammableSecrets.table(
  'programmable_secret_key_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    network: text('network').notNull().default('testnet'),
    chainId: integer('chain_id').notNull().default(46630),
    contractAddress: text('contract_address').notNull(),
    paymentModuleAddress: text('payment_module_address').notNull(),
    policyVaultAddress: text('policy_vault_address').notNull(),
    accessReceiptAddress: text('access_receipt_address').notNull(),
    policyRecordId: uuid('policy_record_id')
      .references(() => holProgrammableSecretPolicies.id, { onDelete: 'cascade' })
      .notNull(),
    policyId: bigint('policy_id', { mode: 'number' }).notNull(),
    receiptTokenId: bigint('receipt_token_id', { mode: 'number' }),
    buyerAddress: text('buyer_address').notNull(),
    status: text('status').notNull().default('nonce-issued'),
    nonce: text('nonce').notNull(),
    nonceIssuedAt: timestamp('nonce_issued_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    nonceExpiresAt: timestamp('nonce_expires_at', { withTimezone: true }).notNull(),
    nonceConsumedAt: timestamp('nonce_consumed_at', { withTimezone: true }),
    challengeMessage: text('challenge_message').notNull(),
    buyerRsaPublicKeyPem: text('buyer_rsa_public_key_pem'),
    buyerPublicKeyFingerprint: text('buyer_public_key_fingerprint'),
    signature: text('signature'),
    encryptedKey: text('encrypted_key'),
    ciphertextUrl: text('ciphertext_url'),
    ciphertextHash: text('ciphertext_hash'),
    keyCommitment: text('key_commitment'),
    metadataJson: jsonb('metadata_json'),
    resultPayload: jsonb('result_payload'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nonceUnique: uniqueIndex('hol_programmable_secret_key_requests_nonce_unique').on(
      table.network,
      table.nonce,
    ),
    policyBuyerIdx: index('hol_programmable_secret_key_requests_policy_buyer_idx').on(
      table.network,
      table.policyId,
      table.buyerAddress,
      table.createdAt,
    ),
    statusIdx: index('hol_programmable_secret_key_requests_status_idx').on(
      table.network,
      table.status,
      table.createdAt,
    ),
    fingerprintIdx: index('hol_programmable_secret_key_requests_fingerprint_idx').on(
      table.network,
      table.buyerPublicKeyFingerprint,
      table.createdAt,
    ),
  }),
);

export const holProgrammableSecretIndexerState = holProgrammableSecrets.table(
  'programmable_secret_indexer_state',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    network: text('network').notNull().default('testnet'),
    chainId: integer('chain_id').notNull().default(46630),
    contractAddress: text('contract_address').notNull(),
    paymentModuleAddress: text('payment_module_address'),
    policyVaultAddress: text('policy_vault_address'),
    accessReceiptAddress: text('access_receipt_address'),
    workerKey: text('worker_key').notNull().default('programmable-secrets-indexer'),
    latestIndexedBlock: bigint('latest_indexed_block', { mode: 'number' })
      .notNull()
      .default(0),
    latestIndexedBlockHash: text('latest_indexed_block_hash'),
    latestIndexedAt: timestamp('latest_indexed_at', { withTimezone: true }),
    lastSeenHeadBlock: bigint('last_seen_head_block', { mode: 'number' }),
    replayFromBlock: bigint('replay_from_block', { mode: 'number' }),
    status: text('status').notNull().default('idle'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    contractWorkerUnique: uniqueIndex(
      'hol_programmable_secret_indexer_state_contract_worker_unique',
    ).on(table.network, table.chainId, table.contractAddress, table.workerKey),
    statusIdx: index('hol_programmable_secret_indexer_state_status_idx').on(
      table.network,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const holProgrammableSecretUaidCache = holProgrammableSecrets.table(
  'programmable_secret_uaid_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    network: text('network').notNull().default('testnet'),
    uaid: text('uaid').notNull(),
    status: text('status').notNull().default('pending'),
    validationResult: jsonb('validation_result'),
    resolutionResult: jsonb('resolution_result'),
    agentDetailResult: jsonb('agent_detail_result'),
    verificationResult: jsonb('verification_result'),
    errorMessage: text('error_message'),
    cachedAt: timestamp('cached_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    networkUaidUnique: uniqueIndex(
      'hol_programmable_secret_uaid_cache_network_uaid_unique',
    ).on(table.network, table.uaid),
    statusIdx: index('hol_programmable_secret_uaid_cache_status_idx').on(
      table.network,
      table.status,
      table.cachedAt,
    ),
    cachedAtIdx: index('hol_programmable_secret_uaid_cache_cached_at_idx').on(
      table.network,
      table.cachedAt,
    ),
  }),
);

export type HolProgrammableSecretPolicyRecord =
  typeof holProgrammableSecretPolicies.$inferSelect;
export type NewHolProgrammableSecretPolicy =
  typeof holProgrammableSecretPolicies.$inferInsert;
export type HolProgrammableSecretPurchaseRecord =
  typeof holProgrammableSecretPurchases.$inferSelect;
export type NewHolProgrammableSecretPurchase =
  typeof holProgrammableSecretPurchases.$inferInsert;
export type HolProgrammableSecretKeyRequestRecord =
  typeof holProgrammableSecretKeyRequests.$inferSelect;
export type NewHolProgrammableSecretKeyRequest =
  typeof holProgrammableSecretKeyRequests.$inferInsert;
export type HolProgrammableSecretIndexerStateRecord =
  typeof holProgrammableSecretIndexerState.$inferSelect;
export type NewHolProgrammableSecretIndexerState =
  typeof holProgrammableSecretIndexerState.$inferInsert;
export type HolProgrammableSecretUaidCacheRecord =
  typeof holProgrammableSecretUaidCache.$inferSelect;
export type NewHolProgrammableSecretUaidCache =
  typeof holProgrammableSecretUaidCache.$inferInsert;
