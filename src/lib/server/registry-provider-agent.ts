import {
  parseHcs14Did,
  RegistryBrokerClient,
  type AgentSearchHit,
} from '@hashgraphonline/standards-sdk';
import { getAddress } from 'viem';

const DEFAULT_REGISTRY_BROKER_BASE_URL = 'https://hol.org/registry/api/v1';
const CUSTODIAN_WALLET_ADDRESS = '0x8fc56f5f0534bb25e7f140eb467e6d1ddba62e57';

export interface ResolvedProviderAgentIdentity {
  uaid: string | null;
  source: 'policy-uaid' | 'registry-search' | 'none';
  reason?: string;
  agent?: {
    uaid: string;
    name: string;
    registry: string;
    trustScore: number | null;
    availabilityStatus: string | null;
    networkKey: string | null;
  };
}

const normalizeBrokerBaseUrl = (input: string): string => {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (/\/api\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/registry$/i.test(trimmed)) {
    return `${trimmed}/api/v1`;
  }
  return `${trimmed}/registry/api/v1`;
};

const resolveBrokerBaseUrl = (): string => {
  const preferred = process.env.REGISTRY_BROKER_API_URL?.trim();
  if (preferred && preferred.length > 0) {
    return normalizeBrokerBaseUrl(preferred);
  }
  const publicOrigin = process.env.NEXT_PUBLIC_REGISTRY_ORIGIN?.trim();
  if (publicOrigin && publicOrigin.length > 0) {
    return normalizeBrokerBaseUrl(publicOrigin);
  }
  return DEFAULT_REGISTRY_BROKER_BASE_URL;
};

const normalizeAddress = (value: string): string | null => {
  try {
    return getAddress(value).toLowerCase();
  } catch {
    return null;
  }
};

const isValidHcs14Uaid = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('uaid:')) {
    return false;
  }
  try {
    parseHcs14Did(trimmed);
    return true;
  } catch {
    return false;
  }
};

const normalizeTrustScore = (agent: AgentSearchHit): number | null => {
  const fromBreakdown =
    agent.trustScores &&
    typeof agent.trustScores === 'object' &&
    typeof (agent.trustScores as { total?: unknown }).total === 'number'
      ? (agent.trustScores as { total: number }).total
      : null;
  if (fromBreakdown !== null && Number.isFinite(fromBreakdown)) {
    return fromBreakdown;
  }
  if (typeof agent.trustScore === 'number' && Number.isFinite(agent.trustScore)) {
    return agent.trustScore;
  }
  return null;
};

const rankAgentCandidate = (
  agent: AgentSearchHit,
  context: { chainId: number; providerAddress: string | null },
): number => {
  const metadata =
    agent.metadata && typeof agent.metadata === 'object'
      ? (agent.metadata as Record<string, unknown>)
      : {};
  const networkKey =
    typeof metadata.networkKey === 'string' ? metadata.networkKey : null;
  const ownerAddress =
    typeof metadata.ownerAddress === 'string'
      ? normalizeAddress(metadata.ownerAddress)
      : null;
  const expectedNetworkKey = `eip155:${context.chainId}`;
  const trustScore = normalizeTrustScore(agent) ?? 0;
  const availability =
    typeof metadata.availabilityStatus === 'string'
      ? metadata.availabilityStatus.toLowerCase()
      : '';
  const name = typeof agent.name === 'string' ? agent.name.toLowerCase() : '';
  const isCustodianMatch =
    context.providerAddress === CUSTODIAN_WALLET_ADDRESS &&
    name.includes('custodian');
  const isPingAgent = name.includes('ping');

  let score = trustScore;
  if (networkKey === expectedNetworkKey) {
    score += 200;
  }
  if (ownerAddress && context.providerAddress && ownerAddress === context.providerAddress) {
    score += 140;
  }
  if (agent.registry === 'erc-8004') {
    score += 80;
  }
  if (agent.registry === 'a2a-registry' && isPingAgent) {
    score += 40;
  }
  if (availability === 'online') {
    score += 25;
  } else if (availability === 'degraded') {
    score += 10;
  }
  if (isCustodianMatch) {
    score += 30;
  }
  if (context.providerAddress === CUSTODIAN_WALLET_ADDRESS && isPingAgent) {
    score += 20;
  }
  return score;
};

const mapAgentSummary = (agent: AgentSearchHit): ResolvedProviderAgentIdentity['agent'] => {
  const metadata =
    agent.metadata && typeof agent.metadata === 'object'
      ? (agent.metadata as Record<string, unknown>)
      : {};
  return {
    uaid: agent.uaid,
    name: agent.name,
    registry: agent.registry,
    trustScore: normalizeTrustScore(agent),
    availabilityStatus:
      typeof metadata.availabilityStatus === 'string'
        ? metadata.availabilityStatus
        : null,
    networkKey:
      typeof metadata.networkKey === 'string' ? metadata.networkKey : null,
  };
};

const pickBestCandidate = (
  candidates: AgentSearchHit[],
  context: { chainId: number; providerAddress: string | null },
): AgentSearchHit | null => {
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort(
    (left, right) =>
      rankAgentCandidate(right, context) - rankAgentCandidate(left, context),
  );
  return sorted[0] ?? null;
};

export const resolveProviderAgentIdentity = async (params: {
  providerAddress: string;
  chainId: number;
  policyProviderUaid?: string | null;
}): Promise<ResolvedProviderAgentIdentity> => {
  const canonicalPolicyUaid =
    isValidHcs14Uaid(params.policyProviderUaid)
      ? params.policyProviderUaid.trim()
      : null;
  if (canonicalPolicyUaid) {
    return {
      uaid: canonicalPolicyUaid,
      source: 'policy-uaid',
    };
  }

  const normalizedAddress = normalizeAddress(params.providerAddress);
  if (!normalizedAddress) {
    return {
      uaid: null,
      source: 'none',
      reason: 'invalid-provider-address',
    };
  }

  const client = new RegistryBrokerClient({
    baseUrl: resolveBrokerBaseUrl(),
  });

  const primaryResult = await client.search({
    q: normalizedAddress,
    limit: 80,
    registries: ['erc-8004'],
  });

  let candidates = Array.isArray(primaryResult.hits)
    ? primaryResult.hits.filter((agent) => isValidHcs14Uaid(agent.uaid))
    : [];
  if (candidates.length === 0) {
    const fallbackResult = await client.search({
      q: normalizedAddress,
      limit: 80,
    });
    candidates = Array.isArray(fallbackResult.hits)
      ? fallbackResult.hits.filter((agent) => isValidHcs14Uaid(agent.uaid))
      : [];
  }
  if (candidates.length === 0) {
    if (normalizedAddress === CUSTODIAN_WALLET_ADDRESS) {
      const pingFallbackResult = await client.search({
        q: 'registry-ping-agent',
        limit: 20,
      });
      candidates = Array.isArray(pingFallbackResult.hits)
        ? pingFallbackResult.hits.filter(
            (agent) =>
              isValidHcs14Uaid(agent.uaid) &&
              agent.registry === 'a2a-registry' &&
              agent.name.toLowerCase().includes('ping'),
          )
        : [];
    }
    if (candidates.length === 0) {
      return {
        uaid: null,
        source: 'none',
        reason: 'no-agent-match',
      };
    }
  }

  const best = pickBestCandidate(candidates, {
    chainId: params.chainId,
    providerAddress: normalizedAddress,
  });
  if (!best) {
    return {
      uaid: null,
      source: 'none',
      reason: 'no-best-candidate',
    };
  }

  return {
    uaid: best.uaid,
    source: 'registry-search',
    agent: mapAgentSummary(best),
  };
};
