import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Hex,
} from 'viem';
import type { ProgrammableSecretCanonicalMetadata } from './types-shared';
import type { ProgrammableSecretsChainTarget } from './contract-manifest';

function parseHcs14Did(uaid: string): { params: Record<string, string> } {
  const params: Record<string, string> = {};
  const parts = uaid.split(':');
  for (const part of parts) {
    if (part.includes('=')) {
      const [key, ...rest] = part.split('=');
      params[key] = rest.join('=');
    }
  }
  const lastSegment = parts[parts.length - 1];
  if (lastSegment && !lastSegment.includes('=')) {
    params.uid = lastSegment;
    params.nativeId = lastSegment;
  }
  return { params };
}

export type ProgrammableSecretsConditionWitness =
  | { kind: 'none' }
  | { kind: 'buyer-uaid'; label?: string }
  | { kind: 'utf8'; label: string; placeholder?: string }
  | { kind: 'hex'; label: string; placeholder?: string };

export type ProgrammableSecretsConditionDescriptor =
  | {
      kind: 'time-range';
      notBeforeUnix?: number | null;
      notAfterUnix?: number | null;
      evaluatorAddress?: string | null;
    }
  | {
      kind: 'uaid-ownership';
      requiredBuyerUaid: string;
      evaluatorAddress?: string | null;
      identityRegistryAddress?: string | null;
      agentId?: number | null;
    }
  | {
      kind: 'evm-allowlist';
      allowlistedBuyerAddresses: string[];
      evaluatorAddress?: string | null;
    }
  | {
      kind: 'custom-static';
      evaluatorAddress: string;
      configDataHex: string;
      runtimeWitness?: ProgrammableSecretsConditionWitness;
      label?: string;
      description?: string;
    };

export interface PreparedProgrammableSecretsCondition {
  evaluatorAddress: string;
  configDataHex: string;
  configHash: string;
  runtimeWitness: ProgrammableSecretsConditionWitness;
  descriptor: ProgrammableSecretsConditionDescriptor;
}

interface ConditionPreparationResult {
  conditions: PreparedProgrammableSecretsCondition[];
  expiresAtUnix: number | null;
  allowlistEnabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAddress(value: string, label: string): string {
  try {
    return getAddress(value).toLowerCase();
  } catch {
    throw new Error(`${label} must be a valid EVM address`);
  }
}

function normalizeOptionalPositiveInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function normalizeHex(value: string, label: string): Hex {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be a hex string`);
  }
  return normalized as Hex;
}

function resolveConfiguredEvaluatorAddress(
  descriptor: ProgrammableSecretsConditionDescriptor,
  target: ProgrammableSecretsChainTarget,
): string {
  if (descriptor.kind === 'custom-static') {
    return normalizeAddress(
      descriptor.evaluatorAddress,
      `${descriptor.kind}.evaluatorAddress`,
    );
  }
  if (typeof descriptor.evaluatorAddress === 'string') {
    return normalizeAddress(
      descriptor.evaluatorAddress,
      `${descriptor.kind}.evaluatorAddress`,
    );
  }

  if (descriptor.kind === 'time-range') {
    if (!target.timeRangeConditionAddress) {
      throw new Error('Time range condition evaluator is not configured for this chain');
    }
    return target.timeRangeConditionAddress;
  }

  if (descriptor.kind === 'uaid-ownership') {
    if (!target.uaidOwnershipConditionAddress) {
      throw new Error('UAID ownership condition evaluator is not configured for this chain');
    }
    return target.uaidOwnershipConditionAddress;
  }

  if (!target.addressAllowlistConditionAddress) {
    throw new Error('Allowlist condition evaluator is not configured for this chain');
  }
  return target.addressAllowlistConditionAddress;
}

function resolveTimeRangeConfigData(
  descriptor: Extract<ProgrammableSecretsConditionDescriptor, { kind: 'time-range' }>,
): Hex {
  const notBeforeUnix =
    normalizeOptionalPositiveInteger(descriptor.notBeforeUnix, 'time-range.notBeforeUnix') ?? 0;
  const notAfterUnix =
    normalizeOptionalPositiveInteger(descriptor.notAfterUnix, 'time-range.notAfterUnix') ?? 0;

  return encodeAbiParameters(
    parseAbiParameters('uint64 notBefore, uint64 notAfter'),
    [BigInt(notBeforeUnix), BigInt(notAfterUnix)],
  );
}

function resolveUaidOwnershipConfigData(
  descriptor: Extract<ProgrammableSecretsConditionDescriptor, { kind: 'uaid-ownership' }>,
  target: ProgrammableSecretsChainTarget,
): Hex {
  const requiredBuyerUaid = descriptor.requiredBuyerUaid.trim();
  if (!requiredBuyerUaid) {
    throw new Error('uaid-ownership.requiredBuyerUaid is required');
  }

  const parsed = parseHcs14Did(requiredBuyerUaid);
  const registry = parsed.params.registry?.trim().toLowerCase() ?? '';
  const protocol = parsed.params.proto?.trim().toLowerCase() ?? '';
  if (registry !== 'erc-8004' || (protocol !== '' && protocol !== 'erc-8004')) {
    throw new Error('uaid-ownership.requiredBuyerUaid must target an erc-8004 identity');
  }

  const nativeId = parsed.params.nativeId?.trim() ?? parsed.params.uid?.trim() ?? '';
  const [nativeChainIdRaw, nativeAgentIdRaw] = nativeId.split(':');
  const nativeChainId = Number.parseInt(nativeChainIdRaw ?? '', 10);
  const parsedAgentId = Number.parseInt(nativeAgentIdRaw ?? '', 10);
  if (!Number.isFinite(nativeChainId) || nativeChainId !== target.chainId) {
    throw new Error('uaid-ownership.requiredBuyerUaid must target the active programmable secrets chain');
  }

  const agentId =
    normalizeOptionalPositiveInteger(descriptor.agentId, 'uaid-ownership.agentId') ??
    parsedAgentId;
  if (!Number.isFinite(agentId) || agentId <= 0) {
    throw new Error('uaid-ownership.agentId must resolve to a positive integer');
  }

  const identityRegistryAddress = normalizeAddress(
    descriptor.identityRegistryAddress ?? target.agentIdentityRegistryAddress ?? '',
    'uaid-ownership.identityRegistryAddress',
  );

  return encodeAbiParameters(
    parseAbiParameters('bytes32 requiredBuyerUaidHash, address identityRegistry, uint256 agentId'),
    [
      keccak256(toBytes(requiredBuyerUaid)),
      identityRegistryAddress as `0x${string}`,
      BigInt(agentId),
    ],
  );
}

function resolveAllowlistConfigData(
  descriptor: Extract<ProgrammableSecretsConditionDescriptor, { kind: 'evm-allowlist' }>,
): Hex {
  if (!Array.isArray(descriptor.allowlistedBuyerAddresses)) {
    throw new Error('evm-allowlist.allowlistedBuyerAddresses must be an array');
  }

  const allowlistedBuyerAddresses = descriptor.allowlistedBuyerAddresses.map((value, index) =>
    normalizeAddress(value, `evm-allowlist.allowlistedBuyerAddresses[${index}]`),
  );
  if (allowlistedBuyerAddresses.length === 0) {
    throw new Error('evm-allowlist.allowlistedBuyerAddresses must not be empty');
  }

  return encodeAbiParameters(
    parseAbiParameters('address[] allowlistedAccounts'),
    [allowlistedBuyerAddresses as readonly `0x${string}`[]],
  );
}

function normalizeWitness(value: unknown): ProgrammableSecretsConditionWitness {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return { kind: 'none' } satisfies ProgrammableSecretsConditionWitness;
  }

  if (value.kind === 'none') {
    return { kind: 'none' } satisfies ProgrammableSecretsConditionWitness;
  }
  if (value.kind === 'buyer-uaid') {
    return {
      kind: 'buyer-uaid',
      label: typeof value.label === 'string' ? value.label : undefined,
    };
  }
  if (value.kind === 'utf8' && typeof value.label === 'string') {
    return {
      kind: 'utf8',
      label: value.label,
      placeholder: typeof value.placeholder === 'string' ? value.placeholder : undefined,
    };
  }
  if (value.kind === 'hex' && typeof value.label === 'string') {
    return {
      kind: 'hex',
      label: value.label,
      placeholder: typeof value.placeholder === 'string' ? value.placeholder : undefined,
    };
  }

  throw new Error('custom-static.runtimeWitness is invalid');
}

function parseConditionDescriptor(value: unknown): ProgrammableSecretsConditionDescriptor {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new Error('purchaseRequirements.conditions entries must be objects');
  }

  if (value.kind === 'time-range') {
    return {
      kind: 'time-range',
      evaluatorAddress:
        typeof value.evaluatorAddress === 'string' ? value.evaluatorAddress : undefined,
      notBeforeUnix: normalizeOptionalPositiveInteger(value.notBeforeUnix, 'time-range.notBeforeUnix'),
      notAfterUnix: normalizeOptionalPositiveInteger(value.notAfterUnix, 'time-range.notAfterUnix'),
    };
  }

  if (value.kind === 'uaid-ownership') {
    if (typeof value.requiredBuyerUaid !== 'string') {
      throw new Error('uaid-ownership.requiredBuyerUaid is required');
    }
    return {
      kind: 'uaid-ownership',
      requiredBuyerUaid: value.requiredBuyerUaid,
      evaluatorAddress:
        typeof value.evaluatorAddress === 'string' ? value.evaluatorAddress : undefined,
      identityRegistryAddress:
        typeof value.identityRegistryAddress === 'string'
          ? value.identityRegistryAddress
          : undefined,
      agentId: normalizeOptionalPositiveInteger(value.agentId, 'uaid-ownership.agentId'),
    };
  }

  if (value.kind === 'evm-allowlist') {
    if (!Array.isArray(value.allowlistedBuyerAddresses)) {
      throw new Error('evm-allowlist.allowlistedBuyerAddresses is required');
    }
    return {
      kind: 'evm-allowlist',
      allowlistedBuyerAddresses: value.allowlistedBuyerAddresses.map((entry) => {
        if (typeof entry !== 'string') {
          throw new Error('evm-allowlist.allowlistedBuyerAddresses must contain strings');
        }
        return entry;
      }),
      evaluatorAddress:
        typeof value.evaluatorAddress === 'string' ? value.evaluatorAddress : undefined,
    };
  }

  if (value.kind === 'custom-static') {
    if (typeof value.evaluatorAddress !== 'string') {
      throw new Error('custom-static.evaluatorAddress is required');
    }
    if (typeof value.configDataHex !== 'string') {
      throw new Error('custom-static.configDataHex is required');
    }
    return {
      kind: 'custom-static',
      evaluatorAddress: value.evaluatorAddress,
      configDataHex: value.configDataHex,
      runtimeWitness: normalizeWitness(value.runtimeWitness),
      label: typeof value.label === 'string' ? value.label : undefined,
      description: typeof value.description === 'string' ? value.description : undefined,
    };
  }

  throw new Error(`Unsupported programmable secret condition kind: ${value.kind}`);
}

export function parseMetadataPurchaseRequirements(
  metadata: ProgrammableSecretCanonicalMetadata,
): { conditions: ProgrammableSecretsConditionDescriptor[] } {
  if (!isRecord(metadata.purchaseRequirements)) {
    return { conditions: [] };
  }

  const conditions = metadata.purchaseRequirements.conditions;
  if (conditions === undefined) {
    return { conditions: [] };
  }
  if (!Array.isArray(conditions)) {
    throw new Error('purchaseRequirements.conditions must be an array');
  }

  return {
    conditions: conditions.map((entry) => parseConditionDescriptor(entry)),
  };
}

export function buildPreparedConditions(params: {
  metadata: ProgrammableSecretCanonicalMetadata;
  target: ProgrammableSecretsChainTarget;
}): ConditionPreparationResult {
  const descriptors = parseMetadataPurchaseRequirements(params.metadata).conditions;
  const conditions = descriptors.map((descriptor) => {
    const evaluatorAddress = resolveConfiguredEvaluatorAddress(descriptor, params.target);
    const configDataHex =
      descriptor.kind === 'time-range'
        ? resolveTimeRangeConfigData(descriptor)
        : descriptor.kind === 'uaid-ownership'
          ? resolveUaidOwnershipConfigData(descriptor, params.target)
          : descriptor.kind === 'evm-allowlist'
            ? resolveAllowlistConfigData(descriptor)
            : normalizeHex(descriptor.configDataHex, 'custom-static.configDataHex');
    const runtimeWitness =
      descriptor.kind === 'uaid-ownership'
        ? ({ kind: 'buyer-uaid', label: 'Buyer UAID' } satisfies ProgrammableSecretsConditionWitness)
        : descriptor.kind === 'custom-static'
          ? (descriptor.runtimeWitness ??
              ({ kind: 'none' } satisfies ProgrammableSecretsConditionWitness))
          : ({ kind: 'none' } satisfies ProgrammableSecretsConditionWitness);

    return {
      evaluatorAddress,
      configDataHex,
      configHash: keccak256(configDataHex),
      runtimeWitness,
      descriptor,
    } satisfies PreparedProgrammableSecretsCondition;
  });

  const timeRangeCondition = descriptors.find(
    (descriptor): descriptor is Extract<ProgrammableSecretsConditionDescriptor, { kind: 'time-range' }> =>
      descriptor.kind === 'time-range',
  );

  return {
    conditions,
    expiresAtUnix: timeRangeCondition?.notAfterUnix ?? null,
    allowlistEnabled: descriptors.some((descriptor) => descriptor.kind === 'evm-allowlist'),
  };
}

export function computeConditionsHash(
  conditions: Pick<PreparedProgrammableSecretsCondition, 'evaluatorAddress' | 'configHash'>[],
): string {
  const entryHashes = conditions.map((condition) =>
    keccak256(
      encodeAbiParameters(
        parseAbiParameters('address evaluator, bytes32 configHash'),
        [condition.evaluatorAddress as `0x${string}`, condition.configHash as Hex],
      ),
    ),
  );

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32[] conditionEntryHashes'),
      [entryHashes as Hex[]],
    ),
  );
}
