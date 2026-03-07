'use client';

import dynamic from 'next/dynamic';

const ProviderClient = dynamic(
  () => import('@/components/provider-client').then((m) => m.ProviderClient),
  { ssr: false },
);

export default function ProviderPage() {
  return <ProviderClient />;
}
