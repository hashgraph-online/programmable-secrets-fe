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

function getConfig(): ProgrammableSecretsConfig {
  if (_config) return _config;
  _config = {
    enabled: true,
    network: 'testnet',
    chainId: 46630,
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
    paymentModuleAddress: '0x24c6212B2673b85B71CFB3A7a767Ff691ea7D7A2',
    policyVaultAddress: '0xBd4E7A50e6c61Eb7dAA6c7485df88054E5b4796D',
    accessReceiptAddress: '0x849575C669e9fA3944880c77E8c77b5c1dE58c8D',
    agentIdentityRegistryAddress: '0xF287C269D17B923eBFFd1Eb76E6c3075286124Ad',
    timeRangeConditionAddress: undefined,
    uaidOwnershipConditionAddress: undefined,
    addressAllowlistConditionAddress: undefined,
    krsMasterKey: process.env.KRS_MASTER_KEY || 'REDACTED_KRS_MASTER_KEY=',
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
