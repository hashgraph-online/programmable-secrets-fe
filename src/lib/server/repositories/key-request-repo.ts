import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDb } from '../db';
import {
  holProgrammableSecretKeyRequests,
  type HolProgrammableSecretKeyRequestRecord,
} from '../schema';
import type {
  ProgrammableSecretCanonicalMetadata,
  ProgrammableSecretKeyRequestStatus,
} from '../types-shared';
import {
  normalizeAddress,
  normalizeOptionalDate,
  normalizePositiveInteger,
  normalizeProgrammableSecretsNetwork,
  normalizeRequiredString,
  resolveListLimit,
} from './programmable-secret-repository-helpers';

export interface CreateProgrammableSecretNonceRequestInput {
  network?: string;
  chainId?: number;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  policyRecordId: string;
  policyId: number;
  receiptTokenId?: number | null;
  buyerAddress: string;
  nonce: string;
  nonceExpiresAt: Date;
  challengeMessage: string;
}

export interface CompleteProgrammableSecretKeyRequestInput {
  id: string;
  status: Extract<ProgrammableSecretKeyRequestStatus, 'issued' | 'denied' | 'expired'>;
  receiptTokenId?: number | null;
  buyerRsaPublicKeyPem?: string | null;
  buyerPublicKeyFingerprint?: string | null;
  signature?: string | null;
  encryptedKey?: string | null;
  ciphertextUrl?: string | null;
  ciphertextHash?: string | null;
  keyCommitment?: string | null;
  metadataJson?: ProgrammableSecretCanonicalMetadata | null;
  resultPayload?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  nonceConsumedAt?: Date | null;
  completedAt?: Date | null;
}

export class ProgrammableSecretKeyRequestPgRepository {
  constructor(
    private readonly db: NodePgDatabase<any> = getDb() as any,
    private readonly network: string = 'testnet',
  ) {}

  private get normalizedNetwork(): 'mainnet' | 'testnet' {
    return normalizeProgrammableSecretsNetwork(this.network);
  }

  async createNonceRequest(
    input: CreateProgrammableSecretNonceRequestInput,
  ): Promise<HolProgrammableSecretKeyRequestRecord> {
    const [row] = await this.db
      .insert(holProgrammableSecretKeyRequests)
      .values({
        network: normalizeProgrammableSecretsNetwork(
          input.network ?? this.normalizedNetwork,
        ),
        chainId: input.chainId ?? 46630,
        contractAddress: normalizeAddress(
          input.contractAddress,
          'contractAddress',
        ),
        paymentModuleAddress: normalizeAddress(
          input.paymentModuleAddress,
          'paymentModuleAddress',
        ),
        policyVaultAddress: normalizeAddress(
          input.policyVaultAddress,
          'policyVaultAddress',
        ),
        accessReceiptAddress: normalizeAddress(
          input.accessReceiptAddress,
          'accessReceiptAddress',
        ),
        policyRecordId: normalizeRequiredString(input.policyRecordId, 'policyRecordId'),
        policyId: normalizePositiveInteger(input.policyId, 'policyId'),
        receiptTokenId:
          typeof input.receiptTokenId === 'number'
            ? normalizePositiveInteger(input.receiptTokenId, 'receiptTokenId')
            : null,
        buyerAddress: normalizeAddress(input.buyerAddress, 'buyerAddress'),
        nonce: normalizeRequiredString(input.nonce, 'nonce'),
        nonceExpiresAt: input.nonceExpiresAt,
        challengeMessage: normalizeRequiredString(
          input.challengeMessage,
          'challengeMessage',
        ),
        updatedAt: new Date(),
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create programmable secret nonce request');
    }

    return row;
  }

  async getById(
    idRaw: string,
  ): Promise<HolProgrammableSecretKeyRequestRecord | null> {
    const [row] = await this.db
      .select()
      .from(holProgrammableSecretKeyRequests)
      .where(eq(holProgrammableSecretKeyRequests.id, normalizeRequiredString(idRaw, 'id')))
      .limit(1);
    return row ?? null;
  }

  async getLatestForPolicyBuyer(params: {
    policyId: number;
    buyerAddress: string;
    limit?: number;
  }): Promise<HolProgrammableSecretKeyRequestRecord[]> {
    return this.db
      .select()
      .from(holProgrammableSecretKeyRequests)
      .where(
        and(
          eq(holProgrammableSecretKeyRequests.network, this.normalizedNetwork),
          eq(
            holProgrammableSecretKeyRequests.policyId,
            normalizePositiveInteger(params.policyId, 'policyId'),
          ),
          eq(
            holProgrammableSecretKeyRequests.buyerAddress,
            normalizeAddress(params.buyerAddress, 'buyerAddress'),
          ),
        ),
      )
      .orderBy(desc(holProgrammableSecretKeyRequests.createdAt))
      .limit(resolveListLimit(params.limit, 20, 100));
  }

  async markPending(idRaw: string, input: {
    buyerRsaPublicKeyPem: string;
    buyerPublicKeyFingerprint: string;
    signature: string;
    nonceConsumedAt?: Date | null;
  }): Promise<HolProgrammableSecretKeyRequestRecord | null> {
    const [row] = await this.db
      .update(holProgrammableSecretKeyRequests)
      .set({
        status: 'pending',
        buyerRsaPublicKeyPem: normalizeRequiredString(
          input.buyerRsaPublicKeyPem,
          'buyerRsaPublicKeyPem',
        ),
        buyerPublicKeyFingerprint: normalizeRequiredString(
          input.buyerPublicKeyFingerprint,
          'buyerPublicKeyFingerprint',
        ),
        signature: normalizeRequiredString(input.signature, 'signature'),
        nonceConsumedAt: normalizeOptionalDate(input.nonceConsumedAt) ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holProgrammableSecretKeyRequests.id, normalizeRequiredString(idRaw, 'id')))
      .returning();

    return row ?? null;
  }

  async completeRequest(
    input: CompleteProgrammableSecretKeyRequestInput,
  ): Promise<HolProgrammableSecretKeyRequestRecord | null> {
    const [row] = await this.db
      .update(holProgrammableSecretKeyRequests)
      .set({
        status: input.status,
        receiptTokenId:
          typeof input.receiptTokenId === 'number'
            ? normalizePositiveInteger(input.receiptTokenId, 'receiptTokenId')
            : input.receiptTokenId ?? undefined,
        buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem ?? undefined,
        buyerPublicKeyFingerprint: input.buyerPublicKeyFingerprint ?? undefined,
        signature: input.signature ?? undefined,
        encryptedKey: input.encryptedKey ?? null,
        ciphertextUrl: input.ciphertextUrl ?? null,
        ciphertextHash: input.ciphertextHash ?? null,
        keyCommitment: input.keyCommitment ?? null,
        metadataJson: input.metadataJson ?? null,
        resultPayload: input.resultPayload ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        nonceConsumedAt: normalizeOptionalDate(input.nonceConsumedAt),
        completedAt: normalizeOptionalDate(input.completedAt) ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holProgrammableSecretKeyRequests.id, normalizeRequiredString(input.id, 'id')))
      .returning();

    return row ?? null;
  }
}
