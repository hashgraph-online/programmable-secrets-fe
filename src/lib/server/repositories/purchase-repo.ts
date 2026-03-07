import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  holProgrammableSecretPurchases,
  type HolProgrammableSecretPurchaseRecord,
} from '../schema';
import type { ProgrammableSecretPurchaseStatus } from '../types-shared';
import {
  normalizeAddress,
  normalizeOptionalDate,
  normalizePositiveInteger,
  normalizeProgrammableSecretsNetwork,
  normalizeRequiredString,
  resolveListLimit,
} from './programmable-secret-repository-helpers';

export interface UpsertProgrammableSecretPurchaseInput {
  network?: string;
  chainId?: number;
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  policyRecordId: string;
  policyId: number;
  receiptTokenId: number;
  buyerAddress: string;
  recipientAddress: string;
  paymentToken: string;
  priceWei: string;
  purchaseTxHash: string;
  purchaseBlockNumber?: number | null;
  purchaseBlockHash?: string | null;
  purchaseLogIndex?: number | null;
  purchasedAtUnix: number;
  purchasedAt: Date;
  ciphertextHash: string;
  keyCommitment: string;
  status?: ProgrammableSecretPurchaseStatus;
  indexedAt?: Date | null;
}

export class ProgrammableSecretPurchasePgRepository {
  constructor(
    private readonly db = getDb(),
    private readonly network: string = 'testnet',
  ) {}

  private get normalizedNetwork(): 'mainnet' | 'testnet' {
    return normalizeProgrammableSecretsNetwork(this.network);
  }

  async upsertPurchase(
    input: UpsertProgrammableSecretPurchaseInput,
  ): Promise<HolProgrammableSecretPurchaseRecord> {
    const now = new Date();
    const [row] = await this.db
      .insert(holProgrammableSecretPurchases)
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
        receiptTokenId: normalizePositiveInteger(
          input.receiptTokenId,
          'receiptTokenId',
        ),
        buyerAddress: normalizeAddress(input.buyerAddress, 'buyerAddress'),
        recipientAddress: normalizeAddress(
          input.recipientAddress,
          'recipientAddress',
        ),
        paymentToken: normalizeAddress(input.paymentToken, 'paymentToken'),
        priceWei: normalizeRequiredString(input.priceWei, 'priceWei'),
        purchaseTxHash: normalizeRequiredString(
          input.purchaseTxHash,
          'purchaseTxHash',
        ),
        purchaseBlockNumber: input.purchaseBlockNumber ?? null,
        purchaseBlockHash: input.purchaseBlockHash ?? null,
        purchaseLogIndex: input.purchaseLogIndex ?? null,
        purchasedAtUnix: normalizePositiveInteger(
          input.purchasedAtUnix,
          'purchasedAtUnix',
        ),
        purchasedAt: input.purchasedAt,
        ciphertextHash: normalizeRequiredString(
          input.ciphertextHash,
          'ciphertextHash',
        ),
        keyCommitment: normalizeRequiredString(
          input.keyCommitment,
          'keyCommitment',
        ),
        status: input.status ?? 'indexed',
        indexedAt: normalizeOptionalDate(input.indexedAt) ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          holProgrammableSecretPurchases.network,
          holProgrammableSecretPurchases.chainId,
          holProgrammableSecretPurchases.contractAddress,
          holProgrammableSecretPurchases.policyId,
          holProgrammableSecretPurchases.buyerAddress,
        ],
        set: {
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
          recipientAddress: normalizeAddress(
            input.recipientAddress,
            'recipientAddress',
          ),
          receiptTokenId: normalizePositiveInteger(
            input.receiptTokenId,
            'receiptTokenId',
          ),
          paymentToken: normalizeAddress(input.paymentToken, 'paymentToken'),
          priceWei: normalizeRequiredString(input.priceWei, 'priceWei'),
          purchaseTxHash: normalizeRequiredString(
            input.purchaseTxHash,
            'purchaseTxHash',
          ),
          purchaseBlockNumber: input.purchaseBlockNumber ?? null,
          purchaseBlockHash: input.purchaseBlockHash ?? null,
          purchaseLogIndex: input.purchaseLogIndex ?? null,
          purchasedAtUnix: normalizePositiveInteger(
            input.purchasedAtUnix,
            'purchasedAtUnix',
          ),
          purchasedAt: input.purchasedAt,
          ciphertextHash: normalizeRequiredString(
            input.ciphertextHash,
            'ciphertextHash',
          ),
          keyCommitment: normalizeRequiredString(
            input.keyCommitment,
            'keyCommitment',
          ),
          status: input.status ?? 'indexed',
          indexedAt: normalizeOptionalDate(input.indexedAt) ?? now,
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new Error('Failed to upsert programmable secret purchase');
    }

    return row;
  }

  async getByPolicyAndBuyer(params: {
    chainId?: number;
    contractAddress: string;
    policyId: number;
    buyerAddress: string;
  }): Promise<HolProgrammableSecretPurchaseRecord | null> {
    const [row] = await this.db
      .select()
      .from(holProgrammableSecretPurchases)
      .where(
        and(
          eq(holProgrammableSecretPurchases.network, this.normalizedNetwork),
          eq(holProgrammableSecretPurchases.chainId, params.chainId ?? 46630),
          eq(
            holProgrammableSecretPurchases.contractAddress,
            normalizeAddress(params.contractAddress, 'contractAddress'),
          ),
          eq(
            holProgrammableSecretPurchases.policyId,
            normalizePositiveInteger(params.policyId, 'policyId'),
          ),
          eq(
            holProgrammableSecretPurchases.buyerAddress,
            normalizeAddress(params.buyerAddress, 'buyerAddress'),
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listByPolicy(params: {
    policyId: number;
    limit?: number;
  }): Promise<HolProgrammableSecretPurchaseRecord[]> {
    return this.db
      .select()
      .from(holProgrammableSecretPurchases)
      .where(
        and(
          eq(holProgrammableSecretPurchases.network, this.normalizedNetwork),
          eq(
            holProgrammableSecretPurchases.policyId,
            normalizePositiveInteger(params.policyId, 'policyId'),
          ),
        ),
      )
      .orderBy(desc(holProgrammableSecretPurchases.purchasedAt))
      .limit(resolveListLimit(params.limit, 50, 200));
  }

  async listByBuyer(params: {
    buyerAddress: string;
    limit?: number;
  }): Promise<HolProgrammableSecretPurchaseRecord[]> {
    return this.db
      .select()
      .from(holProgrammableSecretPurchases)
      .where(
        and(
          eq(holProgrammableSecretPurchases.network, this.normalizedNetwork),
          eq(
            holProgrammableSecretPurchases.buyerAddress,
            normalizeAddress(params.buyerAddress, 'buyerAddress'),
          ),
        ),
      )
      .orderBy(desc(holProgrammableSecretPurchases.purchasedAt))
      .limit(resolveListLimit(params.limit, 50, 200));
  }
}
