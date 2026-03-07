import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
type Logger = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export interface CiphertextStoreDeps {
  logger: Logger;
  rootDir: string;
}

export class CiphertextStore {
  private readonly logger: Logger;
  private readonly rootDir: string;

  constructor({ logger, rootDir }: CiphertextStoreDeps) {
    this.logger = logger;
    this.rootDir = resolve(rootDir);
  }

  getRootDir(): string {
    return this.rootDir;
  }

  buildPathForHash(hash: string): string {
    const normalized = hash.replace(/^0x/i, '').toLowerCase();
    const prefix = normalized.slice(0, 2) || '00';
    const suffix = normalized.slice(2) || normalized;
    return resolve(this.rootDir, prefix, suffix);
  }

  async writeCiphertext(hash: string, payload: Buffer): Promise<string> {
    const targetPath = this.buildPathForHash(hash);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, payload);
    this.logger.info('Programmable secrets ciphertext stored', {
      ciphertextPath: targetPath,
      byteLength: payload.byteLength,
    });
    return targetPath;
  }

  async statCiphertext(path: string): Promise<{ size: number } | null> {
    try {
      const fileStat = await stat(path);
      return { size: fileStat.size };
    } catch {
      return null;
    }
  }

  createCiphertextReadStream(path: string) {
    return createReadStream(join(path));
  }
}
