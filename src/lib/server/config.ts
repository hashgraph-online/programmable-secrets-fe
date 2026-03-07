/**
 * Server-side config for programmable secrets.
 * Reads from environment variables at startup.
 */

export const PS_CONFIG = {
  chainId: 46630,
  network: 'testnet' as const,
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
  policyVaultAddress: '0xBd4E7A50e6c61Eb7dAA6c7485df88054E5b4796D' as `0x${string}`,
  paymentModuleAddress: '0x24c6212B2673b85B71CFB3A7a767Ff691ea7D7A2' as `0x${string}`,
  accessReceiptAddress: '0x849575C669e9fA3944880c77E8c77b5c1dE58c8D' as `0x${string}`,
  get krsMasterKey(): string {
    return process.env.KRS_MASTER_KEY || 'REDACTED_KRS_MASTER_KEY=';
  },
  ciphertextDir: 'data/programmable-secrets',
};
