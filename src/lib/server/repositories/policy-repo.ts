import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { getDb } from '../db';
import {
  holProgrammableSecretPolicies,
  type HolProgrammableSecretPolicyRecord,
} from '../schema';
import type {
  ProgrammableSecretCanonicalMetadata,
  ProgrammableSecretEncryptedKeyPayload,
  ProgrammableSecretPolicyStatus,
} from '../types-shared';
import {
  normalizeAddress,
  normalizeOptionalDate,
  normalizePositiveInteger,
  normalizeProgrammableSecretsNetwork,
  normalizeRequiredString,
  resolveListLimit,
} from './programmable-secret-repository-helpers';

export interface CreateStagedProgrammableSecretPolicyInput {
  network?: string;
  chainId?: number;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  providerAddress: string;
  payoutAddress: string;
  paymentToken?: string;
  priceWei: string;
  expiresAt?: Date | null;
  expiresAtUnix?: number | null;
  active?: boolean;
  allowlistEnabled?: boolean;
  ciphertextHash: string;
  keyCommitment: string;
  metadataHash: string;
  providerUaid: string;
  providerUaidHash: string;
  ciphertextPath: string;
  encryptedKeyPayload: ProgrammableSecretEncryptedKeyPayload;
  metadataJson: ProgrammableSecretCanonicalMetadata;
  status?: ProgrammableSecretPolicyStatus;
}

export interface FinalizeProgrammableSecretPolicyInput {
  id: string;
  policyId: number;
  createdTxHash: string;
  encryptedKeyPayload?: ProgrammableSecretEncryptedKeyPayload | null;
  createdBlockNumber?: number | null;
  createdBlockHash?: string | null;
  createdLogIndex?: number | null;
  policyCreatedAt?: Date | null;
  confirmedAt?: Date | null;
  status?: ProgrammableSecretPolicyStatus;
}

export interface UpsertIndexedProgrammableSecretPolicyInput {
  network?: string;
  chainId?: number;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  policyId: number;
  providerAddress: string;
  payoutAddress: string;
  paymentToken: string;
  priceWei: string;
  expiresAt?: Date | null;
  expiresAtUnix?: number | null;
  active: boolean;
  allowlistEnabled: boolean;
  ciphertextHash: string;
  keyCommitment: string;
  metadataHash: string;
  providerUaidHash: string;
  providerUaid?: string | null;
  ciphertextPath?: string | null;
  encryptedKeyPayload?: ProgrammableSecretEncryptedKeyPayload | null;
  metadataJson?: ProgrammableSecretCanonicalMetadata | null;
  createdTxHash?: string | null;
  createdBlockNumber?: number | null;
  createdBlockHash?: string | null;
  createdLogIndex?: number | null;
  policyCreatedAt?: Date | null;
  confirmedAt?: Date | null;
  indexedAt?: Date | null;
  status?: ProgrammableSecretPolicyStatus;
}

export interface ListProgrammableSecretPoliciesInput {
  chainId?: number;
  providerAddress?: string;
  status?: ProgrammableSecretPolicyStatus;
  contractAddress?: string;
  paymentModuleAddress?: string;
  policyVaultAddress?: string;
  accessReceiptAddress?: string;
  limit?: number;
}

export class ProgrammableSecretPolicyPgRepository {
  constructor(
    private readonly db = getDb(),
    private readonly network: string = 'testnet',
  ) {}

  private get normalizedNetwork(): 'mainnet' | 'testnet' {
    return normalizeProgrammableSecretsNetwork(this.network);
  }

  async createStagedPolicy(
    input: CreateStagedProgrammableSecretPolicyInput,
  ): Promise<HolProgrammableSecretPolicyRecord> {
    const [row] = await this.db
      .insert(holProgrammableSecretPolicies)
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
        status: input.status ?? 'staged',
        providerAddress: normalizeAddress(
          input.providerAddress,
          'providerAddress',
        ),
        payoutAddress: normalizeAddress(input.payoutAddress, 'payoutAddress'),
        paymentToken: normalizeAddress(
          input.paymentToken ??
            '0x0000000000000000000000000000000000000000',
          'paymentToken',
        ),
        priceWei: normalizeRequiredString(input.priceWei, 'priceWei'),
        expiresAt: normalizeOptionalDate(input.expiresAt),
        expiresAtUnix: input.expiresAtUnix ?? null,
        active: input.active ?? true,
        allowlistEnabled: input.allowlistEnabled ?? false,
        ciphertextHash: normalizeRequiredString(
          input.ciphertextHash,
          'ciphertextHash',
        ),
        keyCommitment: normalizeRequiredString(
          input.keyCommitment,
          'keyCommitment',
        ),
        metadataHash: normalizeRequiredString(input.metadataHash, 'metadataHash'),
        providerUaid: normalizeRequiredString(input.providerUaid, 'providerUaid'),
        providerUaidHash: normalizeRequiredString(
          input.providerUaidHash,
          'providerUaidHash',
        ),
        ciphertextPath: normalizeRequiredString(
          input.ciphertextPath,
          'ciphertextPath',
        ),
        contentKeyEnc: normalizeRequiredString(
          input.encryptedKeyPayload.ciphertext,
          'encryptedKeyPayload.ciphertext',
        ),
        contentKeyEncIv: normalizeRequiredString(
          input.encryptedKeyPayload.iv,
          'encryptedKeyPayload.iv',
        ),
        contentKeyEncTag: normalizeRequiredString(
          input.encryptedKeyPayload.tag,
          'encryptedKeyPayload.tag',
        ),
        contentKeyEncAad: normalizeRequiredString(
          input.encryptedKeyPayload.aad,
          'encryptedKeyPayload.aad',
        ),
        contentKeyEncVersion: normalizePositiveInteger(
          input.encryptedKeyPayload.version,
          'encryptedKeyPayload.version',
        ),
        metadataJson: input.metadataJson,
        updatedAt: new Date(),
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create staged programmable secret policy');
    }

    return row;
  }

  async getById(idRaw: string): Promise<HolProgrammableSecretPolicyRecord | null> {
    const id = normalizeRequiredString(idRaw, 'id');
    const [row] = await this.db
      .select()
      .from(holProgrammableSecretPolicies)
      .where(eq(holProgrammableSecretPolicies.id, id))
      .limit(1);
    return row ?? null;
  }

  async getByChainPolicy(params: {
    chainId?: number;
    contractAddress: string;
    policyId: number;
  }): Promise<HolProgrammableSecretPolicyRecord | null> {
    const [row] = await this.db
      .select()
      .from(holProgrammableSecretPolicies)
      .where(
        and(
          eq(holProgrammableSecretPolicies.network, this.normalizedNetwork),
          eq(holProgrammableSecretPolicies.chainId, params.chainId ?? 46630),
          eq(
            holProgrammableSecretPolicies.contractAddress,
            normalizeAddress(params.contractAddress, 'contractAddress'),
          ),
          eq(
            holProgrammableSecretPolicies.policyId,
            normalizePositiveInteger(params.policyId, 'policyId'),
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listPolicies(
    params?: ListProgrammableSecretPoliciesInput,
  ): Promise<HolProgrammableSecretPolicyRecord[]> {
    const conditions: SQL[] = [
      eq(holProgrammableSecretPolicies.network, this.normalizedNetwork),
    ];

    if (params?.providerAddress) {
      conditions.push(
        eq(
          holProgrammableSecretPolicies.providerAddress,
          normalizeAddress(params.providerAddress, 'providerAddress'),
        ),
      );
    }

    if (typeof params?.chainId === 'number') {
      conditions.push(
        eq(
          holProgrammableSecretPolicies.chainId,
          normalizePositiveInteger(params.chainId, 'chainId'),
        ),
      );
    }

    if (params?.status) {
      conditions.push(eq(holProgrammableSecretPolicies.status, params.status));
    } else {
      conditions.push(
        inArray(holProgrammableSecretPolicies.status, ['finalized', 'indexed']),
      );
    }

    if (params?.contractAddress) {
      conditions.push(
        eq(
          holProgrammableSecretPolicies.contractAddress,
          normalizeAddress(params.contractAddress, 'contractAddress'),
        ),
      );
    }

    if (params?.paymentModuleAddress) {
      conditions.push(
        eq(
          holProgrammableSecretPolicies.paymentModuleAddress,
          normalizeAddress(params.paymentModuleAddress, 'paymentModuleAddress'),
        ),
      );
    }

    if (params?.policyVaultAddress) {
      conditions.push(
        eq(
          holProgrammableSecretPolicies.policyVaultAddress,
          normalizeAddress(params.policyVaultAddress, 'policyVaultAddress'),
        ),
      );
    }

    if (params?.accessReceiptAddress) {
      conditions.push(
        eq(
          holProgrammableSecretPolicies.accessReceiptAddress,
          normalizeAddress(params.accessReceiptAddress, 'accessReceiptAddress'),
        ),
      );
    }

    return this.db
      .select()
      .from(holProgrammableSecretPolicies)
      .where(and(...conditions))
      .orderBy(desc(holProgrammableSecretPolicies.createdAt))
      .limit(resolveListLimit(params?.limit, 50, 200));
  }

  async finalizePolicy(
    input: FinalizeProgrammableSecretPolicyInput,
  ): Promise<HolProgrammableSecretPolicyRecord | null> {
    const [row] = await this.db
      .update(holProgrammableSecretPolicies)
      .set({
        policyId: normalizePositiveInteger(input.policyId, 'policyId'),
        status: input.status ?? 'finalized',
        createdTxHash: normalizeRequiredString(
          input.createdTxHash,
          'createdTxHash',
        ),
        contentKeyEnc: input.encryptedKeyPayload?.ciphertext ?? undefined,
        contentKeyEncIv: input.encryptedKeyPayload?.iv ?? undefined,
        contentKeyEncTag: input.encryptedKeyPayload?.tag ?? undefined,
        contentKeyEncAad: input.encryptedKeyPayload?.aad ?? undefined,
        contentKeyEncVersion: input.encryptedKeyPayload?.version ?? undefined,
        createdBlockNumber: input.createdBlockNumber ?? null,
        createdBlockHash: input.createdBlockHash ?? null,
        createdLogIndex: input.createdLogIndex ?? null,
        policyCreatedAt: normalizeOptionalDate(input.policyCreatedAt),
        confirmedAt: normalizeOptionalDate(input.confirmedAt) ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holProgrammableSecretPolicies.id, input.id))
      .returning();

    return row ?? null;
  }

  async markFailed(
    idRaw: string,
    errorMessage: string,
  ): Promise<HolProgrammableSecretPolicyRecord | null> {
    const [row] = await this.db
      .update(holProgrammableSecretPolicies)
      .set({
        status: 'failed',
        lastError: normalizeRequiredString(errorMessage, 'errorMessage'),
        updatedAt: new Date(),
      })
      .where(eq(holProgrammableSecretPolicies.id, normalizeRequiredString(idRaw, 'id')))
      .returning();

    return row ?? null;
  }

  async upsertIndexedPolicy(
    input: UpsertIndexedProgrammableSecretPolicyInput,
  ): Promise<HolProgrammableSecretPolicyRecord> {
    const now = new Date();
    const encryptedKeyPayload = input.encryptedKeyPayload;
    const setValues: Partial<typeof holProgrammableSecretPolicies.$inferInsert> = {
      contractAddress: normalizeAddress(input.contractAddress, 'contractAddress'),
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
      providerAddress: normalizeAddress(input.providerAddress, 'providerAddress'),
      payoutAddress: normalizeAddress(input.payoutAddress, 'payoutAddress'),
      paymentToken: normalizeAddress(input.paymentToken, 'paymentToken'),
      priceWei: normalizeRequiredString(input.priceWei, 'priceWei'),
      expiresAt: normalizeOptionalDate(input.expiresAt),
      expiresAtUnix: input.expiresAtUnix ?? null,
      active: input.active,
      allowlistEnabled: input.allowlistEnabled,
      ciphertextHash: normalizeRequiredString(
        input.ciphertextHash,
        'ciphertextHash',
      ),
      keyCommitment: normalizeRequiredString(
        input.keyCommitment,
        'keyCommitment',
      ),
      metadataHash: normalizeRequiredString(input.metadataHash, 'metadataHash'),
      providerUaidHash: normalizeRequiredString(
        input.providerUaidHash,
        'providerUaidHash',
      ),
      createdTxHash: input.createdTxHash ?? null,
      createdBlockNumber: input.createdBlockNumber ?? null,
      createdBlockHash: input.createdBlockHash ?? null,
      createdLogIndex: input.createdLogIndex ?? null,
      policyCreatedAt: normalizeOptionalDate(input.policyCreatedAt),
      confirmedAt: normalizeOptionalDate(input.confirmedAt),
      indexedAt: normalizeOptionalDate(input.indexedAt) ?? now,
      status: input.status ?? 'indexed',
      updatedAt: now,
    };

    if (typeof input.providerUaid === 'string') {
      setValues.providerUaid = input.providerUaid;
    }
    if (typeof input.ciphertextPath === 'string') {
      setValues.ciphertextPath = input.ciphertextPath;
    }
    if (input.metadataJson) {
      setValues.metadataJson = input.metadataJson;
    }
    if (encryptedKeyPayload) {
      setValues.contentKeyEnc = encryptedKeyPayload.ciphertext;
      setValues.contentKeyEncIv = encryptedKeyPayload.iv;
      setValues.contentKeyEncTag = encryptedKeyPayload.tag;
      setValues.contentKeyEncAad = encryptedKeyPayload.aad;
      setValues.contentKeyEncVersion = normalizePositiveInteger(
        encryptedKeyPayload.version,
        'encryptedKeyPayload.version',
      );
    }

    const [row] = await this.db
      .insert(holProgrammableSecretPolicies)
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
        policyId: normalizePositiveInteger(input.policyId, 'policyId'),
        providerAddress: normalizeAddress(
          input.providerAddress,
          'providerAddress',
        ),
        payoutAddress: normalizeAddress(input.payoutAddress, 'payoutAddress'),
        paymentToken: normalizeAddress(input.paymentToken, 'paymentToken'),
        priceWei: normalizeRequiredString(input.priceWei, 'priceWei'),
        expiresAt: normalizeOptionalDate(input.expiresAt),
        expiresAtUnix: input.expiresAtUnix ?? null,
        active: input.active,
        allowlistEnabled: input.allowlistEnabled,
        ciphertextHash: normalizeRequiredString(
          input.ciphertextHash,
          'ciphertextHash',
        ),
        keyCommitment: normalizeRequiredString(
          input.keyCommitment,
          'keyCommitment',
        ),
        metadataHash: normalizeRequiredString(input.metadataHash, 'metadataHash'),
        providerUaid: input.providerUaid ?? null,
        providerUaidHash: normalizeRequiredString(
          input.providerUaidHash,
          'providerUaidHash',
        ),
        ciphertextPath: input.ciphertextPath ?? null,
        contentKeyEnc: encryptedKeyPayload?.ciphertext ?? null,
        contentKeyEncIv: encryptedKeyPayload?.iv ?? null,
        contentKeyEncTag: encryptedKeyPayload?.tag ?? null,
        contentKeyEncAad: encryptedKeyPayload?.aad ?? null,
        contentKeyEncVersion: encryptedKeyPayload?.version ?? 1,
        metadataJson: input.metadataJson ?? null,
        createdTxHash: input.createdTxHash ?? null,
        createdBlockNumber: input.createdBlockNumber ?? null,
        createdBlockHash: input.createdBlockHash ?? null,
        createdLogIndex: input.createdLogIndex ?? null,
        policyCreatedAt: normalizeOptionalDate(input.policyCreatedAt),
        confirmedAt: normalizeOptionalDate(input.confirmedAt),
        indexedAt: normalizeOptionalDate(input.indexedAt) ?? now,
        status: input.status ?? 'indexed',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          holProgrammableSecretPolicies.network,
          holProgrammableSecretPolicies.chainId,
          holProgrammableSecretPolicies.contractAddress,
          holProgrammableSecretPolicies.policyId,
        ],
        set: setValues,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to upsert indexed programmable secret policy');
    }

    return row;
  }
}
