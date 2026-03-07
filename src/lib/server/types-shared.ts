export type ProgrammableSecretsNetwork = 'mainnet' | 'testnet';

export type ProgrammableSecretPolicyStatus =
  | 'staged'
  | 'prepared'
  | 'finalized'
  | 'indexed'
  | 'failed';

export type ProgrammableSecretPurchaseStatus =
  | 'pending'
  | 'confirmed'
  | 'indexed'
  | 'failed';

export type ProgrammableSecretKeyRequestStatus =
  | 'nonce-issued'
  | 'pending'
  | 'issued'
  | 'denied'
  | 'expired';

export type ProgrammableSecretIndexerStatus = 'idle' | 'running' | 'error';

export type ProgrammableSecretUaidCacheStatus =
  | 'pending'
  | 'fresh'
  | 'stale'
  | 'error';

const programmableSecretPolicyStatuses: readonly string[] = [
  'staged',
  'prepared',
  'finalized',
  'indexed',
  'failed',
];

const programmableSecretPurchaseStatuses: readonly string[] = [
  'pending',
  'confirmed',
  'indexed',
  'failed',
];

const programmableSecretKeyRequestStatuses: readonly string[] = [
  'nonce-issued',
  'pending',
  'issued',
  'denied',
  'expired',
];

const programmableSecretIndexerStatuses: readonly string[] = [
  'idle',
  'running',
  'error',
];

const programmableSecretUaidCacheStatuses: readonly string[] = [
  'pending',
  'fresh',
  'stale',
  'error',
];

const isProgrammableSecretPolicyStatus = (
  value: string,
): value is ProgrammableSecretPolicyStatus =>
  programmableSecretPolicyStatuses.includes(value);

const isProgrammableSecretPurchaseStatus = (
  value: string,
): value is ProgrammableSecretPurchaseStatus =>
  programmableSecretPurchaseStatuses.includes(value);

const isProgrammableSecretKeyRequestStatus = (
  value: string,
): value is ProgrammableSecretKeyRequestStatus =>
  programmableSecretKeyRequestStatuses.includes(value);

const isProgrammableSecretIndexerStatus = (
  value: string,
): value is ProgrammableSecretIndexerStatus =>
  programmableSecretIndexerStatuses.includes(value);

const isProgrammableSecretUaidCacheStatus = (
  value: string,
): value is ProgrammableSecretUaidCacheStatus =>
  programmableSecretUaidCacheStatuses.includes(value);

export const normalizeProgrammableSecretPolicyStatus = (
  value: string,
): ProgrammableSecretPolicyStatus =>
  isProgrammableSecretPolicyStatus(value) ? value : 'staged';

export const normalizeProgrammableSecretPurchaseStatus = (
  value: string,
): ProgrammableSecretPurchaseStatus =>
  isProgrammableSecretPurchaseStatus(value) ? value : 'pending';

export const normalizeProgrammableSecretKeyRequestStatus = (
  value: string,
): ProgrammableSecretKeyRequestStatus =>
  isProgrammableSecretKeyRequestStatus(value) ? value : 'nonce-issued';

export const normalizeProgrammableSecretIndexerStatus = (
  value: string,
): ProgrammableSecretIndexerStatus =>
  isProgrammableSecretIndexerStatus(value) ? value : 'idle';

export const normalizeProgrammableSecretUaidCacheStatus = (
  value: string,
): ProgrammableSecretUaidCacheStatus =>
  isProgrammableSecretUaidCacheStatus(value) ? value : 'pending';

export interface ProgrammableSecretEncryptedKeyPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  aad: string;
  version: number;
}

export interface ProgrammableSecretCanonicalMetadata {
  [key: string]: unknown;
}
