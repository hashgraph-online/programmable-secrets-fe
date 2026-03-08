import type {
  ProgrammableSecretIndexerStatus,
  ProgrammableSecretKeyRequestStatus,
  ProgrammableSecretPolicyStatus,
  ProgrammableSecretPurchaseStatus,
  ProgrammableSecretUaidCacheStatus,
  ProgrammableSecretsNetwork,
} from './types-shared';
import type {
  ProgrammableSecretsConditionDescriptor,
  ProgrammableSecretsConditionWitness,
} from './policy-conditions';

export interface ProgrammableSecretsConfig {
  enabled: boolean;
  network: ProgrammableSecretsNetwork;
  chainId: number;
  rpcUrl: string;
  contractAddress?: string;
  paymentModuleAddress?: string;
  policyVaultAddress?: string;
  accessReceiptAddress?: string;
  agentIdentityRegistryAddress?: string;
  timeRangeConditionAddress?: string;
  uaidOwnershipConditionAddress?: string;
  addressAllowlistConditionAddress?: string;
  krsMasterKey?: string;
  ciphertextStorageRoot: string;
  pollingIntervalMs: number;
  holBaseUrl?: string;
  maxUploadSizeBytes?: number;
  allowedMimeTypes?: string[];
}

export interface ProgrammableSecretsPolicyConditionView {
  index: number;
  evaluatorAddress: string;
  configHash: string;
  configDataHex: string | null;
  descriptor: ProgrammableSecretsConditionDescriptor | null;
  runtimeWitness: ProgrammableSecretsConditionWitness;
}

export interface ProgrammableSecretsPolicyView {
  id: string;
  network: string;
  chainId: number;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  policyId: number | null;
  datasetId: number | null;
  conditionsHash: string | null;
  conditionCount: number | null;
  conditions: ProgrammableSecretsPolicyConditionView[];
  declaredConditions: ProgrammableSecretsConditionDescriptor[];
  status: ProgrammableSecretPolicyStatus;
  providerAddress: string;
  payoutAddress: string;
  paymentToken: string;
  priceWei: string;
  expiresAt: string | null;
  expiresAtUnix: number | null;
  active: boolean;
  allowlistEnabled: boolean;
  receiptTransferable: boolean;
  ciphertextHash: string;
  keyCommitment: string;
  metadataHash: string;
  providerUaid: string | null;
  providerUaidHash: string;
  metadataJson: Record<string, unknown> | null;
  keyReleaseReady: boolean;
  createdTxHash: string | null;
  createdBlockNumber: number | null;
  policyCreatedAt: string | null;
  confirmedAt: string | null;
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgrammableSecretsPurchaseView {
  id: string;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  policyId: number;
  receiptTokenId: number;
  buyerAddress: string;
  recipientAddress: string;
  status: ProgrammableSecretPurchaseStatus;
  purchaseTxHash: string;
  purchasedAt: string;
  purchasedAtUnix: number;
  ciphertextHash: string;
  keyCommitment: string;
}

export interface ProgrammableSecretsKeyRequestView {
  id: string;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  policyId: number;
  receiptTokenId: number | null;
  buyerAddress: string;
  status: ProgrammableSecretKeyRequestStatus;
  challengeMessage: string;
  nonceIssuedAt: string;
  nonceExpiresAt: string;
  nonceConsumedAt: string | null;
  buyerPublicKeyFingerprint: string | null;
  encryptedKey: string | null;
  ciphertextUrl: string | null;
  ciphertextHash: string | null;
  keyCommitment: string | null;
  metadataJson: Record<string, unknown> | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ProgrammableSecretsUaidCacheView {
  id: string;
  uaid: string;
  status: ProgrammableSecretUaidCacheStatus;
  validationResult: Record<string, unknown> | null;
  resolutionResult: Record<string, unknown> | null;
  agentDetailResult: Record<string, unknown> | null;
  verificationResult: Record<string, unknown> | null;
  errorMessage: string | null;
  cachedAt: string;
  expiresAt: string | null;
}

export interface ProgrammableSecretsHealthView {
  enabled: boolean;
  network: ProgrammableSecretsNetwork;
  chainId: number;
  rpcUrl: string;
  contractAddress: string | null;
  paymentModuleAddress: string | null;
  policyVaultAddress: string | null;
  accessReceiptAddress: string | null;
  ciphertextStorageRoot: string;
  pollingIntervalMs: number;
  currentBlockNumber: number | null;
  indexer: {
    status: ProgrammableSecretIndexerStatus;
    latestIndexedBlock: number | null;
    latestIndexedAt: string | null;
    lastSeenHeadBlock: number | null;
    lagBlocks: number | null;
    lastError: string | null;
  };
}
