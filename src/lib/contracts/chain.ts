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

export const EXPLORER_BASE_URL =
  'https://explorer.testnet.chain.robinhood.com';

export function buildTxUrl(hash: string | null | undefined): string | null {
  if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

export function buildAddressUrl(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  return `${EXPLORER_BASE_URL}/address/${address}`;
}
