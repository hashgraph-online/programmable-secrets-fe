/**
 * Service factory — creates singleton instances wired to Postgres.
 * This replaces the broker's dependency injection container.
 */
import { getDb, ensureMigrated } from './db';

let _dbReady = false;
async function initDb() {
  if (_dbReady) return;
  await ensureMigrated();
  _dbReady = true;
}
import { AesGcmService } from './aes-gcm';
import { RsaOaepService } from './rsa-oaep';
import { ProgrammableSecretsSignatureService } from './signature-service';
import { ProgrammableSecretsChainClient } from './chain-client';
import { CiphertextStore } from './ciphertext-store';
import { ProgrammableSecretPolicyPgRepository } from './repositories/policy-repo';
import { ProgrammableSecretKeyRequestPgRepository } from './repositories/key-request-repo';
import { ProgrammableSecretPurchasePgRepository } from './repositories/purchase-repo';
import { ProgrammableSecretsPolicyService } from './policy-service';
import { ProgrammableSecretsKrsService } from './krs-service';
import type { ProgrammableSecretsConfig } from './types';

type ProgrammableSecretsDb = ReturnType<typeof getDb>;

const logger = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  error: () => undefined,
};

let _config: ProgrammableSecretsConfig | null = null;
let _policyService: ProgrammableSecretsPolicyService | null = null;
let _krsService: ProgrammableSecretsKrsService | null = null;
const DEFAULT_KRS_MASTER_KEY = 'MISSING_KRS_MASTER_KEY=';

function getConfig(): ProgrammableSecretsConfig {
  if (_config) return _config;
  _config = {
    enabled: true,
    network: 'testnet',
    chainId: 46630,
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
    paymentModuleAddress: '0x82637bff0e39f0B65C17BbC69f768602f093a1Ee',
    policyVaultAddress: '0x0e65116044C731A1e0380c1E39f439f93fb77416',
    accessReceiptAddress: '0xE39Ae07F6226156d97C76B4ec6ac8697890Dd350',
    agentIdentityRegistryAddress: '0x0000000000000000000000000000000000000000',
    timeRangeConditionAddress: '0x27ac32dDeEC8324409e7F0536446615c9869D5C4',
    uaidOwnershipConditionAddress: '0xfB8987521276cD73229aA4A2D9B4469E12b463Fe',
    addressAllowlistConditionAddress: '0x00D801d8a84aC17F198E56f535dFD3B69CeeE51F',
    krsMasterKey: process.env.KRS_MASTER_KEY || DEFAULT_KRS_MASTER_KEY,
    holBaseUrl: undefined,
    ciphertextStorageRoot: process.env.CIPHERTEXT_STORAGE_ROOT || 'data/programmable-secrets',
    pollingIntervalMs: 5000,
    maxUploadSizeBytes: 10485760,
    allowedMimeTypes: ['application/octet-stream', 'application/json', 'text/plain', 'text/csv'],
  };
  return _config;
}

export async function getPolicyService(): Promise<ProgrammableSecretsPolicyService> {
  if (_policyService) return _policyService;
  await initDb();
  const config = getConfig();
  const db: ProgrammableSecretsDb = getDb();
  const policyRepo = new ProgrammableSecretPolicyPgRepository(db);
  const purchaseRepo = new ProgrammableSecretPurchasePgRepository(db);
  const ciphertextStore = new CiphertextStore({ logger, rootDir: config.ciphertextStorageRoot! });
  const aesGcm = config.krsMasterKey ? new AesGcmService(config.krsMasterKey) : null;
  const chainClient = new ProgrammableSecretsChainClient({ logger, rpcUrl: config.rpcUrl });
  _policyService = new ProgrammableSecretsPolicyService(
    policyRepo, purchaseRepo, ciphertextStore, aesGcm, chainClient, logger, config,
  );
  return _policyService;
}

export async function getKrsService(): Promise<ProgrammableSecretsKrsService> {
  if (_krsService) return _krsService;
  await initDb();
  const config = getConfig();
  const db: ProgrammableSecretsDb = getDb();
  const keyRequestRepo = new ProgrammableSecretKeyRequestPgRepository(db);
  const policyRepo = new ProgrammableSecretPolicyPgRepository(db);
  const purchaseRepo = new ProgrammableSecretPurchasePgRepository(db);
  const aesGcm = config.krsMasterKey ? new AesGcmService(config.krsMasterKey) : null;
  const rsaOaep = new RsaOaepService();
  const signatureService = new ProgrammableSecretsSignatureService();
  const chainClient = new ProgrammableSecretsChainClient({ logger, rpcUrl: config.rpcUrl });
  _krsService = new ProgrammableSecretsKrsService(
    keyRequestRepo, policyRepo, purchaseRepo, aesGcm, rsaOaep, signatureService, chainClient, logger, config,
  );
  return _krsService;
}

export { getConfig };
