'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const ProvidersInner = dynamic(
  () => import('@/components/providers').then((m) => m.Providers),
  { ssr: false },
);

const NavbarInner = dynamic(
  () => import('@/components/navbar').then((m) => m.Navbar),
  { ssr: false },
);

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ProvidersInner>
      <NavbarInner />
      <main className="pt-16">{children}</main>
    </ProvidersInner>
  );
}
