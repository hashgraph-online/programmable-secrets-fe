type Logger = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
import { keccak256, toBytes } from 'viem';
import {
  ProgrammableSecretPolicyPgRepository,
  type UpsertIndexedProgrammableSecretPolicyInput,
} from './repositories/policy-repo';
import { ProgrammableSecretPurchasePgRepository } from './repositories/purchase-repo';
import {
  type ProgrammableSecretCanonicalMetadata,
  type ProgrammableSecretEncryptedKeyPayload,
} from './types-shared';
import { AesGcmService } from './aes-gcm';
import { ProgrammableSecretsChainClient } from './chain-client';
import { CiphertextStore } from './ciphertext-store';
import { resolveProgrammableSecretsChainTarget } from './contract-manifest';
import {
  buildPreparedConditions,
  computeConditionsHash,
} from './policy-conditions';
import {
  canonicalizeMetadata,
  decodeBase64Payload,
  mapPolicyRecordToView,
  mapPurchaseRecordToView,
  normalizeBlockHash,
  normalizeHexAddress,
  normalizePositiveOptionalInteger,
  normalizePriceWei,
  normalizeTxHash,
  sha256Hex,
} from './policy-service-helpers';
import type {
  ProgrammableSecretsConfig,
  ProgrammableSecretsPolicyView,
  ProgrammableSecretsPurchaseView,
} from './types';

export interface PrepareProgrammableSecretPolicyInput {
  chainId?: number | null;
  providerAddress: string;
  providerUaid: string;
  payoutAddress: string;
  paymentToken?: string;
  priceWei: string;
  metadata: ProgrammableSecretCanonicalMetadata;
  ciphertext: Buffer;
  contentKeyB64: string;
}
export interface ConfirmProgrammableSecretPolicyInput {
  stagedPolicyId: string;
  policyId: number;
  createdTxHash: string;
  createdBlockNumber?: number | null;
  createdBlockHash?: string | null;
  createdLogIndex?: number | null;
  policyCreatedAt?: Date | null;
}
export interface PreparedProgrammableSecretPolicy {
  stagedPolicyId: string;
  policyId: null;
  contractAddress: string | null;
  paymentModuleAddress: string | null;
  policyVaultAddress: string | null;
  accessReceiptAddress: string | null;
  chainId: number;
  network: string;
  onchainInputs: {
    payoutAddress: string;
    paymentToken: string;
    priceWei: string;
    receiptTransferable: boolean;
    conditions: Array<{
      evaluator: string;
      configData: `0x${string}`;
      configHash: string;
    }>;
    ciphertextHash: string;
    keyCommitment: string;
    metadataHash: string;
    providerUaidHash: string;
    declaredConditions: ReturnType<typeof buildPreparedConditions>['conditions'];
  };
}
export class ProgrammableSecretsPolicyService {
  private readonly chainClients = new Map<number, ProgrammableSecretsChainClient>();

  constructor(
    private readonly policyRepository: ProgrammableSecretPolicyPgRepository,
    private readonly purchaseRepository: ProgrammableSecretPurchasePgRepository,
    private readonly ciphertextStore: CiphertextStore,
    private readonly aesGcmService: AesGcmService | null,
    private readonly chainClient: ProgrammableSecretsChainClient,
    private readonly logger: Logger,
    private readonly config: ProgrammableSecretsConfig,
  ) {}

  private getChainClient(chainId?: number): ProgrammableSecretsChainClient {
    const target = resolveProgrammableSecretsChainTarget(this.config, chainId);
    if (!target) {
      throw new Error('Programmable secrets contract manifest is not configured');
    }

    if (target.chainId === this.config.chainId) {
      return this.chainClient;
    }

    const existingClient = this.chainClients.get(target.chainId);
    if (existingClient) {
      return existingClient;
    }

    const nextClient = new ProgrammableSecretsChainClient({
      logger: this.logger,
      rpcUrl: target.rpcUrl,
    });
    this.chainClients.set(target.chainId, nextClient);
    return nextClient;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
  getMaxUploadSizeBytes(): number | undefined {
    return this.config.maxUploadSizeBytes;
  }
  getAllowedMimeTypes(): string[] | undefined {
    return this.config.allowedMimeTypes;
  }

  private async buildPolicyView(
    policy: Parameters<typeof mapPolicyRecordToView>[0],
  ): Promise<ProgrammableSecretsPolicyView> {
    const view = mapPolicyRecordToView(policy);
    if (typeof policy.policyId !== 'number') {
      return view;
    }

    try {
      const onchainPolicy = await this.getChainClient(policy.chainId).getPolicy(
        policy.policyVaultAddress,
        policy.policyId,
      );
      if (!onchainPolicy) {
        return view;
      }

      return {
        ...view,
        datasetId: onchainPolicy.datasetId,
        conditionsHash: onchainPolicy.conditionsHash,
        conditionCount: onchainPolicy.conditionCount,
        receiptTransferable: onchainPolicy.receiptTransferable,
        conditions: onchainPolicy.conditions.map((condition, index) => ({
          index,
          evaluatorAddress: condition.evaluatorAddress,
          configHash: condition.configHash,
          configDataHex: condition.configDataHex,
          descriptor: view.declaredConditions[index] ?? null,
          runtimeWitness:
            view.declaredConditions[index]?.kind === 'uaid-ownership'
              ? { kind: 'buyer-uaid', label: 'Buyer UAID' }
              : view.declaredConditions[index]?.kind === 'custom-static'
                ? (view.declaredConditions[index].runtimeWitness ?? { kind: 'none' })
                : { kind: 'none' },
        })),
      };
    } catch (error) {
      this.logger.warn('Failed to enrich programmable secret policy view from chain', {
        policyId: policy.policyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return view;
    }
  }

  async preparePolicy(
    input: PrepareProgrammableSecretPolicyInput,
  ): Promise<PreparedProgrammableSecretPolicy> {
    if (!this.config.enabled) {
      throw new Error('Programmable secrets are disabled');
    }
    if (!this.aesGcmService) {
      throw new Error('Programmable secrets KRS master key is not configured');
    }
    const target = resolveProgrammableSecretsChainTarget(
      this.config,
      input.chainId ?? undefined,
    );
    if (!target) {
      throw new Error('Programmable secrets contract manifest is not configured');
    }
    if (input.ciphertext.byteLength === 0) {
      throw new Error('ciphertext is required');
    }

    const providerAddress = normalizeHexAddress(
      input.providerAddress,
      'providerAddress',
    );
    const payoutAddress = normalizeHexAddress(input.payoutAddress, 'payoutAddress');
    const paymentToken = normalizeHexAddress(
      input.paymentToken ??
        '0x0000000000000000000000000000000000000000',
      'paymentToken',
    );
    if (
      paymentToken !== '0x0000000000000000000000000000000000000000'
    ) {
      throw new Error('Only native ETH policies are supported for this POC');
    }

    const priceWei = normalizePriceWei(input.priceWei);
    const canonicalMetadata = canonicalizeMetadata(input.metadata);
    const ciphertextHash = sha256Hex(input.ciphertext);
    const contentKey = decodeBase64Payload(input.contentKeyB64, 'contentKeyB64');
    if (contentKey.byteLength !== 32) {
      throw new Error('contentKeyB64 must decode to 32 bytes');
    }
    const keyCommitment = sha256Hex(contentKey);
    const metadataHash = sha256Hex(Buffer.from(canonicalMetadata, 'utf-8'));
    const providerUaid = input.providerUaid.trim();
    if (!providerUaid) {
      throw new Error('providerUaid is required');
    }
    const providerUaidHash = keccak256(toBytes(providerUaid));
    const preparedConditions = buildPreparedConditions({
      metadata: input.metadata,
      target,
    });
    for (const condition of preparedConditions.conditions) {
      const registration = await this.getChainClient(target.chainId).getPolicyEvaluator(
        target.policyVaultAddress,
        condition.evaluatorAddress,
      );
      if (!registration?.active) {
        throw new Error(
          `Condition evaluator ${condition.evaluatorAddress} is not registered and active on this PolicyVault`,
        );
      }
    }
    const conditionsHash = computeConditionsHash(preparedConditions.conditions);
    const ciphertextPath = await this.ciphertextStore.writeCiphertext(
      ciphertextHash,
      input.ciphertext,
    );
    const stagedAad = [
      'stage',
      target.chainId,
      ciphertextHash,
      providerUaidHash,
    ].join(':');
    const encryptedKeyPayload = this.aesGcmService.encrypt(contentKey, stagedAad);
    const expiresAtUnix = normalizePositiveOptionalInteger(
      preparedConditions.expiresAtUnix,
    );
    const stagedPolicy = await this.policyRepository.createStagedPolicy({
      network: target.network,
      chainId: target.chainId,
      contractAddress: target.paymentModuleAddress,
      paymentModuleAddress: target.paymentModuleAddress,
      policyVaultAddress: target.policyVaultAddress,
      accessReceiptAddress: target.accessReceiptAddress,
      providerAddress,
      providerUaid,
      providerUaidHash,
      payoutAddress,
      paymentToken,
      priceWei,
      expiresAt:
        typeof expiresAtUnix === 'number' && expiresAtUnix > 0
          ? new Date(expiresAtUnix * 1000)
          : null,
      expiresAtUnix,
      allowlistEnabled: preparedConditions.allowlistEnabled,
      receiptTransferable: preparedConditions.receiptTransferable,
      ciphertextHash,
      keyCommitment,
      metadataHash,
      ciphertextPath,
      encryptedKeyPayload,
      metadataJson: input.metadata,
      status: 'prepared',
    });

    this.logger.info('Prepared programmable secret policy', {
      stagedPolicyId: stagedPolicy.id,
      ciphertextHash,
      metadataHash,
      providerUaidHash,
      conditionsHash,
    });

    return {
      stagedPolicyId: stagedPolicy.id,
      policyId: null,
      contractAddress: target.paymentModuleAddress,
      paymentModuleAddress: target.paymentModuleAddress,
      policyVaultAddress: target.policyVaultAddress,
      accessReceiptAddress: target.accessReceiptAddress,
      chainId: target.chainId,
      network: target.network,
      onchainInputs: {
        payoutAddress,
        paymentToken,
        priceWei,
        receiptTransferable: preparedConditions.receiptTransferable,
        conditions: preparedConditions.conditions.map((condition) => ({
          evaluator: condition.evaluatorAddress,
          configData: condition.configDataHex as `0x${string}`,
          configHash: condition.configHash,
        })),
        ciphertextHash,
        keyCommitment,
        metadataHash,
        providerUaidHash,
        declaredConditions: preparedConditions.conditions,
      },
    };
  }

  async confirmPolicy(
    input: ConfirmProgrammableSecretPolicyInput,
  ): Promise<ProgrammableSecretsPolicyView | null> {
    if (!this.aesGcmService) {
      throw new Error('Programmable secrets KRS master key is not configured');
    }

    const createdTxHash = normalizeTxHash(input.createdTxHash);
    const createdBlockHash = input.createdBlockHash
      ? normalizeBlockHash(input.createdBlockHash)
      : null;
    const record = await this.policyRepository.getById(input.stagedPolicyId);
    if (!record) {
      return null;
    }
    const target = resolveProgrammableSecretsChainTarget(this.config, record.chainId);
    if (!target) {
      throw new Error('Programmable secrets contract manifest is not configured');
    }
    if (
      record.policyId === input.policyId &&
      (record.status === 'finalized' || record.status === 'indexed')
    ) {
      return this.getPolicyById(input.policyId, record.chainId);
    }
    if (
      typeof record.policyId === 'number' &&
      record.policyId !== input.policyId
    ) {
      await this.policyRepository.markFailed(
        record.id,
        'staged policy is already bound to a different policyId',
      );
      throw new Error('stagedPolicyId is already bound to a different policyId');
    }
    if (
      !record.contentKeyEnc ||
      !record.contentKeyEncIv ||
      !record.contentKeyEncTag ||
      !record.contentKeyEncAad
    ) {
      throw new Error('Encrypted content key payload is missing');
    }

    const chainClient = this.getChainClient(record.chainId);
    const receipt = await chainClient.getTransactionReceipt(createdTxHash);
    if (!receipt || receipt.status !== 'success') {
      await this.policyRepository.markFailed(
        record.id,
        'On-chain confirmation failed for the supplied transaction hash',
      );
      throw new Error(
        'On-chain confirmation failed for the supplied transaction hash',
      );
    }
    if (
      typeof input.createdBlockNumber === 'number' &&
      input.createdBlockNumber !== receipt.blockNumber
    ) {
      await this.policyRepository.markFailed(
        record.id,
        'createdBlockNumber does not match the on-chain transaction receipt',
      );
      throw new Error(
        'createdBlockNumber does not match the on-chain transaction receipt',
      );
    }
    if (createdBlockHash && createdBlockHash !== receipt.blockHash) {
      await this.policyRepository.markFailed(
        record.id,
        'createdBlockHash does not match the on-chain transaction receipt',
      );
      throw new Error(
        'createdBlockHash does not match the on-chain transaction receipt',
      );
    }

    const createdLog = await chainClient.getPolicyCreatedLog({
      policyVaultAddress: target.policyVaultAddress,
      txHash: createdTxHash,
      policyId: input.policyId,
    });
    if (!createdLog) {
      await this.policyRepository.markFailed(
        record.id,
        'PolicyCreated log was not found in the supplied transaction',
      );
      throw new Error(
        'PolicyCreated log was not found in the supplied transaction',
      );
    }
    if (
      typeof input.createdLogIndex === 'number' &&
      input.createdLogIndex !== createdLog.logIndex
    ) {
      await this.policyRepository.markFailed(
        record.id,
        'createdLogIndex does not match the PolicyCreated log',
      );
      throw new Error('createdLogIndex does not match the PolicyCreated log');
    }

    const onchainPolicy = await chainClient.getPolicy(
      target.policyVaultAddress,
      input.policyId,
    );
    if (!onchainPolicy) {
      await this.policyRepository.markFailed(
        record.id,
        'On-chain policy state could not be loaded for confirmation',
      );
      throw new Error('On-chain policy state could not be loaded for confirmation');
    }

    const expectedConditions = buildPreparedConditions({
      metadata: (record.metadataJson ?? {}) as ProgrammableSecretCanonicalMetadata,
      target,
    }).conditions;
    const expectedConditionsHash = computeConditionsHash(expectedConditions);
    const stagedContractAddress = normalizeHexAddress(
      record.contractAddress,
      'contractAddress',
    );
    if (stagedContractAddress !== target.paymentModuleAddress) {
      await this.policyRepository.markFailed(
        record.id,
        'Staged payment module address does not match the configured contract manifest',
      );
      throw new Error(
        'Staged payment module address does not match the configured contract manifest',
      );
    }
    if (
      normalizeHexAddress(record.paymentModuleAddress, 'paymentModuleAddress') !==
      target.paymentModuleAddress
    ) {
      await this.policyRepository.markFailed(
        record.id,
        'Staged payment module address does not match the configured payment module',
      );
      throw new Error(
        'Staged payment module address does not match the configured payment module',
      );
    }
    if (
      normalizeHexAddress(record.policyVaultAddress, 'policyVaultAddress') !==
      target.policyVaultAddress
    ) {
      await this.policyRepository.markFailed(
        record.id,
        'Staged policy vault address does not match the configured policy vault',
      );
      throw new Error(
        'Staged policy vault address does not match the configured policy vault',
      );
    }
    if (
      normalizeHexAddress(record.accessReceiptAddress, 'accessReceiptAddress') !==
      target.accessReceiptAddress
    ) {
      await this.policyRepository.markFailed(
        record.id,
        'Staged access receipt address does not match the configured access receipt',
      );
      throw new Error(
        'Staged access receipt address does not match the configured access receipt',
      );
    }
    if (record.providerAddress !== onchainPolicy.provider) {
      await this.policyRepository.markFailed(
        record.id,
        'providerAddress does not match the on-chain policy',
      );
      throw new Error('providerAddress does not match the on-chain policy');
    }
    if (record.payoutAddress !== onchainPolicy.payout) {
      await this.policyRepository.markFailed(
        record.id,
        'payoutAddress does not match the on-chain policy',
      );
      throw new Error('payoutAddress does not match the on-chain policy');
    }
    if (record.paymentToken !== onchainPolicy.paymentToken) {
      await this.policyRepository.markFailed(
        record.id,
        'paymentToken does not match the on-chain policy',
      );
      throw new Error('paymentToken does not match the on-chain policy');
    }
    if (record.priceWei !== onchainPolicy.priceWei) {
      await this.policyRepository.markFailed(
        record.id,
        'priceWei does not match the on-chain policy',
      );
      throw new Error('priceWei does not match the on-chain policy');
    }
    if (record.receiptTransferable !== onchainPolicy.receiptTransferable) {
      await this.policyRepository.markFailed(
        record.id,
        'receiptTransferable does not match the on-chain policy',
      );
      throw new Error('receiptTransferable does not match the on-chain policy');
    }
    if (record.ciphertextHash !== onchainPolicy.ciphertextHash) {
      await this.policyRepository.markFailed(
        record.id,
        'ciphertextHash does not match the on-chain policy',
      );
      throw new Error('ciphertextHash does not match the on-chain policy');
    }
    if (record.keyCommitment !== onchainPolicy.keyCommitment) {
      await this.policyRepository.markFailed(
        record.id,
        'keyCommitment does not match the on-chain policy',
      );
      throw new Error('keyCommitment does not match the on-chain policy');
    }
    if (record.metadataHash !== onchainPolicy.metadataHash) {
      await this.policyRepository.markFailed(
        record.id,
        'metadataHash does not match the on-chain policy',
      );
      throw new Error('metadataHash does not match the on-chain policy');
    }
    if (record.providerUaidHash !== onchainPolicy.providerUaidHash) {
      await this.policyRepository.markFailed(
        record.id,
        'providerUaidHash does not match the on-chain policy',
      );
      throw new Error('providerUaidHash does not match the on-chain policy');
    }
    if (onchainPolicy.conditionCount !== expectedConditions.length) {
      await this.policyRepository.markFailed(
        record.id,
        'conditionCount does not match the staged policy requirement',
      );
      throw new Error('conditionCount does not match the staged policy requirement');
    }
    if (onchainPolicy.conditionsHash !== expectedConditionsHash) {
      await this.policyRepository.markFailed(
        record.id,
        'conditionsHash does not match the staged policy requirement',
      );
      throw new Error('conditionsHash does not match the staged policy requirement');
    }

    for (const [index, expectedCondition] of expectedConditions.entries()) {
      const onchainCondition = onchainPolicy.conditions[index];
      if (!onchainCondition) {
        await this.policyRepository.markFailed(
          record.id,
          `condition ${index} is missing from the on-chain policy`,
        );
        throw new Error(`condition ${index} is missing from the on-chain policy`);
      }
      if (onchainCondition.evaluatorAddress !== expectedCondition.evaluatorAddress) {
        await this.policyRepository.markFailed(
          record.id,
          `condition ${index} evaluatorAddress does not match the staged policy requirement`,
        );
        throw new Error(
          `condition ${index} evaluatorAddress does not match the staged policy requirement`,
        );
      }
      if (onchainCondition.configHash !== expectedCondition.configHash) {
        await this.policyRepository.markFailed(
          record.id,
          `condition ${index} configHash does not match the staged policy requirement`,
        );
        throw new Error(
          `condition ${index} configHash does not match the staged policy requirement`,
        );
      }
    }

    const decryptedKey = this.aesGcmService.decrypt({
      ciphertext: record.contentKeyEnc,
      iv: record.contentKeyEncIv,
      tag: record.contentKeyEncTag,
      aad: record.contentKeyEncAad,
      version: record.contentKeyEncVersion,
    });
    const finalizedAad = [
      'policy',
      input.policyId,
      record.chainId,
      record.ciphertextHash,
    ].join(':');
    const encryptedKeyPayload: ProgrammableSecretEncryptedKeyPayload =
      this.aesGcmService.encrypt(decryptedKey, finalizedAad);
    const metadataJson =
      record.metadataJson &&
      typeof record.metadataJson === 'object' &&
      !Array.isArray(record.metadataJson)
        ? (record.metadataJson as ProgrammableSecretCanonicalMetadata)
        : undefined;
    const policyCreatedAt =
      typeof input.policyCreatedAt !== 'undefined' && input.policyCreatedAt !== null
        ? input.policyCreatedAt
        : onchainPolicy.createdAtUnix > 0
          ? new Date(onchainPolicy.createdAtUnix * 1000)
          : null;
    const confirmedAt = new Date();
    const existingRecord = await this.policyRepository.getByChainPolicy({
      chainId: record.chainId,
      contractAddress: target.contractAddress,
      policyId: input.policyId,
    });
    const indexedPolicyInput: UpsertIndexedProgrammableSecretPolicyInput = {
      network: target.network,
      chainId: record.chainId,
      contractAddress: target.contractAddress,
      paymentModuleAddress: target.paymentModuleAddress,
      policyVaultAddress: target.policyVaultAddress,
      accessReceiptAddress: target.accessReceiptAddress,
      policyId: input.policyId,
      providerAddress: record.providerAddress,
      payoutAddress: record.payoutAddress,
      paymentToken: record.paymentToken,
      priceWei: record.priceWei,
      expiresAt: record.expiresAt,
      expiresAtUnix: record.expiresAtUnix,
      active: onchainPolicy.active,
      allowlistEnabled: record.allowlistEnabled,
      receiptTransferable: record.receiptTransferable,
      ciphertextHash: record.ciphertextHash,
      keyCommitment: record.keyCommitment,
      metadataHash: record.metadataHash,
      providerUaidHash: record.providerUaidHash,
      providerUaid: record.providerUaid,
      ciphertextPath: record.ciphertextPath,
      encryptedKeyPayload,
      metadataJson,
      createdTxHash,
      createdBlockNumber: receipt.blockNumber,
      createdBlockHash: receipt.blockHash,
      createdLogIndex: createdLog.logIndex,
      policyCreatedAt,
      confirmedAt,
      status: existingRecord?.status === 'indexed' ? 'indexed' : 'finalized',
    };
    const finalizedRecord =
      existingRecord && existingRecord.id !== record.id
        ? await this.policyRepository.upsertIndexedPolicy(indexedPolicyInput)
        : await this.policyRepository.finalizePolicy({
            id: input.stagedPolicyId,
            policyId: input.policyId,
            createdTxHash,
            encryptedKeyPayload,
            createdBlockNumber: receipt.blockNumber,
            createdBlockHash: receipt.blockHash,
            createdLogIndex: createdLog.logIndex,
            policyCreatedAt: policyCreatedAt,
            confirmedAt,
            status: 'finalized',
          });

    if (existingRecord && existingRecord.id !== record.id) {
      await this.policyRepository.markFailed(
        record.id,
        `staged policy merged into indexed policy ${existingRecord.id}`,
      );
    }

    if (!finalizedRecord || typeof finalizedRecord.policyId !== 'number') {
      return null;
    }

    this.logger.info('Confirmed programmable secret policy', {
      stagedPolicyId: record.id,
      policyId: input.policyId,
      createdTxHash,
      createdBlockNumber: receipt.blockNumber,
      createdLogIndex: createdLog.logIndex,
    });

    return this.getPolicyById(finalizedRecord.policyId, record.chainId);
  }

  async listPolicies(
    limit?: number,
    chainId?: number,
  ): Promise<ProgrammableSecretsPolicyView[]> {
    const requestedChainId = chainId ?? this.config.chainId;
    const target = resolveProgrammableSecretsChainTarget(
      this.config,
      requestedChainId,
    );
    if (!target) {
      return [];
    }

    const policies = await this.policyRepository.listPolicies({
      chainId: requestedChainId,
      contractAddress: target?.contractAddress,
      paymentModuleAddress: target?.paymentModuleAddress,
      policyVaultAddress: target?.policyVaultAddress,
      accessReceiptAddress: target?.accessReceiptAddress,
      limit,
    });
    return Promise.all(policies.map((policy) => this.buildPolicyView(policy)));
  }

  async getPolicyById(
    policyId: number,
    chainId?: number,
  ): Promise<ProgrammableSecretsPolicyView | null> {
    const target = resolveProgrammableSecretsChainTarget(
      this.config,
      chainId ?? this.config.chainId,
    );
    if (!target) {
      return null;
    }

    const policy = await this.policyRepository.getByChainPolicy({
      chainId: target.chainId,
      contractAddress: target.contractAddress,
      policyId,
    });

    if (!policy) {
      return null;
    }

    return this.buildPolicyView(policy);
  }

  async getPolicyMetadata(
    policyId: number,
    chainId?: number,
  ): Promise<Record<string, unknown> | null> {
    const policy = await this.getPolicyById(policyId, chainId);
    return policy?.metadataJson ?? null;
  }

  async getPolicyPurchases(
    policyId: number,
  ): Promise<ProgrammableSecretsPurchaseView[]> {
    const purchases = await this.purchaseRepository.listByPolicy({ policyId });
    return purchases.map(mapPurchaseRecordToView);
  }

  async resolveCiphertext(policyId: number, chainId?: number): Promise<{
    path: string;
    size: number | null;
  } | null> {
    const policy = await this.getPolicyById(policyId, chainId);
    if (!policy?.id) {
      return null;
    }

    const record = await this.policyRepository.getById(policy.id);
    if (!record?.ciphertextPath) {
      return null;
    }

    const fileStat = await this.ciphertextStore.statCiphertext(record.ciphertextPath);
    this.logger.debug('Resolved programmable secrets ciphertext path', {
      policyId,
      ciphertextPath: record.ciphertextPath,
      size: fileStat?.size ?? null,
    });

    return {
      path: record.ciphertextPath,
      size: fileStat?.size ?? null,
    };
  }
}
