import {
  constants,
  createHash,
  createPublicKey,
  publicEncrypt,
} from 'node:crypto';

export class RsaOaepService {
  getPublicKeyFingerprint(publicKeyPem: string): string {
    const publicKey = createPublicKey(publicKeyPem);
    const der = publicKey.export({
      type: 'spki',
      format: 'der',
    });
    return createHash('sha256').update(der).digest('hex');
  }

  encryptToBase64(publicKeyPem: string, payload: Buffer): string {
    const encrypted = publicEncrypt(
      {
        key: createPublicKey(publicKeyPem),
        oaepHash: 'sha256',
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      payload,
    );

    return encrypted.toString('base64');
  }
}
