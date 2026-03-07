import { randomBytes } from 'node:crypto';
type Logger = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
import type { HolProgrammableSecretKeyRequestRecord } from './schema';
import { ProgrammableSecretKeyRequestPgRepository } from './repositories/key-request-repo';
import { ProgrammableSecretPolicyPgRepository } from './repositories/policy-repo';
import { ProgrammableSecretPurchasePgRepository } from './repositories/purchase-repo';
import { normalizeProgrammableSecretKeyRequestStatus } from './types-shared';
import { AesGcmService } from './aes-gcm';
import { ProgrammableSecretsChainClient } from './chain-client';
import { resolveProgrammableSecretsChainTarget } from './contract-manifest';
import { RsaOaepService } from './rsa-oaep';
import { ProgrammableSecretsSignatureService } from './signature-service';
import type {
  ProgrammableSecretsConfig,
  ProgrammableSecretsKeyRequestView,
} from './types';

const DEFAULT_NONCE_TTL_MS = 5 * 60 * 1000;

const toIsoString = (value?: Date | null): string | null =>
  value ? value.toISOString() : null;

const isHexAddress = (value: string): value is `0x${string}` =>
  /^0x[a-f0-9]{40}$/.test(value);

const normalizeHexAddress = (value: string, label: string): `0x${string}` => {
  const normalized = value.trim().toLowerCase();
  if (!isHexAddress(normalized)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return normalized;
};

const isHexString = (value: string): value is `0x${string}` =>
  /^0x[a-f0-9]+$/.test(value);

const normalizeSignature = (value: string): `0x${string}` => {
  const normalized = value.trim().toLowerCase();
  if (!isHexString(normalized)) {
    throw new Error('signature must be a hex string');
  }
  return normalized;
};

const normalizeFingerprint = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/:/g, '');
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('buyerPublicKeyFingerprint must be a 32-byte hex string');
  }
  return normalized;
};

const toMetadataRecord = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export interface IssueProgrammableSecretNonceInput {
  policyId: number;
  buyerAddress: string;
  chainId?: number;
}

export interface ProgrammableSecretsNonceView {
  requestId: string;
  policyId: number;
  buyerAddress: string;
  nonce: string;
  challengeMessage: string;
  expiresAt: string;
}

export interface RequestProgrammableSecretKeyInput {
  requestId: string;
  policyId: number;
  buyerAddress: string;
  nonce: string;
  signature: string;
  buyerRsaPublicKeyPem: string;
  buyerPublicKeyFingerprint: string;
}

export class ProgrammableSecretsKrsService {
  private readonly chainClients = new Map<number, ProgrammableSecretsChainClient>();

  constructor(
    private readonly repository: ProgrammableSecretKeyRequestPgRepository,
    private readonly policyRepository: ProgrammableSecretPolicyPgRepository,
    private readonly purchaseRepository: ProgrammableSecretPurchasePgRepository,
    private readonly aesGcmService: AesGcmService | null,
    private readonly rsaOaepService: RsaOaepService,
    private readonly signatureService: ProgrammableSecretsSignatureService,
    private readonly chainClient: ProgrammableSecretsChainClient,
    private readonly logger: Logger,
    private readonly config: ProgrammableSecretsConfig,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.enabled &&
        this.config.krsMasterKey &&
        this.aesGcmService,
    );
  }

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

  async issueNonce(
    input: IssueProgrammableSecretNonceInput,
  ): Promise<ProgrammableSecretsNonceView> {
    if (!this.isConfigured()) {
      throw new Error('Programmable secrets KRS is not configured');
    }

    const target = resolveProgrammableSecretsChainTarget(
      this.config,
      input.chainId ?? this.config.chainId,
    );
    if (!target) {
      throw new Error('Programmable secrets contract manifest is not configured');
    }
    const contractAddress = target.paymentModuleAddress;
    const buyerAddress = normalizeHexAddress(input.buyerAddress, 'buyerAddress');
    const policy = await this.policyRepository.getByChainPolicy({
      chainId: target.chainId,
      contractAddress,
      policyId: input.policyId,
    });

    if (!policy || typeof policy.policyId !== 'number') {
      throw new Error('Policy not found');
    }
    if (policy.status !== 'finalized' && policy.status !== 'indexed') {
      throw new Error('Policy is not ready for key issuance');
    }
    if (
      !policy.contentKeyEnc ||
      !policy.contentKeyEncIv ||
      !policy.contentKeyEncTag ||
      !policy.contentKeyEncAad ||
      !policy.ciphertextPath
    ) {
      throw new Error('Policy key material is not available for issuance');
    }

    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + DEFAULT_NONCE_TTL_MS);
    const challengeMessage = [
      'Programmable Secrets Access Request',
      `network:${target.network}`,
      `chainId:${target.chainId}`,
      `paymentModule:${policy.paymentModuleAddress}`,
      `policyVault:${policy.policyVaultAddress}`,
      `policyId:${input.policyId}`,
      `buyer:${buyerAddress}`,
      `nonce:${nonce}`,
      `expiresAt:${expiresAt.toISOString()}`,
    ].join('\n');

    const request = await this.repository.createNonceRequest({
      chainId: target.chainId,
      contractAddress,
      paymentModuleAddress: policy.paymentModuleAddress,
      policyVaultAddress: policy.policyVaultAddress,
      accessReceiptAddress: policy.accessReceiptAddress,
      policyRecordId: policy.id,
      policyId: input.policyId,
      buyerAddress,
      nonce,
      nonceExpiresAt: expiresAt,
      challengeMessage,
    });

    this.logger.info('Issued programmable secrets nonce', {
      requestId: request.id,
      policyId: input.policyId,
      buyerAddress,
      nonceExpiresAt: expiresAt.toISOString(),
    });

    return {
      requestId: request.id,
      policyId: input.policyId,
      buyerAddress,
      nonce,
      challengeMessage,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async requestKey(
    input: RequestProgrammableSecretKeyInput,
  ): Promise<ProgrammableSecretsKeyRequestView | null> {
    if (!this.isConfigured()) {
      throw new Error('Programmable secrets KRS is not configured');
    }

    const request = await this.repository.getById(input.requestId);
    if (!request) {
      return null;
    }

    const buyerAddress = normalizeHexAddress(input.buyerAddress, 'buyerAddress');
    if (request.policyId !== input.policyId) {
      throw new Error('policyId does not match the issued nonce');
    }
    if (request.buyerAddress !== buyerAddress) {
      throw new Error('buyerAddress does not match the issued nonce');
    }
    if (request.nonce !== input.nonce.trim()) {
      throw new Error('nonce does not match the issued nonce');
    }

    const normalizedFingerprint = normalizeFingerprint(
      input.buyerPublicKeyFingerprint,
    );
    if (
      request.status === 'issued' &&
      request.buyerPublicKeyFingerprint &&
      normalizeFingerprint(request.buyerPublicKeyFingerprint) ===
        normalizedFingerprint
    ) {
      return this.mapRequestRecord(request);
    }

    if (request.status === 'expired') {
      return this.mapRequestRecord(request);
    }

    if (request.status === 'denied') {
      return this.mapRequestRecord(request);
    }

    if (request.nonceConsumedAt) {
      throw new Error('nonce has already been consumed');
    }

    const now = new Date();
    if (request.nonceExpiresAt.getTime() <= now.getTime()) {
      await this.repository.completeRequest({
        id: request.id,
        status: 'expired',
        errorCode: 'nonce_expired',
        errorMessage: 'Nonce has expired',
        completedAt: now,
      });
      return this.getRequest(request.id);
    }

    const derivedFingerprint = this.rsaOaepService.getPublicKeyFingerprint(
      input.buyerRsaPublicKeyPem,
    );
    if (normalizeFingerprint(derivedFingerprint) !== normalizedFingerprint) {
      throw new Error('buyerPublicKeyFingerprint does not match the RSA public key');
    }

    const normalizedSignature = normalizeSignature(input.signature);
    const signatureVerified = await this.signatureService.verifyEip191Signature({
      address: normalizeHexAddress(buyerAddress, 'buyerAddress'),
      message: request.challengeMessage,
      signature: normalizedSignature,
    });
    if (!signatureVerified) {
      await this.repository.completeRequest({
        id: request.id,
        status: 'denied',
        buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem,
        buyerPublicKeyFingerprint: normalizedFingerprint,
        signature: normalizedSignature,
        errorCode: 'invalid_signature',
        errorMessage: 'Wallet signature verification failed',
        nonceConsumedAt: now,
        completedAt: now,
      });
      return this.getRequest(request.id);
    }

    const policy = await this.policyRepository.getById(request.policyRecordId);
    if (!policy || typeof policy.policyId !== 'number') {
      await this.repository.completeRequest({
        id: request.id,
        status: 'denied',
        buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem,
        buyerPublicKeyFingerprint: normalizedFingerprint,
        signature: normalizedSignature,
        errorCode: 'policy_not_found',
        errorMessage: 'Policy could not be resolved for key issuance',
        nonceConsumedAt: now,
        completedAt: now,
      });
      return this.getRequest(request.id);
    }

    if (
      !policy.contentKeyEnc ||
      !policy.contentKeyEncIv ||
      !policy.contentKeyEncTag ||
      !policy.contentKeyEncAad ||
      !policy.ciphertextPath ||
      !policy.metadataJson
    ) {
      await this.repository.completeRequest({
        id: request.id,
        status: 'denied',
        buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem,
        buyerPublicKeyFingerprint: normalizedFingerprint,
        signature: normalizedSignature,
        errorCode: 'policy_not_ready',
        errorMessage: 'Policy does not have the required offchain payloads',
        nonceConsumedAt: now,
        completedAt: now,
      });
      return this.getRequest(request.id);
    }

    const hasAccessOnChain = await this.getChainClient(request.chainId).hasAccess(
      request.paymentModuleAddress,
      policy.policyId,
      buyerAddress,
    );
    const indexedPurchase = await this.purchaseRepository.getByPolicyAndBuyer({
      chainId: request.chainId,
      contractAddress: request.paymentModuleAddress,
      policyId: policy.policyId,
      buyerAddress,
    });

    if (!hasAccessOnChain && !indexedPurchase) {
      await this.repository.completeRequest({
        id: request.id,
        status: 'denied',
        receiptTokenId: request.receiptTokenId ?? null,
        buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem,
        buyerPublicKeyFingerprint: normalizedFingerprint,
        signature: normalizedSignature,
        errorCode: 'access_not_found',
        errorMessage: 'Buyer does not have on-chain access for this policy',
        nonceConsumedAt: now,
        completedAt: now,
      });
      return this.getRequest(request.id);
    }

    await this.repository.markPending(request.id, {
      buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem,
      buyerPublicKeyFingerprint: normalizedFingerprint,
      signature: normalizedSignature,
      nonceConsumedAt: now,
    });

    const contentKey = this.aesGcmService!.decrypt({
      ciphertext: policy.contentKeyEnc,
      iv: policy.contentKeyEncIv,
      tag: policy.contentKeyEncTag,
      aad: policy.contentKeyEncAad,
      version: policy.contentKeyEncVersion,
    });
    const encryptedKey = this.rsaOaepService.encryptToBase64(
      input.buyerRsaPublicKeyPem,
      contentKey,
    );
    const ciphertextUrl = this.resolveCiphertextUrl(policy.policyId, request.chainId);
    const metadataJson = toMetadataRecord(policy.metadataJson);

    await this.repository.completeRequest({
      id: request.id,
      status: 'issued',
      receiptTokenId: indexedPurchase?.receiptTokenId ?? request.receiptTokenId ?? null,
      buyerRsaPublicKeyPem: input.buyerRsaPublicKeyPem,
      buyerPublicKeyFingerprint: normalizedFingerprint,
      signature: normalizedSignature,
      encryptedKey,
      ciphertextUrl,
      ciphertextHash: policy.ciphertextHash,
      keyCommitment: policy.keyCommitment,
      metadataJson,
      resultPayload: {
        algorithm: 'rsa-oaep-sha256',
        ciphertextUrl,
        buyerPublicKeyFingerprint: normalizedFingerprint,
      },
      nonceConsumedAt: now,
      completedAt: now,
    });

    this.logger.info('Issued programmable secrets envelope', {
      requestId: request.id,
      policyId: policy.policyId,
      buyerAddress,
      ciphertextUrl,
    });

    return this.getRequest(request.id);
  }

  async getRequest(
    requestId: string,
  ): Promise<ProgrammableSecretsKeyRequestView | null> {
    const request = await this.repository.getById(requestId);
    return request ? this.mapRequestRecord(request) : null;
  }

  private mapRequestRecord(
    request: HolProgrammableSecretKeyRequestRecord,
  ): ProgrammableSecretsKeyRequestView {
    this.logger.debug('Loaded programmable secrets key request', {
      requestId: request.id,
      status: request.status,
    });

    return {
      id: request.id,
      contractAddress: request.contractAddress,
      paymentModuleAddress: request.paymentModuleAddress,
      policyVaultAddress: request.policyVaultAddress,
      accessReceiptAddress: request.accessReceiptAddress,
      policyId: Number(request.policyId),
      receiptTokenId: request.receiptTokenId ?? null,
      buyerAddress: request.buyerAddress,
      status: normalizeProgrammableSecretKeyRequestStatus(request.status),
      challengeMessage: request.challengeMessage,
      nonceIssuedAt: request.nonceIssuedAt.toISOString(),
      nonceExpiresAt: request.nonceExpiresAt.toISOString(),
      nonceConsumedAt: toIsoString(request.nonceConsumedAt),
      buyerPublicKeyFingerprint: request.buyerPublicKeyFingerprint ?? null,
      encryptedKey: request.encryptedKey ?? null,
      ciphertextUrl: request.ciphertextUrl ?? null,
      ciphertextHash: request.ciphertextHash ?? null,
      keyCommitment: request.keyCommitment ?? null,
      metadataJson: toMetadataRecord(request.metadataJson),
      completedAt: toIsoString(request.completedAt),
      errorCode: request.errorCode ?? null,
      errorMessage: request.errorMessage ?? null,
    };
  }

  private resolveCiphertextUrl(policyId: number, chainId: number): string {
    return `/api/ps/policies/${policyId}/ciphertext?chainId=${chainId}`;
  }
}
