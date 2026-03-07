import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export interface AesGcmEncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  aad: string;
  version: number;
}

const DEFAULT_VERSION = 1;

const decodeKey = (value: string): Buffer => {
  const normalized = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return Buffer.from(normalized, 'hex');
  }
  return Buffer.from(normalized, 'base64');
};

const deriveKey = (value: string): Buffer => {
  const decoded = decodeKey(value);
  if (decoded.length === 32) {
    return decoded;
  }
  return createHash('sha256').update(decoded).digest();
};

export class AesGcmService {
  constructor(private readonly masterKey: string) {}

  encrypt(plaintext: Buffer, aad: string): AesGcmEncryptedPayload {
    const key = deriveKey(this.masterKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const aadBuffer = Buffer.from(aad, 'utf-8');

    cipher.setAAD(aadBuffer);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      aad: aadBuffer.toString('base64'),
      version: DEFAULT_VERSION,
    };
  }

  decrypt(payload: AesGcmEncryptedPayload): Buffer {
    const key = deriveKey(this.masterKey);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64'),
    );

    decipher.setAAD(Buffer.from(payload.aad, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
  }
}
