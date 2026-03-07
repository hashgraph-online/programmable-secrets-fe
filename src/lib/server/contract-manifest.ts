import type { ProgrammableSecretsConfig } from './types';

export interface ProgrammableSecretsContractManifest {
  contractAddress: string;
  paymentModuleAddress: string;
  policyVaultAddress: string;
  accessReceiptAddress: string;
  agentIdentityRegistryAddress: string | null;
  timeRangeConditionAddress: string | null;
  uaidOwnershipConditionAddress: string | null;
  addressAllowlistConditionAddress: string | null;
}

export interface ProgrammableSecretsChainTarget
  extends ProgrammableSecretsContractManifest {
  chainId: number;
  network: string;
  rpcUrl: string;
}

const normalizeAddress = (value: string | undefined): string | null => {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
};

export const resolveProgrammableSecretsContractManifest = (
  config: ProgrammableSecretsConfig,
): ProgrammableSecretsContractManifest | null => {
  const paymentModuleAddress = normalizeAddress(config.paymentModuleAddress);
  const policyVaultAddress = normalizeAddress(config.policyVaultAddress);
  const accessReceiptAddress = normalizeAddress(config.accessReceiptAddress);
  const agentIdentityRegistryAddress = normalizeAddress(
    config.agentIdentityRegistryAddress,
  );
  const timeRangeConditionAddress = normalizeAddress(
    config.timeRangeConditionAddress,
  );
  const uaidOwnershipConditionAddress = normalizeAddress(
    config.uaidOwnershipConditionAddress,
  );
  const addressAllowlistConditionAddress = normalizeAddress(
    config.addressAllowlistConditionAddress,
  );

  if (!paymentModuleAddress || !policyVaultAddress || !accessReceiptAddress) {
    return null;
  }

  return {
    contractAddress: paymentModuleAddress,
    paymentModuleAddress,
    policyVaultAddress,
    accessReceiptAddress,
    agentIdentityRegistryAddress,
    timeRangeConditionAddress,
    uaidOwnershipConditionAddress,
    addressAllowlistConditionAddress,
  };
};

const KNOWN_CHAIN_TARGETS: Record<number, ProgrammableSecretsChainTarget> = {
  421614: {
    chainId: 421614,
    network: 'testnet',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    contractAddress: '0x24c6212b2673b85b71cfb3a7a767ff691ea7d7a2',
    paymentModuleAddress: '0x24c6212b2673b85b71cfb3a7a767ff691ea7d7a2',
    policyVaultAddress: '0xbd4e7a50e6c61eb7daa6c7485df88054e5b4796d',
    accessReceiptAddress: '0x849575c669e9fa3944880c77e8c77b5c1de58c8d',
    agentIdentityRegistryAddress: '0x8004a818bfb912233c491871b3d84c89a494bd9e',
    timeRangeConditionAddress: null,
    uaidOwnershipConditionAddress: null,
    addressAllowlistConditionAddress: null,
  },
  46630: {
    chainId: 46630,
    network: 'testnet',
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
    contractAddress: '0x24c6212b2673b85b71cfb3a7a767ff691ea7d7a2',
    paymentModuleAddress: '0x24c6212b2673b85b71cfb3a7a767ff691ea7d7a2',
    policyVaultAddress: '0xbd4e7a50e6c61eb7daa6c7485df88054e5b4796d',
    accessReceiptAddress: '0x849575c669e9fa3944880c77e8c77b5c1de58c8d',
    agentIdentityRegistryAddress: '0xf287c269d17b923ebffd1eb76e6c3075286124ad',
    timeRangeConditionAddress: null,
    uaidOwnershipConditionAddress: null,
    addressAllowlistConditionAddress: null,
  },
};

export const resolveProgrammableSecretsChainTarget = (
  config: ProgrammableSecretsConfig,
  chainId?: number,
): ProgrammableSecretsChainTarget | null => {
  const requestedChainId = chainId ?? config.chainId;

  if (requestedChainId === config.chainId) {
    const configuredManifest = resolveProgrammableSecretsContractManifest(config);
    if (!configuredManifest) {
      return null;
    }

    return {
      chainId: config.chainId,
      network: config.network,
      rpcUrl: config.rpcUrl,
      ...configuredManifest,
    };
  }

  return KNOWN_CHAIN_TARGETS[requestedChainId] ?? null;
};
