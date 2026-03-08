import { createUaid, toEip155Caip10 } from '@hashgraphonline/standards-sdk';
import { getAddress } from 'viem';

const DEFAULT_CHAIN_ID = 46630;

export function deriveWalletUaid(
  address: string,
  chainId: number = DEFAULT_CHAIN_ID,
): string {
  const normalizedAddress = getAddress(address);
  const nativeId = toEip155Caip10(chainId, normalizedAddress);
  const walletDid = `did:pkh:${nativeId}`;

  return createUaid(walletDid, { nativeId });
}
