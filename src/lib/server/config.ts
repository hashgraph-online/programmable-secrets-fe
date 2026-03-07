/**
 * Server-side config for programmable secrets.
 * Reads from environment variables at startup.
 */

const DEFAULT_KRS_MASTER_KEY = 'MISSING_KRS_MASTER_KEY=';

export const PS_CONFIG = {
  chainId: 46630,
  network: 'testnet' as const,
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
  policyVaultAddress: '0x0e65116044C731A1e0380c1E39f439f93fb77416' as `0x${string}`,
  paymentModuleAddress: '0x82637bff0e39f0B65C17BbC69f768602f093a1Ee' as `0x${string}`,
  accessReceiptAddress: '0xE39Ae07F6226156d97C76B4ec6ac8697890Dd350' as `0x${string}`,
  get krsMasterKey(): string {
    return process.env.KRS_MASTER_KEY || DEFAULT_KRS_MASTER_KEY;
  },
  ciphertextDir: 'data/programmable-secrets',
};
