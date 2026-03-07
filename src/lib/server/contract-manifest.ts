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
    contractAddress: '0xe3997689e04dfde9bf83b6cfa7fdb68099c43b9d',
    paymentModuleAddress: '0xe3997689e04dfde9bf83b6cfa7fdb68099c43b9d',
    policyVaultAddress: '0xedf7fd3b2d0fd00dc2588bbd662bf82584343992',
    accessReceiptAddress: '0xbe3c72a7f2914585ac018a85498449dd8014e451',
    agentIdentityRegistryAddress: '0x8004a818bfb912233c491871b3d84c89a494bd9e',
    timeRangeConditionAddress: '0x0e4c1445915f7b7f6fa8925909cb6c46310330c1',
    uaidOwnershipConditionAddress: '0xa94d5de5fe87cc7d5770c2a9987cc0d0ca4afa9a',
    addressAllowlistConditionAddress: '0xf267f6fb798cc7057819d623a3e7e71ce70db3e2',
  },
  46630: {
    chainId: 46630,
    network: 'testnet',
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
    contractAddress: '0x82637bff0e39f0b65c17bbc69f768602f093a1ee',
    paymentModuleAddress: '0x82637bff0e39f0b65c17bbc69f768602f093a1ee',
    policyVaultAddress: '0x0e65116044c731a1e0380c1e39f439f93fb77416',
    accessReceiptAddress: '0xe39ae07f6226156d97c76b4ec6ac8697890dd350',
    agentIdentityRegistryAddress: null,
    timeRangeConditionAddress: '0x27ac32ddeec8324409e7f0536446615c9869d5c4',
    uaidOwnershipConditionAddress: '0xfb8987521276cd73229aa4a2d9b4469e12b463fe',
    addressAllowlistConditionAddress: '0x00d801d8a84ac17f198e56f535dfd3b69ceee51f',
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
