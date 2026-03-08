import { createHash } from 'node:crypto';
import type {
  HolProgrammableSecretPolicyRecord,
  HolProgrammableSecretPurchaseRecord,
} from './schema';
import {
  type ProgrammableSecretCanonicalMetadata,
  normalizeProgrammableSecretPolicyStatus,
  normalizeProgrammableSecretPurchaseStatus,
} from './types-shared';
import { parseMetadataPurchaseRequirements } from './policy-conditions';
import type {
  ProgrammableSecretsPolicyView,
  ProgrammableSecretsPurchaseView,
} from './types';

export const toIsoString = (value?: Date | null): string | null =>
  value ? value.toISOString() : null;

export const toRecord = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const sha256Hex = (value: Buffer | string): string =>
  `0x${createHash('sha256').update(value).digest('hex')}`;

export const normalizeHexAddress = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return normalized;
};

export const normalizePriceWei = (value: string): string => {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error('priceWei must be a base-10 integer string');
  }
  return normalized;
};

const normalizeHexBytes32 = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex string`);
  }
  return normalized;
};

export const normalizeTxHash = (value: string): string =>
  normalizeHexBytes32(value, 'createdTxHash');

export const normalizeBlockHash = (value: string): string =>
  normalizeHexBytes32(value, 'createdBlockHash');

const canonicalizeValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeValue(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`,
    );
    return `{${entries.join(',')}}`;
  }
  throw new Error('Metadata contains unsupported values');
};

export const canonicalizeMetadata = (
  metadata: ProgrammableSecretCanonicalMetadata,
): string => canonicalizeValue(metadata);

export const normalizePositiveOptionalInteger = (
  value?: number | null,
): number | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('expiresAtUnix must be a positive integer');
  }
  return value;
};

export const decodeBase64Payload = (value: string, label: string): Buffer => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new Error(`${label} must be a base64 string`);
  }
  return Buffer.from(normalized, 'base64');
};

export const mapPolicyRecordToView = (
  policy: HolProgrammableSecretPolicyRecord,
): ProgrammableSecretsPolicyView => {
  const metadataJson = toRecord(policy.metadataJson);
  const keyReleaseReady =
    typeof policy.ciphertextPath === 'string' &&
    policy.ciphertextPath.length > 0 &&
    typeof policy.contentKeyEnc === 'string' &&
    policy.contentKeyEnc.length > 0 &&
    typeof policy.contentKeyEncIv === 'string' &&
    policy.contentKeyEncIv.length > 0 &&
    typeof policy.contentKeyEncTag === 'string' &&
    policy.contentKeyEncTag.length > 0 &&
    typeof policy.contentKeyEncAad === 'string' &&
    policy.contentKeyEncAad.length > 0 &&
    metadataJson !== null;
  const declaredConditions = metadataJson
    ? parseMetadataPurchaseRequirements(
        metadataJson as ProgrammableSecretCanonicalMetadata,
      ).conditions
    : [];

  return {
    id: policy.id,
    network: policy.network,
    chainId: policy.chainId,
    contractAddress: policy.contractAddress,
    paymentModuleAddress: policy.paymentModuleAddress,
    policyVaultAddress: policy.policyVaultAddress,
    accessReceiptAddress: policy.accessReceiptAddress,
    policyId: policy.policyId ?? null,
    datasetId: null,
    conditionsHash: null,
    conditionCount: null,
    conditions: [],
    declaredConditions,
    status: normalizeProgrammableSecretPolicyStatus(policy.status),
    providerAddress: policy.providerAddress,
    payoutAddress: policy.payoutAddress,
    paymentToken: policy.paymentToken,
    priceWei: policy.priceWei,
    expiresAt: toIsoString(policy.expiresAt),
    expiresAtUnix: policy.expiresAtUnix ?? null,
    active: policy.active,
    allowlistEnabled: policy.allowlistEnabled,
    receiptTransferable: policy.receiptTransferable,
    ciphertextHash: policy.ciphertextHash,
    keyCommitment: policy.keyCommitment,
    metadataHash: policy.metadataHash,
    providerUaid: policy.providerUaid ?? null,
    providerUaidHash: policy.providerUaidHash,
    metadataJson,
    keyReleaseReady,
    createdTxHash: policy.createdTxHash ?? null,
    createdBlockNumber: policy.createdBlockNumber ?? null,
    policyCreatedAt: toIsoString(policy.policyCreatedAt),
    confirmedAt: toIsoString(policy.confirmedAt),
    indexedAt: toIsoString(policy.indexedAt),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
};

export const mapPurchaseRecordToView = (
  purchase: HolProgrammableSecretPurchaseRecord,
): ProgrammableSecretsPurchaseView => ({
  id: purchase.id,
  contractAddress: purchase.contractAddress,
  paymentModuleAddress: purchase.paymentModuleAddress,
  policyVaultAddress: purchase.policyVaultAddress,
  accessReceiptAddress: purchase.accessReceiptAddress,
  policyId: Number(purchase.policyId),
  receiptTokenId: Number(purchase.receiptTokenId),
  buyerAddress: purchase.buyerAddress,
  recipientAddress: purchase.recipientAddress,
  status: normalizeProgrammableSecretPurchaseStatus(purchase.status),
  purchaseTxHash: purchase.purchaseTxHash,
  purchasedAt: purchase.purchasedAt.toISOString(),
  purchasedAtUnix: Number(purchase.purchasedAtUnix),
  ciphertextHash: purchase.ciphertextHash,
  keyCommitment: purchase.keyCommitment,
});
