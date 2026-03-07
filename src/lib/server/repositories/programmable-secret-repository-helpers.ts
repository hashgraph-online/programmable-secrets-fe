export const normalizeProgrammableSecretsNetwork = (
  network: string,
): 'mainnet' | 'testnet' => {
  const normalized = network.trim().toLowerCase();
  return normalized === 'mainnet' ? 'mainnet' : 'testnet';
};

export const normalizeAddress = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
};

export const normalizeRequiredString = (
  value: string,
  label: string,
): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
};

export const normalizePositiveInteger = (
  value: number,
  label: string,
): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
};

export const normalizeOptionalDate = (value?: Date | null): Date | null =>
  value ?? null;

export const resolveListLimit = (
  value: number | undefined,
  fallback: number,
  max: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.trunc(value), max);
};
