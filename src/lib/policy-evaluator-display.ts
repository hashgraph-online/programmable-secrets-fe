import type {
  ProgrammableSecretsConditionDescriptor,
  ProgrammableSecretsConditionWitness,
} from '@/lib/server/policy-conditions';

export interface PolicyConditionViewModel {
  index: number;
  evaluatorAddress: string;
  descriptor: ProgrammableSecretsConditionDescriptor | null;
  runtimeWitness: ProgrammableSecretsConditionWitness;
}

function shortValue(value: string, maxLength = 22): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function formatUnix(unix: number | null | undefined): string {
  if (!unix || unix <= 0) return 'unset';
  return new Date(unix * 1000).toLocaleString();
}

export function formatWitnessLabel(witness: ProgrammableSecretsConditionWitness): string {
  if (witness.kind === 'buyer-uaid') return witness.label ?? 'Buyer UAID string';
  if (witness.kind === 'utf8') return witness.label;
  if (witness.kind === 'hex') return witness.label;
  return 'None';
}

export function describeConditionKind(condition: PolicyConditionViewModel): string {
  if (!condition.descriptor) return 'Custom evaluator';
  if (condition.descriptor.kind === 'time-range') return 'Time window';
  if (condition.descriptor.kind === 'uaid-ownership') return 'UAID ownership gate';
  if (condition.descriptor.kind === 'evm-allowlist') return 'Wallet allowlist';
  return condition.descriptor.label ?? 'Custom evaluator';
}

export function describeConditionSummary(condition: PolicyConditionViewModel): string {
  if (!condition.descriptor) {
    return `Evaluator ${shortValue(condition.evaluatorAddress)} with custom config`;
  }

  if (condition.descriptor.kind === 'time-range') {
    const from = formatUnix(condition.descriptor.notBeforeUnix ?? null);
    const to = formatUnix(condition.descriptor.notAfterUnix ?? null);
    return `Purchases allowed from ${from} until ${to}`;
  }

  if (condition.descriptor.kind === 'uaid-ownership') {
    const uaid = shortValue(condition.descriptor.requiredBuyerUaid, 36);
    const agentId =
      condition.descriptor.agentId && condition.descriptor.agentId > 0
        ? condition.descriptor.agentId
        : 'from UAID';
    return `Buyer must own agent ${agentId} and present UAID ${uaid}`;
  }

  if (condition.descriptor.kind === 'evm-allowlist') {
    return `${condition.descriptor.allowlistedBuyerAddresses.length} wallet(s) allowlisted`;
  }

  return (
    condition.descriptor.description ??
    `Custom static config ${shortValue(condition.descriptor.configDataHex, 30)}`
  );
}

export function hasUaidGate(conditions: PolicyConditionViewModel[]): boolean {
  return conditions.some((condition) => condition.descriptor?.kind === 'uaid-ownership');
}

export function hasRuntimeWitness(conditions: PolicyConditionViewModel[]): boolean {
  return conditions.some((condition) => condition.runtimeWitness.kind !== 'none');
}

export function uniqueEvaluatorCount(conditions: PolicyConditionViewModel[]): number {
  return new Set(
    conditions.map((condition) => condition.evaluatorAddress.toLowerCase()),
  ).size;
}
