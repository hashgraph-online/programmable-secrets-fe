// ── Base64 / binary helpers ──

export function bytesToBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return new TextDecoder().decode(bytes);
}

export function toOwnedBytes(input: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const copy = new Uint8Array(source.length);
  copy.set(source);
  return copy;
}

export function toBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const copy = new Uint8Array(input.length);
  copy.set(input);
  return copy.buffer as ArrayBuffer;
}

export function bytesToArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  return toBuffer(input);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Bytes(input: ArrayBuffer | Uint8Array): Promise<string> {
  const payload = toOwnedBytes(input);
  const digest = await crypto.subtle.digest('SHA-256', payload.buffer as ArrayBuffer);
  return `0x${bytesToHex(new Uint8Array(digest))}`;
}

export async function sha256Utf8(value: string): Promise<string> {
  return sha256Bytes(utf8ToBytes(value));
}

// ── AES-GCM ──

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportAesKeyBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(raw);
}

export async function importAesKeyBase64(encoded: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toBuffer(base64ToBytes(encoded)),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPayload(
  key: CryptoKey,
  plaintext: ArrayBuffer | Uint8Array,
): Promise<EncryptedPayload> {
  const iv = toOwnedBytes(crypto.getRandomValues(new Uint8Array(12)));
  const payload = toBuffer(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, payload);
  return { ciphertext: toOwnedBytes(new Uint8Array(ciphertext)), iv };
}

export async function decryptPayload(
  key: CryptoKey,
  payload: { ciphertext: ArrayBuffer | Uint8Array; iv: ArrayBuffer | Uint8Array },
): Promise<Uint8Array> {
  const ciphertext = toBuffer(payload.ciphertext);
  const iv = toBuffer(payload.iv);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return toOwnedBytes(new Uint8Array(plaintext));
}

// ── RSA-OAEP (buyer key pair) ──

export interface BuyerKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

function chunkString(value: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) chunks.push(value.slice(i, i + size));
  return chunks;
}

function bytesToPem(label: string, input: ArrayBuffer): string {
  const b64 = bytesToBase64(input);
  return [`-----BEGIN ${label}-----`, ...chunkString(b64, 64), `-----END ${label}-----`].join('\n');
}

export async function generateBuyerKeyPair(): Promise<BuyerKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

export async function exportPublicKeyPem(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return bytesToPem('PUBLIC KEY', spki);
}

export async function getPublicKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const fingerprint = await sha256Bytes(spki);
  return fingerprint.slice(2);
}

export async function decryptEnvelope(
  privateKey: CryptoKey,
  encryptedKeyBase64: string,
): Promise<Uint8Array> {
  const payload = base64ToBytes(encryptedKeyBase64);
  const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, toBuffer(payload));
  return toOwnedBytes(new Uint8Array(decrypted));
}

// ── Metadata ──

function canonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeValue).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeValue(record[k])}`);
    return `{${entries.join(',')}}`;
  }
  throw new Error('Metadata contains unsupported values.');
}

export function canonicalizeMetadata(metadata: Record<string, unknown>): string {
  return canonicalizeValue(metadata);
}

export async function hashMetadata(metadata: Record<string, unknown>): Promise<string> {
  return sha256Utf8(canonicalizeMetadata(metadata));
}

// ── Policy metadata shape ──

export interface PolicyMetadata {
  title?: string;
  description?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  plaintextHash?: string;
  providerUaid?: string;
  priceWei?: string;
  createdAt?: string;
  cipher?: { algorithm: 'AES-GCM'; ivBase64: string; version: 1 };
  purchaseRequirements?: {
    receiptTransferable?: boolean;
    conditions?: unknown[];
  };
  schema?: Record<string, unknown>;
}

export function parsePolicyMetadata(
  metadata: Record<string, unknown> | null | undefined,
): PolicyMetadata | null {
  if (!metadata) return null;
  const parsed: PolicyMetadata = {};
  const cipher = metadata.cipher as Record<string, unknown> | null;

  if (typeof metadata.title === 'string') parsed.title = metadata.title;
  if (typeof metadata.description === 'string') parsed.description = metadata.description;
  if (typeof metadata.fileName === 'string') parsed.fileName = metadata.fileName;
  if (typeof metadata.mimeType === 'string') parsed.mimeType = metadata.mimeType;
  if (typeof metadata.sizeBytes === 'number') parsed.sizeBytes = metadata.sizeBytes;
  if (typeof metadata.plaintextHash === 'string') parsed.plaintextHash = metadata.plaintextHash;
  if (typeof metadata.providerUaid === 'string') parsed.providerUaid = metadata.providerUaid;
  if (typeof metadata.priceWei === 'string') parsed.priceWei = metadata.priceWei;
  if (typeof metadata.createdAt === 'string') parsed.createdAt = metadata.createdAt;
  if (
    cipher &&
    cipher.algorithm === 'AES-GCM' &&
    typeof cipher.ivBase64 === 'string' &&
    cipher.version === 1
  ) {
    parsed.cipher = { algorithm: 'AES-GCM', ivBase64: cipher.ivBase64 as string, version: 1 };
  }
  if (metadata.schema && typeof metadata.schema === 'object') {
    parsed.schema = metadata.schema as Record<string, unknown>;
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

// ── File packaging ──

export interface PackagedFile {
  file: File;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  plaintextBytes: Uint8Array;
  plaintextHash: string;
}

export async function packageFile(file: File): Promise<PackagedFile> {
  const ab = await file.arrayBuffer();
  const plaintextBytes = new Uint8Array(ab);
  const plaintextHash = await sha256Bytes(plaintextBytes);
  return {
    file,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    plaintextBytes,
    plaintextHash,
  };
}
