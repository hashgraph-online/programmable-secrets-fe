'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { broker } from '@/lib/api/broker';
import { PolicyCard } from '@/components/policy-card';

export function DashboardClient() {
  const { address } = useAccount();

  const healthQuery = useQuery({
    queryKey: ['ps-health'],
    queryFn: () => broker.health(),
    retry: 1,
  });

  const policiesQuery = useQuery({
    queryKey: ['ps-policies'],
    queryFn: () => broker.listPolicies(50),
    retry: 1,
  });

  const policies = policiesQuery.data?.policies ?? [];
  const activePolicies = policies.filter((p) => p.active);
  const brokerOnline = healthQuery.isSuccess;

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-12 pb-16">
        {/* Subtle ambient glow — HOL brand blue */}
        <div
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full blur-[200px] opacity-[0.06]"
          style={{ background: 'var(--brand-blue)' }}
        />

        <div className="relative mx-auto max-w-7xl px-6 stagger">
          {/* Status line */}
          <div className="mb-8 flex items-center gap-3">
            <span className="tag-green">
              <span
                className="h-1.5 w-1.5 rounded-full pulse-dot"
                style={{ background: 'var(--brand-green)' }}
              />
              Live on Robinhood Chain
            </span>
            {brokerOnline && (
              <span className="tag-subtle">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-green)' }} />
                Broker Online
              </span>
            )}
          </div>

          {/* Headline */}
          <h1
            className="mb-6 tracking-tight"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', lineHeight: 1.05 }}
          >
            Encrypted Data Access
            <br />
            <span className="text-gradient-brand">for Autonomous Agents</span>
          </h1>

          <p
            className="mb-10 max-w-xl leading-relaxed"
            style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}
          >
            Agents buy encrypted datasets, validate on-chain receipts, and decrypt client-side — all without trusting a third party. Policy-enforced access built on Hashgraph Online.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-16">
            <Link href="/provider" className="btn-primary no-underline">
              Publish a Dataset
            </Link>
            <a href="#marketplace" className="btn-outline no-underline">
              Browse Marketplace
            </a>
          </div>

          {/* ── Flow Diagram ── */}
          <div
            className="surface-card-static p-8 sm:p-10"
            style={{ background: 'var(--surface-1)' }}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-sm tracking-wide uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                How It Works
              </h2>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>3 Steps • End-to-End Encrypted</span>
            </div>

            <div className="grid gap-0 sm:grid-cols-3">
              {[
                {
                  num: '01',
                  title: 'Encrypt & List',
                  desc: 'Data providers encrypt locally with AES-256-GCM and commit a policy on-chain. Plaintext never leaves the device.',
                  accent: 'var(--brand-blue)',
                },
                {
                  num: '02',
                  title: 'Purchase & Mint',
                  desc: 'Buyers pay on-chain and receive an ERC-721 access receipt. Payment goes directly to the provider.',
                  accent: 'var(--brand-purple)',
                },
                {
                  num: '03',
                  title: 'Verify & Decrypt',
                  desc: 'The Key Release Service validates the receipt, wraps the AES key with buyer\'s RSA public key, and decryption happens 100% client-side.',
                  accent: 'var(--brand-green)',
                },
              ].map((step, i) => (
                <div
                  key={step.num}
                  className="relative py-6 sm:px-6 first:sm:pl-0 last:sm:pr-0"
                  style={{
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    ...(typeof window !== 'undefined' && window.innerWidth >= 640
                      ? { borderTop: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }
                      : {}),
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="text-xs font-semibold tracking-wider"
                      style={{ color: step.accent, fontFamily: 'var(--font-mono)' }}
                    >
                      {step.num}
                    </span>
                    <div className="h-px flex-1" style={{ background: `linear-gradient(to right, ${step.accent}33, transparent)` }} />
                  </div>
                  <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Marketplace ── */}
      <section
        id="marketplace"
        className="scroll-mt-20 pb-20"
        style={{ background: 'var(--surface-0)' }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Available Datasets</h2>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {policiesQuery.isLoading
                  ? 'Loading…'
                  : `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} listed • ${activePolicies.length} active`}
              </p>
            </div>
            <Link href="/provider" className="btn-outline no-underline text-sm" style={{ padding: '8px 16px' }}>
              + Publish
            </Link>
          </div>

          {policies.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
              {policies.map((policy) => (
                <PolicyCard key={policy.id} policy={policy} />
              ))}
            </div>
          ) : !policiesQuery.isLoading ? (
            <div
              className="flex flex-col items-center justify-center rounded-2xl py-20"
              style={{
                border: '1px dashed var(--border)',
                background: 'var(--surface-1)',
              }}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-xl"
                style={{ background: 'var(--surface-3)' }}
              >
                🔒
              </div>
              <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                No policies yet
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Be the first to{' '}
                <Link href="/provider" style={{ color: 'var(--brand-blue)' }} className="hover:underline">
                  publish a dataset
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="surface-card-static p-6 space-y-4">
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton h-3 w-48" />
                  <div className="skeleton h-3 w-24" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)' }}>
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Programmable Secrets — Built by{' '}
            <a href="https://hol.org" target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--brand-blue)' }}>
              Hashgraph Online
            </a>
          </p>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>Robinhood Chain Testnet</span>
            <span>•</span>
            <a
              href="https://docs.hol.org"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
              style={{ color: 'var(--brand-blue)' }}
            >
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
