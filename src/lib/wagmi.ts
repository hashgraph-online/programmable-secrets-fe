'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { robinhoodTestnet } from '@/lib/contracts/chain';

const DEFAULT_WALLETCONNECT_PROJECT_ID = '55632c02cb971468424ae93c89366117';

function resolveWalletConnectProjectId(): string {
  const configured =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
    process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  if (!configured) {
    return DEFAULT_WALLETCONNECT_PROJECT_ID;
  }
  const trimmed = configured.trim();
  if (trimmed.length === 32) {
    return trimmed;
  }
  return DEFAULT_WALLETCONNECT_PROJECT_ID;
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Programmable Secrets',
  projectId: resolveWalletConnectProjectId(),
  chains: [robinhoodTestnet],
  ssr: false,
});
