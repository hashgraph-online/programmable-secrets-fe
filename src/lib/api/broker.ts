/**
 * Lightweight API client for the programmable-secrets endpoints.
 * Points at the local Next.js API routes — no external broker needed.
 */
import type {
  ProgrammableSecretsConditionDescriptor,
  ProgrammableSecretsConditionWitness,
} from '@/lib/server/policy-conditions';

const API_PREFIX = '/api/ps';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_PREFIX}${path}`;
  const res = await fetch(url, { ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = typeof body.error === 'string' ? body.error : res.statusText || 'Request failed';
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

async function arrayBufferRequest(path: string): Promise<ArrayBuffer> {
  const url = `${API_PREFIX}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(typeof body.error === 'string' ? body.error : 'Request failed', res.status);
  }
  return res.arrayBuffer();
}

// ── Types ──

export interface HealthView {
  status: string;
  network?: string;
  policyVaultAddress?: string;
  paymentModuleAddress?: string;
  accessReceiptAddress?: string;
  activePolicies?: number;
  totalVolume?: string;
}

export interface PolicyView {
  id: string;
  network: string;
  chainId: number;
  policyId: number | null;
  status: string;
  active: boolean;
  providerAddress: string;
  providerUaid: string | null;
  providerUaidHash: string;
  payoutAddress: string;
  paymentToken: string;
  priceWei: string;
  expiresAtUnix: number | null;
  conditionsHash: string | null;
  conditionCount: number | null;
  conditions: Array<{
    index: number;
    evaluatorAddress: string;
    configHash: string;
    configDataHex: string | null;
    descriptor: ProgrammableSecretsConditionDescriptor | null;
    runtimeWitness: ProgrammableSecretsConditionWitness;
  }>;
  declaredConditions: ProgrammableSecretsConditionDescriptor[];
  ciphertextHash: string;
  keyCommitment: string;
  metadataHash: string;
  metadataJson: Record<string, unknown> | null;
  keyReleaseReady: boolean;
  policyVaultAddress: string;
  paymentModuleAddress: string;
  accessReceiptAddress: string;
  createdTxHash: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface PolicyDetailResponse {
  policy: PolicyView;
  providerIdentity?: {
    verificationResult?: unknown;
  };
}

export interface PoliciesResponse {
  policies: PolicyView[];
  total: number;
}

export interface NonceView {
  requestId: string;
  nonce: string;
  challengeMessage: string;
}

export interface KeyRequestView {
  requestId: string;
  policyId: number;
  buyerAddress: string;
  status: string;
  encryptedKey?: string;
  errorMessage?: string;
}

export interface PreparedPolicy {
  stagedPolicyId: string;
  chainId: number;
  network: string;
  policyVaultAddress: string;
  paymentModuleAddress: string;
  accessReceiptAddress: string;
  onchainInputs: {
    payoutAddress: string;
    paymentToken: string;
    priceWei: string;
    conditions: Array<{
      evaluator: `0x${string}`;
      configData: `0x${string}`;
      configHash: string;
    }>;
    ciphertextHash: string;
    keyCommitment: string;
    metadataHash: string;
    providerUaidHash: string;
    declaredConditions: Array<{
      evaluatorAddress: string;
      configDataHex: string;
      configHash: string;
      runtimeWitness: ProgrammableSecretsConditionWitness;
      descriptor: ProgrammableSecretsConditionDescriptor;
    }>;
  };
}

// ── API methods ──

export const broker = {
  health: () => jsonRequest<HealthView>('/health'),

  listPolicies: (limit?: number) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const q = params.toString();
    return jsonRequest<PoliciesResponse>(q ? `/policies?${q}` : '/policies');
  },

  getPolicy: async (policyId: number) => {
    try {
      return await jsonRequest<PolicyDetailResponse>(`/policies/${policyId}`);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
      const fallback = await jsonRequest<PoliciesResponse>('/policies?limit=200');
      const matchedPolicy =
        fallback.policies.find((policy) => policy.policyId === policyId) ?? null;
      if (!matchedPolicy) {
        throw error;
      }
      return { policy: matchedPolicy };
    }
  },

  getPolicyCiphertext: (policyId: number) =>
    arrayBufferRequest(`/policies/${policyId}/ciphertext`),

  preparePolicy: (payload: {
    providerAddress: string;
    providerUaid: string;
    payoutAddress: string;
    priceWei: string;
    contentKeyB64: string;
    ciphertextBase64: string;
    metadata: Record<string, unknown>;
  }) =>
    jsonRequest<PreparedPolicy>('/provider/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  confirmPolicy: (payload: {
    stagedPolicyId: string;
    policyId: number;
    createdTxHash: string;
    createdBlockNumber?: number | null;
  }) =>
    jsonRequest<{ policy: PolicyView }>('/provider/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  createNonce: (payload: { policyId: number; buyerAddress: string }) =>
    jsonRequest<NonceView>('/nonces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  requestKey: (payload: {
    requestId: string;
    policyId: number;
    buyerAddress: string;
    nonce: string;
    signature: string;
    buyerRsaPublicKeyPem: string;
    buyerPublicKeyFingerprint: string;
  }) =>
    jsonRequest<KeyRequestView>('/keys/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getKeyRequest: (requestId: string) =>
    jsonRequest<KeyRequestView>(`/keys/${requestId}`),

  pollKeyRequest: async (
    requestId: string,
    opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<KeyRequestView> => {
    const intervalMs = opts?.intervalMs ?? 1500;
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const startedAt = Date.now();

    while (true) {
      const kr = await jsonRequest<KeyRequestView>(
        `/keys/${requestId}`,
        { signal: opts?.signal },
      );
      if (kr.status !== 'nonce-issued' && kr.status !== 'pending') return kr;
      if (Date.now() - startedAt >= timeoutMs)
        throw new Error(`Timed out polling key request ${requestId}`);
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  },
};
