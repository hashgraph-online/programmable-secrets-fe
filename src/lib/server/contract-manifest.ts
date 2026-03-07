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
    contractAddress: '0xe39ae07f6226156d97c76b4ec6ac8697890dd350',
    paymentModuleAddress: '0xe39ae07f6226156d97c76b4ec6ac8697890dd350',
    policyVaultAddress: '0x76160a8f1bfed994749318bee9611a51bcda80e8',
    accessReceiptAddress: '0x2032c2572838b4b746072e8e542bdee324bea0c8',
    agentIdentityRegistryAddress: '0x8004a818bfb912233c491871b3d84c89a494bd9e',
    timeRangeConditionAddress: '0xaa0853c3ef91e0af6231e6a4018fbfcae47e9edc',
    uaidOwnershipConditionAddress: '0x5a98b402827988046844109d996fde90462107be',
    addressAllowlistConditionAddress: '0x3d53d161f6271e454f60b22978d3b625080f2595',
  },
  46630: {
    chainId: 46630,
    network: 'testnet',
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
    contractAddress: '0xbff7f7671044ae1c965c9d7d9050cba3da72356c',
    paymentModuleAddress: '0xbff7f7671044ae1c965c9d7d9050cba3da72356c',
    policyVaultAddress: '0x54c40c2863db7ee2563c65cf83f5cc295e73bd6c',
    accessReceiptAddress: '0x902c70193fc36ad1d115dcb0310c3f49fc4f5e7a',
    agentIdentityRegistryAddress: null,
    timeRangeConditionAddress: '0x7f17cb0ec2e8981a6489ec1281c55474e575a66d',
    uaidOwnershipConditionAddress: '0x338f2a134574bf68f9c479344f679c13aed8f92e',
    addressAllowlistConditionAddress: '0x4a458b97f45d7c6d308f350089156386237578b9',
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
