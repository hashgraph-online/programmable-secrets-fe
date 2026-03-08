/**
 * Server-side config for programmable secrets.
 * Reads from environment variables at startup.
 */

const DEFAULT_KRS_MASTER_KEY = 'MISSING_KRS_MASTER_KEY=';

export const PS_CONFIG = {
  chainId: 46630,
  network: 'testnet' as const,
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
  policyVaultAddress: '0x073fc3fE9B2c00E470199550870D458D13421614' as `0x${string}`,
  paymentModuleAddress: '0x5b4a056d2203C5940257635F073A253B958ba43c' as `0x${string}`,
  accessReceiptAddress: '0x4Aa65779ce3dF24E5EeC7a786721765dF50a106b' as `0x${string}`,
  get krsMasterKey(): string {
    return process.env.KRS_MASTER_KEY || DEFAULT_KRS_MASTER_KEY;
  },
  ciphertextDir: 'data/programmable-secrets',
};
