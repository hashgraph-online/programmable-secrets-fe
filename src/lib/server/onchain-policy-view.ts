import { decodeAbiParameters, parseAbiParameters, type Hex } from 'viem';
import type {
  ProgrammableSecretsOnchainCondition,
  ProgrammableSecretsOnchainPolicy,
} from './chain-client';
import type { ProgrammableSecretsChainTarget } from './contract-manifest';
import type {
  ProgrammableSecretsConditionDescriptor,
  ProgrammableSecretsConditionWitness,
} from './policy-conditions';
import type {
  ProgrammableSecretsPolicyConditionView,
  ProgrammableSecretsPolicyView,
} from './types';

const NONE_WITNESS: ProgrammableSecretsConditionWitness = { kind: 'none' };

function sameAddress(left?: string | null, right?: string | null): boolean {
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}

function decodeTimeRangeDescriptor(
  condition: ProgrammableSecretsOnchainCondition,
): ProgrammableSecretsConditionDescriptor | null {
  try {
    const [notBefore, notAfter] = decodeAbiParameters(
      parseAbiParameters('uint64 notBefore, uint64 notAfter'),
      condition.configDataHex as Hex,
    );
    return {
      kind: 'time-range',
      evaluatorAddress: condition.evaluatorAddress,
      notBeforeUnix: Number(notBefore),
      notAfterUnix: Number(notAfter),
    };
  } catch {
    return null;
  }
}

function decodeAllowlistDescriptor(
  condition: ProgrammableSecretsOnchainCondition,
): ProgrammableSecretsConditionDescriptor | null {
  try {
    const [allowlistedBuyerAddresses] = decodeAbiParameters(
      parseAbiParameters('address[] allowlistedAccounts'),
      condition.configDataHex as Hex,
    );
    return {
      kind: 'evm-allowlist',
      evaluatorAddress: condition.evaluatorAddress,
      allowlistedBuyerAddresses: [...allowlistedBuyerAddresses].map((value) =>
        value.toLowerCase(),
      ),
    };
  } catch {
    return null;
  }
}

function buildUaidDescriptor(
  condition: ProgrammableSecretsOnchainCondition,
): ProgrammableSecretsConditionDescriptor {
  try {
    const [, identityRegistry, agentId] = decodeAbiParameters(
      parseAbiParameters(
        'bytes32 requiredBuyerUaidHash, address identityRegistry, uint256 agentId',
      ),
      condition.configDataHex as Hex,
    );

    return {
      kind: 'custom-static',
      evaluatorAddress: condition.evaluatorAddress,
      configDataHex: condition.configDataHex,
      runtimeWitness: { kind: 'buyer-uaid', label: 'Buyer UAID' },
      label: 'UAID ownership gate',
      description: `Buyer must present a matching UAID for agent ${agentId.toString()} via ${identityRegistry.toLowerCase()}.`,
    };
  } catch {
    return {
      kind: 'custom-static',
      evaluatorAddress: condition.evaluatorAddress,
      configDataHex: condition.configDataHex,
      runtimeWitness: { kind: 'buyer-uaid', label: 'Buyer UAID' },
      label: 'UAID ownership gate',
      description: 'Buyer must present a matching UAID at purchase time.',
    };
  }
}

function buildConditionView(
  condition: ProgrammableSecretsOnchainCondition,
  index: number,
  target: ProgrammableSecretsChainTarget,
): ProgrammableSecretsPolicyConditionView {
  let descriptor: ProgrammableSecretsConditionDescriptor | null = null;
  let runtimeWitness: ProgrammableSecretsConditionWitness = NONE_WITNESS;

  if (sameAddress(condition.evaluatorAddress, target.timeRangeConditionAddress)) {
    descriptor = decodeTimeRangeDescriptor(condition);
  } else if (
    sameAddress(condition.evaluatorAddress, target.addressAllowlistConditionAddress)
  ) {
    descriptor = decodeAllowlistDescriptor(condition);
  } else if (
    sameAddress(condition.evaluatorAddress, target.uaidOwnershipConditionAddress)
  ) {
    descriptor = buildUaidDescriptor(condition);
    runtimeWitness = { kind: 'buyer-uaid', label: 'Buyer UAID' };
  }

  if (descriptor?.kind === 'custom-static' && descriptor.runtimeWitness) {
    runtimeWitness = descriptor.runtimeWitness;
  }

  return {
    index,
    evaluatorAddress: condition.evaluatorAddress,
    configHash: condition.configHash,
    configDataHex: condition.configDataHex,
    descriptor,
    runtimeWitness,
  };
}

export function buildOnchainPolicyView(params: {
  policyId: number;
  policy: ProgrammableSecretsOnchainPolicy;
  target: ProgrammableSecretsChainTarget;
}): ProgrammableSecretsPolicyView {
  const createdAt = new Date(params.policy.createdAtUnix * 1000).toISOString();
  const conditions = params.policy.conditions.map((condition, index) =>
    buildConditionView(condition, index, params.target),
  );
  const timeRangeDescriptor = conditions.find(
    (condition) => condition.descriptor?.kind === 'time-range',
  )?.descriptor;
  const expiresAtUnix =
    timeRangeDescriptor?.kind === 'time-range'
      ? (timeRangeDescriptor.notAfterUnix ?? null)
      : null;

  return {
    id: `onchain-${params.target.chainId}-${params.policyId}`,
    network: params.target.network,
    chainId: params.target.chainId,
    contractAddress: params.target.contractAddress,
    paymentModuleAddress: params.target.paymentModuleAddress,
    policyVaultAddress: params.target.policyVaultAddress,
    accessReceiptAddress: params.target.accessReceiptAddress,
    policyId: params.policyId,
    datasetId: params.policy.datasetId,
    conditionsHash: params.policy.conditionsHash,
    conditionCount: params.policy.conditionCount,
    conditions,
    declaredConditions: conditions.flatMap((condition) =>
      condition.descriptor ? [condition.descriptor] : [],
    ),
    status: 'indexed',
    providerAddress: params.policy.provider,
    payoutAddress: params.policy.payout,
    paymentToken: params.policy.paymentToken,
    priceWei: params.policy.priceWei,
    expiresAt:
      expiresAtUnix && expiresAtUnix > 0
        ? new Date(expiresAtUnix * 1000).toISOString()
        : null,
    expiresAtUnix,
    active: params.policy.active,
    allowlistEnabled: params.policy.allowlistEnabled,
    receiptTransferable: params.policy.receiptTransferable,
    ciphertextHash: params.policy.ciphertextHash,
    keyCommitment: params.policy.keyCommitment,
    metadataHash: params.policy.metadataHash,
    providerUaid: null,
    providerUaidHash: params.policy.providerUaidHash,
    metadataJson: null,
    keyReleaseReady: false,
    createdTxHash: null,
    createdBlockNumber: null,
    policyCreatedAt: createdAt,
    confirmedAt: createdAt,
    indexedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}
