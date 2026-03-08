type Logger = {
  info: (...a: unknown[]) => void;
  warn: (...a: unknown[]) => void;
  debug: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
};
import { ProgrammableSecretsChainClient } from './chain-client';
import { resolveProgrammableSecretsChainTarget } from './contract-manifest';
import {
  buildImportedPolicyMetadata,
  computeImportedProviderUaidHash,
  decodeImportedCiphertext,
  decodeImportedContentKey,
  type ImportedPolicyBundleInput,
} from './imported-policy-metadata';
import { buildOnchainPolicyView } from './onchain-policy-view';
import {
  normalizeBlockHash,
  normalizeTxHash,
  sha256Hex,
} from './policy-service-helpers';
import { ProgrammableSecretPolicyPgRepository } from './repositories/policy-repo';
import type { ProgrammableSecretsConfig, ProgrammableSecretsPolicyView } from './types';
import { AesGcmService } from './aes-gcm';
import { CiphertextStore } from './ciphertext-store';
import { ProgrammableSecretsPolicyService } from './policy-service';

export interface ImportExternalProgrammableSecretPolicyInput {
  chainId?: number | null;
  policyId: number;
  bundle: ImportedPolicyBundleInput;
  createdTxHash?: string | null;
  createdBlockNumber?: number | null;
  createdBlockHash?: string | null;
  createdLogIndex?: number | null;
}

export class ProgrammableSecretsPolicyImportService {
  private readonly chainClients = new Map<number, ProgrammableSecretsChainClient>();

  constructor(
    private readonly policyRepository: ProgrammableSecretPolicyPgRepository,
    private readonly ciphertextStore: CiphertextStore,
    private readonly aesGcmService: AesGcmService | null,
    private readonly chainClient: ProgrammableSecretsChainClient,
    private readonly policyService: ProgrammableSecretsPolicyService,
    private readonly logger: Logger,
    private readonly config: ProgrammableSecretsConfig,
  ) {}

  private getChainClient(chainId: number): ProgrammableSecretsChainClient {
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

  async importPolicy(
    input: ImportExternalProgrammableSecretPolicyInput,
  ): Promise<ProgrammableSecretsPolicyView | null> {
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

    const onchainPolicy = await this.getChainClient(target.chainId).getPolicy(
      target.policyVaultAddress,
      input.policyId,
    );
    if (!onchainPolicy) {
      throw new Error(`On-chain policy ${input.policyId} was not found`);
    }

    const ciphertext = decodeImportedCiphertext(input.bundle);
    const contentKey = decodeImportedContentKey(input.bundle);
    const ciphertextHash = sha256Hex(ciphertext);
    const keyCommitment = sha256Hex(contentKey);
    const providerUaidHash = computeImportedProviderUaidHash(
      input.bundle.providerUaid,
    );

    if (ciphertextHash !== onchainPolicy.ciphertextHash) {
      throw new Error('bundle ciphertext does not match the on-chain policy');
    }
    if (keyCommitment !== onchainPolicy.keyCommitment) {
      throw new Error('bundle content key does not match the on-chain policy');
    }
    if (providerUaidHash !== onchainPolicy.providerUaidHash) {
      throw new Error('bundle providerUaid does not match the on-chain policy');
    }

    const ciphertextPath = await this.ciphertextStore.writeCiphertext(
      ciphertextHash,
      ciphertext,
    );
    const encryptedKeyPayload = this.aesGcmService.encrypt(
      contentKey,
      ['policy', input.policyId, target.chainId, ciphertextHash].join(':'),
    );
    const onchainView = buildOnchainPolicyView({
      policyId: input.policyId,
      policy: onchainPolicy,
      target,
    });
    const metadataJson = buildImportedPolicyMetadata({
      bundle: input.bundle,
      policy: onchainView,
    });
    const confirmedAt = new Date();
    const policyCreatedAt =
      onchainPolicy.createdAtUnix > 0
        ? new Date(onchainPolicy.createdAtUnix * 1000)
        : null;

    await this.policyRepository.upsertIndexedPolicy({
      network: target.network,
      chainId: target.chainId,
      contractAddress: target.contractAddress,
      paymentModuleAddress: target.paymentModuleAddress,
      policyVaultAddress: target.policyVaultAddress,
      accessReceiptAddress: target.accessReceiptAddress,
      policyId: input.policyId,
      providerAddress: onchainPolicy.provider,
      payoutAddress: onchainPolicy.payout,
      paymentToken: onchainPolicy.paymentToken,
      priceWei: onchainPolicy.priceWei,
      expiresAt: onchainView.expiresAt ? new Date(onchainView.expiresAt) : null,
      expiresAtUnix: onchainView.expiresAtUnix,
      active: onchainPolicy.active,
      allowlistEnabled: onchainPolicy.allowlistEnabled,
      receiptTransferable: onchainPolicy.receiptTransferable,
      ciphertextHash,
      keyCommitment,
      metadataHash: onchainPolicy.metadataHash,
      providerUaidHash,
      providerUaid: input.bundle.providerUaid.trim(),
      ciphertextPath,
      encryptedKeyPayload,
      metadataJson,
      createdTxHash: input.createdTxHash ? normalizeTxHash(input.createdTxHash) : null,
      createdBlockNumber: input.createdBlockNumber ?? null,
      createdBlockHash: input.createdBlockHash
        ? normalizeBlockHash(input.createdBlockHash)
        : null,
      createdLogIndex: input.createdLogIndex ?? null,
      policyCreatedAt,
      confirmedAt,
      indexedAt: confirmedAt,
      status: 'indexed',
    });

    this.logger.info('Imported external programmable secret policy', {
      policyId: input.policyId,
      chainId: target.chainId,
      ciphertextHash,
    });

    return this.policyService.getPolicyById(input.policyId, target.chainId);
  }
}
