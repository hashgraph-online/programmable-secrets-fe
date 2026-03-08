import { keccak256, toBytes } from 'viem';
import type { ProgrammableSecretCanonicalMetadata } from './types-shared';
import type { ProgrammableSecretsPolicyView } from './types';

export interface ImportedPolicyBundleInput {
  contentKeyHex: string;
  ciphertextHex: string;
  providerUaid: string;
  metadata?: ProgrammableSecretCanonicalMetadata | null;
  title?: string | null;
  description?: string | null;
  plaintextHash?: string | null;
  plaintextPreview?: string | null;
  ivHex?: string | null;
  version?: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decodeHex(value: string, label: string): Buffer {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be a hex string`);
  }
  return Buffer.from(normalized.slice(2), 'hex');
}

function toBase64(value: string | null | undefined, label: string): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  return decodeHex(value, label).toString('base64');
}

function inferMimeType(
  plaintextPreview: string | null | undefined,
): string | undefined {
  if (typeof plaintextPreview !== 'string') {
    return undefined;
  }
  const trimmed = plaintextPreview.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'application/json';
  }
  return undefined;
}

function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cloneMetadata(
  metadata?: ProgrammableSecretCanonicalMetadata | null,
): ProgrammableSecretCanonicalMetadata {
  if (!isRecord(metadata)) {
    return {};
  }
  return { ...metadata };
}

export function decodeImportedContentKey(bundle: ImportedPolicyBundleInput): Buffer {
  const contentKey = decodeHex(bundle.contentKeyHex, 'bundle.contentKeyHex');
  if (contentKey.byteLength !== 32) {
    throw new Error('bundle.contentKeyHex must decode to 32 bytes');
  }
  return contentKey;
}

export function decodeImportedCiphertext(bundle: ImportedPolicyBundleInput): Buffer {
  return decodeHex(bundle.ciphertextHex, 'bundle.ciphertextHex');
}

export function computeImportedProviderUaidHash(
  providerUaid: string,
): string {
  const normalized = providerUaid.trim();
  if (!normalized) {
    throw new Error('bundle.providerUaid is required');
  }
  return keccak256(toBytes(normalized));
}

export function buildImportedPolicyMetadata(params: {
  bundle: ImportedPolicyBundleInput;
  policy: ProgrammableSecretsPolicyView;
}): ProgrammableSecretCanonicalMetadata {
  const metadata = cloneMetadata(params.bundle.metadata);
  const title =
    typeof metadata.title === 'string' && metadata.title.trim().length > 0
      ? metadata.title
      : params.bundle.title?.trim();
  const description =
    typeof metadata.description === 'string' && metadata.description.trim().length > 0
      ? metadata.description
      : params.bundle.description?.trim();

  if (title) {
    metadata.title = title;
  }
  if (description) {
    metadata.description = description;
  }
  if (
    typeof metadata.providerUaid !== 'string' ||
    metadata.providerUaid.trim().length === 0
  ) {
    metadata.providerUaid = params.bundle.providerUaid.trim();
  }
  if (
    typeof metadata.priceWei !== 'string' ||
    metadata.priceWei.trim().length === 0
  ) {
    metadata.priceWei = params.policy.priceWei;
  }
  if (
    typeof metadata.createdAt !== 'string' ||
    metadata.createdAt.trim().length === 0
  ) {
    metadata.createdAt = params.policy.policyCreatedAt ?? params.policy.createdAt;
  }
  if (
    typeof params.bundle.plaintextHash === 'string' &&
    params.bundle.plaintextHash.trim().length > 0 &&
    (typeof metadata.plaintextHash !== 'string' || metadata.plaintextHash.trim().length === 0)
  ) {
    metadata.plaintextHash = params.bundle.plaintextHash.trim().toLowerCase();
  }
  if (
    typeof metadata.mimeType !== 'string' ||
    metadata.mimeType.trim().length === 0
  ) {
    const inferredMimeType = inferMimeType(params.bundle.plaintextPreview);
    if (inferredMimeType) {
      metadata.mimeType = inferredMimeType;
    }
  }
  if (
    (typeof metadata.fileName !== 'string' || metadata.fileName.trim().length === 0) &&
    title
  ) {
    const baseName = slugifyTitle(title) || `policy-${params.policy.policyId ?? 'bundle'}`;
    const extension = metadata.mimeType === 'application/json' ? 'json' : 'bin';
    metadata.fileName = `${baseName}.${extension}`;
  }

  const ivBase64 = toBase64(params.bundle.ivHex, 'bundle.ivHex');
  if (ivBase64) {
    metadata.cipher = {
      algorithm: 'AES-GCM',
      ivBase64,
      version:
        typeof params.bundle.version === 'number' && Number.isInteger(params.bundle.version)
          ? params.bundle.version
          : 1,
    };
  }

  metadata.purchaseRequirements = {
    receiptTransferable: params.policy.receiptTransferable,
    conditions: params.policy.declaredConditions,
  };

  return metadata;
}
