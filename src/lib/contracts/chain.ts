import { defineChain } from 'viem';

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] },
  },
  blockExplorers: {
    default: {
      name: 'Explorer',
      url: 'https://explorer.testnet.chain.robinhood.com',
    },
  },
  testnet: true,
});

export const arbitrumSepolia = defineChain({
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
  },
  blockExplorers: {
    default: {
      name: 'Arbiscan',
      url: 'https://sepolia.arbiscan.io',
    },
  },
  testnet: true,
});

function resolveExplorerBaseUrl(chainId?: number | null): string {
  if (chainId === arbitrumSepolia.id) {
    return arbitrumSepolia.blockExplorers.default.url;
  }
  return robinhoodTestnet.blockExplorers.default.url;
}

export function resolveProgrammableSecretsChain(chainId?: number | null) {
  if (chainId === arbitrumSepolia.id) {
    return arbitrumSepolia;
  }
  return robinhoodTestnet;
}

export function buildTxUrl(
  hash: string | null | undefined,
  chainId?: number | null,
): string | null {
  if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  return `${resolveExplorerBaseUrl(chainId)}/tx/${hash}`;
}

export function buildAddressUrl(
  address: string | null | undefined,
  chainId?: number | null,
): string | null {
  if (!address) return null;
  return `${resolveExplorerBaseUrl(chainId)}/address/${address}`;
}
