import type { Metadata } from 'next';
import { Roboto, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { ClientProviders } from '@/components/client-providers';
import Footer from '@/components/footer';

const roboto = Roboto({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Programmable Secrets — Hashgraph Online',
  description:
    'Encrypted data access for autonomous agents. Securely buy, unlock, and decrypt datasets with on-chain policy enforcement. Built by Hashgraph Online.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-roboto), 'Roboto', system-ui, sans-serif",
          background: '#ffffff',
          color: '#3f4174',
        }}
      >
        <ClientProviders>
          {children}
          <Footer />
        </ClientProviders>
      </body>
    </html>
  );
}
