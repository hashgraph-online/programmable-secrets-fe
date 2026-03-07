/**
 * Extensible registry of supported networks.
 *
 * Add a new entry here to support a new chain throughout the UI —
 * every component that renders network info reads from this map.
 */

export interface NetworkMeta {
  /** Human-readable network name */
  name: string;
  /** Short label for tags/badges */
  shortName: string;
  /** Whether this is a testnet */
  testnet: boolean;
  /** Brand / accent color for badges */
  color: string;
  /** Native currency symbol */
  currencySymbol: string;
  /** Block explorer base URL (no trailing slash) */
  explorerUrl: string;
  /** Optional icon path (relative to /public) */
  iconPath?: string;
}

/**
 * Canonical map of chain ID → network metadata.
 * Extend this object to add support for new networks.
 */
export const NETWORK_REGISTRY: Record<number, NetworkMeta> = {
  // ── Robinhood ──
  46630: {
    name: 'Robinhood Chain Testnet',
    shortName: 'Robinhood',
    testnet: true,
    color: '#48df7b',
    currencySymbol: 'ETH',
    explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
  },

  // ── Arbitrum ──
  421614: {
    name: 'Arbitrum Sepolia',
    shortName: 'Arbitrum',
    testnet: true,
    color: '#4facfe',
    currencySymbol: 'ETH',
    explorerUrl: 'https://sepolia.arbiscan.io',
  },
};

/** Fallback for unknown chain IDs */
const UNKNOWN_NETWORK: NetworkMeta = {
  name: 'Unknown Network',
  shortName: 'Unknown',
  testnet: false,
  color: 'var(--text-tertiary)',
  currencySymbol: 'ETH',
  explorerUrl: '',
};

/**
 * Look up network metadata by chain ID.
 * Returns a sensible fallback for unregistered chains.
 */
export function getNetworkMeta(chainId: number | undefined | null): NetworkMeta {
  if (chainId == null) return UNKNOWN_NETWORK;
  return NETWORK_REGISTRY[chainId] ?? {
    ...UNKNOWN_NETWORK,
    name: `Chain ${chainId}`,
    shortName: `#${chainId}`,
  };
}
