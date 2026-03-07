/**
 * Server-side config for programmable secrets.
 * Reads from environment variables at startup.
 */

const DEFAULT_KRS_MASTER_KEY = 'MISSING_KRS_MASTER_KEY=';

export const PS_CONFIG = {
  chainId: 46630,
  network: 'testnet' as const,
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
  policyVaultAddress: '0x54c40c2863dB7eE2563C65CF83F5cc295e73bd6c' as `0x${string}`,
  paymentModuleAddress: '0xbff7f7671044Ae1C965C9D7d9050cBa3Da72356c' as `0x${string}`,
  accessReceiptAddress: '0x902c70193Fc36Ad1d115DcB0310C3F49fC4F5e7a' as `0x${string}`,
  get krsMasterKey(): string {
    return process.env.KRS_MASTER_KEY || DEFAULT_KRS_MASTER_KEY;
  },
  ciphertextDir: 'data/programmable-secrets',
};
