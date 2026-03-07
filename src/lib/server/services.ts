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
    paymentModuleAddress: '0xbff7f7671044Ae1C965C9D7d9050cBa3Da72356c',
    policyVaultAddress: '0x54c40c2863dB7eE2563C65CF83F5cc295e73bd6c',
    accessReceiptAddress: '0x902c70193Fc36Ad1d115DcB0310C3F49fC4F5e7a',
    agentIdentityRegistryAddress: '0x0000000000000000000000000000000000000000',
    timeRangeConditionAddress: '0x7F17cB0Ec2e8981A6489Ec1281C55474e575a66D',
    uaidOwnershipConditionAddress: '0x338F2a134574Bf68F9c479344F679c13aed8f92e',
    addressAllowlistConditionAddress: '0x4A458B97f45d7c6d308f350089156386237578B9',
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
