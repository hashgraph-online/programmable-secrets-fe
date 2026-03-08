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
import { ProgrammableSecretsPolicyImportService } from './policy-import-service';
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
let _policyImportService: ProgrammableSecretsPolicyImportService | null = null;
let _krsService: ProgrammableSecretsKrsService | null = null;

function getConfig(): ProgrammableSecretsConfig {
  if (_config) return _config;
  const krsMasterKey = process.env.KRS_MASTER_KEY?.trim();
  _config = {
    enabled: true,
    network: 'testnet',
    chainId: 46630,
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
    paymentModuleAddress: '0x5b4a056d2203C5940257635F073A253B958ba43c',
    policyVaultAddress: '0x073fc3fE9B2c00E470199550870D458D13421614',
    accessReceiptAddress: '0x4Aa65779ce3dF24E5EeC7a786721765dF50a106b',
    agentIdentityRegistryAddress: '0x0000000000000000000000000000000000000000',
    timeRangeConditionAddress: '0xfc3Eaf2E05157eb604b05F55b1fC7588Ed39A8d0',
    uaidOwnershipConditionAddress: '0x0d3CEa0BD8e6aba73dD8BeBB63339a2120262D8D',
    addressAllowlistConditionAddress: '0x1D1b66d9B2F357076dEC883302494393A226D5a9',
    krsMasterKey: krsMasterKey && krsMasterKey.length > 0 ? krsMasterKey : undefined,
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

export async function getPolicyImportService(): Promise<ProgrammableSecretsPolicyImportService> {
  if (_policyImportService) return _policyImportService;
  await initDb();
  const config = getConfig();
  const db: ProgrammableSecretsDb = getDb();
  const policyRepo = new ProgrammableSecretPolicyPgRepository(db);
  const ciphertextStore = new CiphertextStore({ logger, rootDir: config.ciphertextStorageRoot! });
  const aesGcm = config.krsMasterKey ? new AesGcmService(config.krsMasterKey) : null;
  const chainClient = new ProgrammableSecretsChainClient({ logger, rpcUrl: config.rpcUrl });
  const policyService = await getPolicyService();
  _policyImportService = new ProgrammableSecretsPolicyImportService(
    policyRepo, ciphertextStore, aesGcm, chainClient, policyService, logger, config,
  );
  return _policyImportService;
}

export { getConfig };
