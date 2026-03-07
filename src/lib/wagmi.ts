'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { robinhoodTestnet } from '@/lib/contracts/chain';

export const wagmiConfig = getDefaultConfig({
  appName: 'Programmable Secrets',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  chains: [robinhoodTestnet],
  ssr: false,
});
