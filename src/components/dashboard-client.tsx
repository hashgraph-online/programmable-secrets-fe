'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { broker } from '@/lib/api/broker';
import { PolicyCard } from '@/components/policy-card';
import {
  hasRuntimeWitness,
  type PolicyConditionViewModel,
} from '@/lib/policy-evaluator-display';

/* ── Deployed Contract Addresses ── */
const DEPLOYMENTS = {
  'Arbitrum Sepolia': {
    chainId: 421614,
    explorer: 'https://sepolia.arbiscan.io',
    color: '#4facfe',
    contracts: [
      { name: 'PolicyVault', address: '0x600b2326537f74E7d0fD4A6e59B00FA6E6b63536', proxy: true },
      { name: 'PaymentModule', address: '0x7F17cB0Ec2e8981A6489Ec1281C55474e575a66D', proxy: true },
      { name: 'AccessReceipt', address: '0x157Ec116169815ab15079dC117854fe19f96d51c', proxy: false },
      { name: 'IdentityRegistry', address: '0x8004A818BFB912233c491871b3d84c89A494BD9e', proxy: false },
    ],
  },
  'Robinhood Testnet': {
    chainId: 46630,
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    color: '#48df7b',
    contracts: [
      { name: 'PolicyVault', address: '0x073fc3fE9B2c00E470199550870D458D13421614', proxy: true },
      { name: 'PaymentModule', address: '0x5b4a056d2203C5940257635F073A253B958ba43c', proxy: true },
      { name: 'AccessReceipt', address: '0x4Aa65779ce3dF24E5EeC7a786721765dF50a106b', proxy: false },
    ],
  },
} as const;

/* ── Inline SVG Icons (no emoji) ── */
const Icons = {
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  List: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  Coin: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Receipt: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
    </svg>
  ),
  Key: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
};

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
  const robinhoodPolicies = policies.filter((p) => p.chainId === 46630);
  const arbitrumPolicies = policies.filter((p) => p.chainId === 421614);
  const witnessPolicies = policies.filter((policy) =>
    hasRuntimeWitness((policy.conditions ?? []) as PolicyConditionViewModel[]),
  );
  const brokerOnline = healthQuery.isSuccess;

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>

      {/* ════════════════════════════════════════════
          HERO — Two-column with code block
          ════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-24 lg:py-32">
        {/* ambient glow */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[1000px] rounded-full blur-[250px] opacity-[0.08]"
          style={{ background: 'var(--brand-blue)' }}
        />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-12">
          <div className="grid gap-16 lg:grid-cols-2 items-center">
            {/* Left: Copy */}
            <div className="space-y-8 stagger">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold tracking-wide" style={{ background: 'rgba(72, 223, 123, 0.1)', color: 'var(--brand-green)' }}>
                  <span className="h-2 w-2 rounded-full pulse-dot" style={{ background: 'currentColor' }} />
                  Live on Robinhood &amp; Arbitrum
                </span>
                {brokerOnline && (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                    Broker Online
                  </span>
                )}
              </div>

              <h1 className="font-black tracking-tight" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1.1, color: 'var(--text-primary)' }}>
                Programmable Access Control<br />
                <span className="text-gradient-brand">for Encrypted Data.</span>
              </h1>

              <p className="text-lg lg:text-xl leading-relaxed max-w-xl" style={{ color: 'var(--text-secondary)' }}>
                Publish encrypted datasets, enforce custom policy evaluators on-chain, and deliver decryption keys only to verified buyers.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/provider" className="btn-primary text-lg px-8 py-4 no-underline font-semibold rounded-xl hover:scale-105 transition-transform shadow-xl text-center" style={{ background: 'var(--brand-blue)', color: '#fff' }}>
                  Publish a Dataset
                </Link>
                <a href="#marketplace" className="btn-outline text-lg px-8 py-4 no-underline font-semibold rounded-xl hover:scale-105 transition-transform text-center" style={{ borderColor: 'var(--border-focus)', color: 'var(--text-primary)' }}>
                  Browse Marketplace
                </a>
              </div>
            </div>

            {/* Right: Code Preview */}
            <div className="hidden lg:block">
              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid var(--border)', background: '#1e1e2e' }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                  <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
                  <span className="ml-3 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>purchase-policy.ts</span>
                </div>
                <div className="p-6 font-mono text-sm leading-relaxed">
                  <div><span style={{ color: '#c678dd' }}>const</span> <span style={{ color: '#e5c07b' }}>receipt</span> <span style={{ color: '#abb2bf' }}>=</span> <span style={{ color: '#c678dd' }}>await</span> <span style={{ color: '#61afef' }}>policyVault</span><span style={{ color: '#abb2bf' }}>.</span><span style={{ color: '#61afef' }}>purchasePolicy</span><span style={{ color: '#abb2bf' }}>(</span></div>
                  <div className="pl-4"><span style={{ color: '#e5c07b' }}>policyId</span><span style={{ color: '#abb2bf' }}>,</span></div>
                  <div className="pl-4"><span style={{ color: '#e5c07b' }}>recipient</span><span style={{ color: '#abb2bf' }}>,</span></div>
                  <div className="pl-4"><span style={{ color: '#abb2bf' }}>{'{'}</span> <span style={{ color: '#e06c75' }}>value</span><span style={{ color: '#abb2bf' }}>:</span> <span style={{ color: '#61afef' }}>parseEther</span><span style={{ color: '#abb2bf' }}>(</span><span style={{ color: '#98c379' }}>&quot;0.00001&quot;</span><span style={{ color: '#abb2bf' }}>)</span> <span style={{ color: '#abb2bf' }}>{'}'}</span></div>
                  <div><span style={{ color: '#abb2bf' }}>);</span></div>
                  <div className="h-3" />
                  <div><span style={{ color: '#5c6370' }}>{'// '}Receipt minted → KRS verifies → key delivered</span></div>
                  <div><span style={{ color: '#c678dd' }}>const</span> <span style={{ color: '#e5c07b' }}>key</span> <span style={{ color: '#abb2bf' }}>=</span> <span style={{ color: '#c678dd' }}>await</span> <span style={{ color: '#61afef' }}>krs</span><span style={{ color: '#abb2bf' }}>.</span><span style={{ color: '#61afef' }}>requestDecryptionKey</span><span style={{ color: '#abb2bf' }}>(</span></div>
                  <div className="pl-4"><span style={{ color: '#e5c07b' }}>receipt</span><span style={{ color: '#abb2bf' }}>.</span><span style={{ color: '#e5c07b' }}>tokenId</span></div>
                  <div><span style={{ color: '#abb2bf' }}>);</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          HOW IT WORKS — Architecture Flow (not just cards)
          ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32" style={{ background: 'var(--surface-1)' }}>
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>
              From Encrypted File to <span className="text-gradient-brand">Verified Access</span>
            </h2>
            <p className="text-lg mx-auto max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              A trustless pipeline in three steps.
            </p>
          </div>

          {/* Architecture flow — horizontal with arrows */}
          <div className="hidden md:grid grid-cols-11 gap-3 items-center max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="col-span-3 flex flex-col items-center text-center space-y-4 group">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl transition-transform group-hover:scale-110 group-hover:rotate-3" style={{ background: 'linear-gradient(135deg, var(--brand-blue), #3b82f6)', color: '#fff' }}>
                <Icons.Lock />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}>Step 01</div>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Encrypt &amp; List</h3>
                <p className="text-sm leading-relaxed max-w-[200px] mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  Encrypt with AES-256-GCM. Publish ciphertext and attach evaluator-backed policies.
                </p>
              </div>
            </div>

            {/* Arrow 1 */}
            <div className="col-span-1 flex justify-center">
              <div className="h-0.5 w-full relative" style={{ background: 'var(--border-hover)' }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 rotate-45" style={{ borderColor: 'var(--text-tertiary)' }} />
              </div>
            </div>

            {/* Step 2 — center, bigger */}
            <div className="col-span-3 flex flex-col items-center text-center space-y-4 group">
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center shadow-xl transition-transform group-hover:scale-110" style={{ background: 'linear-gradient(135deg, var(--brand-purple), #9333ea)', color: '#fff' }}>
                <Icons.Receipt />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--brand-purple)', fontFamily: 'var(--font-mono)' }}>Step 02</div>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Purchase &amp; Mint</h3>
                <p className="text-sm leading-relaxed max-w-[200px] mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  On-chain evaluators clear the buyer. Each policy decides whether its ERC-721 receipt is buyer-bound or transferable.
                </p>
              </div>
            </div>

            {/* Arrow 2 */}
            <div className="col-span-1 flex justify-center">
              <div className="h-0.5 w-full relative" style={{ background: 'var(--border-hover)' }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 rotate-45" style={{ borderColor: 'var(--text-tertiary)' }} />
              </div>
            </div>

            {/* Step 3 */}
            <div className="col-span-3 flex flex-col items-center text-center space-y-4 group">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl transition-transform group-hover:scale-110 group-hover:-rotate-3" style={{ background: 'linear-gradient(135deg, var(--brand-green), #16a34a)', color: '#fff' }}>
                <Icons.Key />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--brand-green)', fontFamily: 'var(--font-mono)' }}>Step 03</div>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Verify &amp; Decrypt</h3>
                <p className="text-sm leading-relaxed max-w-[200px] mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  KRS verifies the receipt on-chain and delivers a buyer-bound decryption key.
                </p>
              </div>
            </div>
          </div>

          {/* Mobile: vertical flow */}
          <div className="md:hidden flex flex-col items-center space-y-6">
            {[
              { num: '01', title: 'Encrypt & List', desc: 'Encrypt with AES-256-GCM. Attach evaluator-backed policies.', icon: <Icons.Lock />, gradient: 'linear-gradient(135deg, var(--brand-blue), #3b82f6)' },
              { num: '02', title: 'Purchase & Mint', desc: 'Evaluators clear the buyer. Policy-defined receipt minted.', icon: <Icons.Receipt />, gradient: 'linear-gradient(135deg, var(--brand-purple), #9333ea)' },
              { num: '03', title: 'Verify & Decrypt', desc: 'KRS verifies receipt. Buyer-bound decryption key delivered.', icon: <Icons.Key />, gradient: 'linear-gradient(135deg, var(--brand-green), #16a34a)' },
            ].map((step, i) => (
              <div key={step.num}>
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-xl flex items-center justify-center shadow-lg mb-3" style={{ background: step.gradient, color: '#fff' }}>
                    {step.icon}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>Step {step.num}</div>
                  <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                </div>
                {i < 2 && <div className="h-8 w-0.5 mx-auto mt-4" style={{ background: 'var(--border-hover)' }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          STATS — Inline badges, no box grid
          ════════════════════════════════════════════ */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6 lg:px-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {[
              { label: 'Live Policies', value: policies.length, color: 'var(--brand-blue)' },
              { label: 'Robinhood', value: robinhoodPolicies.length, color: 'var(--brand-green)' },
              { label: 'Arbitrum', value: arbitrumPolicies.length, color: '#4facfe' },
              { label: 'Witness Gated', value: witnessPolicies.length, color: 'var(--brand-purple)' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 rounded-2xl transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              >
                <span className="text-3xl font-black tabular-nums" style={{ color: stat.color }}>{stat.value}</span>
                <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          MARKETPLACE
          ════════════════════════════════════════════ */}
      <section id="marketplace" className="scroll-mt-20 py-24 lg:py-32" style={{ background: 'var(--surface-1)' }}>
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="flex flex-col md:flex-row justify-between items-center mb-16 gap-8">
            <div>
              <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                Available <span className="text-gradient-brand">Datasets</span>
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                {policiesQuery.isLoading
                  ? 'Loading…'
                  : `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} listed · ${activePolicies.length} active`}
              </p>
            </div>
            <Link href="/provider" className="btn-primary text-lg px-8 py-4 no-underline font-semibold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all rounded-xl">
              Publish Dataset
            </Link>
          </div>

          {policies.length > 0 ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 stagger">
              {policies.map((policy) => (
                <PolicyCard key={policy.id} policy={policy} connectedAddress={address} />
              ))}
            </div>
          ) : !policiesQuery.isLoading ? (
            <div
              className="flex flex-col items-center justify-center rounded-3xl py-32 border-2 border-dashed transition-colors"
              style={{ borderColor: 'var(--border-hover)', background: 'var(--surface-0)' }}
            >
              <div className="mb-8 flex h-16 w-32 items-center justify-center rounded-full text-sm font-bold tracking-widest uppercase shadow-inner border border-dashed" style={{ background: 'var(--surface-3)', borderColor: 'var(--border-disabled)', color: 'var(--text-tertiary)' }}>
                No Data
              </div>
              <p className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>No datasets listed yet</p>
              <p className="text-lg mb-8 text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
                Be the first to publish encrypted data to the decentralized marketplace.
              </p>
              <Link href="/provider" className="btn-primary text-lg px-8 py-4 font-semibold rounded-xl">
                Publish a Dataset Now
              </Link>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-3xl p-8 space-y-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
                  <div className="skeleton h-6 w-48 rounded" />
                  <div className="skeleton h-4 w-full rounded" />
                  <div className="skeleton h-4 w-2/3 rounded" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════
          CUSTOM POLICY EVALUATORS — Two-column: code + cards
          ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="grid gap-16 lg:grid-cols-2 items-start">
            {/* Left: Code block showing the interface */}
            <div className="lg:sticky lg:top-24">
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                Custom Policy <span className="text-gradient-brand">Evaluators</span>
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
                Implement the <code className="px-2 py-1 rounded-lg text-sm font-mono font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--brand-purple)' }}>IPolicyCondition</code> interface. Deploy any logic you want.
              </p>

              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                  <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
                  <span className="ml-3 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>IPolicyCondition.sol</span>
                </div>
                <div className="p-6 font-mono text-sm leading-relaxed">
                  <div><span style={{ color: '#c678dd' }}>interface</span> <span style={{ color: '#e5c07b' }}>IPolicyCondition</span> <span style={{ color: '#abb2bf' }}>{'{'}</span></div>
                  <div className="h-2" />
                  <div className="pl-4"><span style={{ color: '#c678dd' }}>function</span> <span style={{ color: '#61afef' }}>isPurchaseAllowed</span><span style={{ color: '#abb2bf' }}>(</span></div>
                  <div className="pl-8"><span style={{ color: '#e06c75' }}>address</span> <span style={{ color: '#e5c07b' }}>policyVault</span><span style={{ color: '#abb2bf' }}>,</span></div>
                  <div className="pl-8"><span style={{ color: '#e06c75' }}>uint256</span> <span style={{ color: '#e5c07b' }}>policyId</span><span style={{ color: '#abb2bf' }}>,</span></div>
                  <div className="pl-8"><span style={{ color: '#e06c75' }}>address</span> <span style={{ color: '#e5c07b' }}>buyer</span><span style={{ color: '#abb2bf' }}>,</span></div>
                  <div className="pl-8"><span style={{ color: '#e06c75' }}>bytes</span> <span style={{ color: '#e5c07b' }}>configData</span><span style={{ color: '#abb2bf' }}>,</span></div>
                  <div className="pl-8"><span style={{ color: '#e06c75' }}>bytes</span> <span style={{ color: '#e5c07b' }}>runtimeData</span></div>
                  <div className="pl-4"><span style={{ color: '#abb2bf' }}>)</span> <span style={{ color: '#c678dd' }}>external</span> <span style={{ color: '#c678dd' }}>view</span> <span style={{ color: '#c678dd' }}>returns</span> <span style={{ color: '#abb2bf' }}>(</span><span style={{ color: '#e06c75' }}>bool</span><span style={{ color: '#abb2bf' }}>);</span></div>
                  <div className="h-2" />
                  <div><span style={{ color: '#abb2bf' }}>{'}'}</span></div>
                </div>
              </div>

              <div className="mt-8">
                <Link
                  href="/agents?path=human"
                  className="btn-primary text-base px-6 py-3 no-underline font-semibold rounded-xl hover:scale-105 transition-transform shadow-lg inline-block"
                  style={{ background: 'var(--brand-purple)', color: '#fff' }}
                >
                  Build Your Own →
                </Link>
              </div>
            </div>

            {/* Right: Evaluator cards — vertical stack, different shape */}
            <div className="space-y-5">
              {[
                {
                  name: 'UAID Ownership',
                  contract: 'UaidOwnershipCondition',
                  desc: 'Gate access to buyers who own a specific agent identity in the on-chain registry.',
                  accent: 'var(--brand-purple)',
                  bgGrad: 'linear-gradient(135deg, rgba(181,108,255,0.08), rgba(181,108,255,0.02))',
                  borderColor: 'rgba(181,108,255,0.2)',
                  Icon: Icons.Shield,
                },
                {
                  name: 'Address Allowlist',
                  contract: 'AddressAllowlistCondition',
                  desc: 'Restrict purchases to a curated set of up to 512 wallet addresses.',
                  accent: 'var(--brand-blue)',
                  bgGrad: 'linear-gradient(135deg, rgba(85,153,254,0.08), rgba(85,153,254,0.02))',
                  borderColor: 'rgba(85,153,254,0.2)',
                  Icon: Icons.List,
                },
                {
                  name: 'ETH Balance',
                  contract: 'EthBalanceCondition',
                  desc: 'Require buyers to hold a minimum ETH balance to prove financial stake.',
                  accent: 'var(--brand-green)',
                  bgGrad: 'linear-gradient(135deg, rgba(72,223,123,0.08), rgba(72,223,123,0.02))',
                  borderColor: 'rgba(72,223,123,0.2)',
                  Icon: Icons.Coin,
                },
                {
                  name: 'Time Range',
                  contract: 'TimeRangeCondition',
                  desc: 'Limit access windows with not-before and not-after timestamps for time-sensitive data.',
                  accent: '#4facfe',
                  bgGrad: 'linear-gradient(135deg, rgba(79,172,254,0.08), rgba(79,172,254,0.02))',
                  borderColor: 'rgba(79,172,254,0.2)',
                  Icon: Icons.Clock,
                },
              ].map((ev) => (
                <div
                  key={ev.name}
                  className="group flex items-start gap-5 p-6 rounded-2xl transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                  style={{ background: ev.bgGrad, border: `1px solid ${ev.borderColor}` }}
                >
                  <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${ev.accent}20`, color: ev.accent }}>
                    <ev.Icon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-1">
                      <h3 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{ev.name}</h3>
                      <span className="text-[10px] sm:text-xs font-mono font-semibold" style={{ color: ev.accent }}>{ev.contract}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ev.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          USE CASES — Full-width alternating layout
          ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 relative overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>
              Built for <span className="text-gradient-brand">Real Utility</span>
            </h2>
            <p className="text-lg mx-auto max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Seamlessly bridge encrypted datasets and autonomous AI agents.
            </p>
          </div>

          {/* Two rows, alternating layout */}
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Row 1: Wide + Narrow */}
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 group rounded-3xl p-10 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(85,153,254,0.06), rgba(85,153,254,0.01))', border: '1px solid rgba(85,153,254,0.15)' }}
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.06]" style={{ background: 'var(--brand-blue)' }} />
                <span className="text-xs font-black uppercase tracking-[0.2em] mb-4 inline-block" style={{ color: 'var(--brand-blue)' }}>Quants</span>
                <h3 className="text-2xl lg:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Equities &amp; Quant Beta</h3>
                <p className="text-base leading-relaxed max-w-lg" style={{ color: 'var(--text-secondary)' }}>Allow AI agents to purchase encrypted volatility models and alpha signals autonomously.</p>
              </div>
              <div className="lg:col-span-2 group rounded-3xl p-10 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(181,108,255,0.06), rgba(181,108,255,0.01))', border: '1px solid rgba(181,108,255,0.15)' }}
              >
                <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full opacity-[0.06]" style={{ background: 'var(--brand-purple)' }} />
                <span className="text-xs font-black uppercase tracking-[0.2em] mb-4 inline-block" style={{ color: 'var(--brand-purple)' }}>Analysts</span>
                <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Private Issuer Materials</h3>
                <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Gate confidential filings so only registered analyst identities can unlock payloads.</p>
              </div>
            </div>

            {/* Row 2: Narrow + Wide */}
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2 group rounded-3xl p-10 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(72,223,123,0.06), rgba(72,223,123,0.01))', border: '1px solid rgba(72,223,123,0.15)' }}
              >
                <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full opacity-[0.06]" style={{ background: 'var(--brand-green)' }} />
                <span className="text-xs font-black uppercase tracking-[0.2em] mb-4 inline-block" style={{ color: 'var(--brand-green)' }}>Compliance</span>
                <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>KYC-Gated Disclosures</h3>
                <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Require verifiable credentials and evaluator-backed compliance checks.</p>
              </div>
              <div className="lg:col-span-3 group rounded-3xl p-10 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(79,172,254,0.06), rgba(79,172,254,0.01))', border: '1px solid rgba(79,172,254,0.15)' }}
              >
                <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full opacity-[0.06]" style={{ background: '#4facfe' }} />
                <span className="text-xs font-black uppercase tracking-[0.2em] mb-4 inline-block" style={{ color: '#4facfe' }}>Traders</span>
                <h3 className="text-2xl lg:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Agentic Execution Strategies</h3>
                <p className="text-base leading-relaxed max-w-lg" style={{ color: 'var(--text-secondary)' }}>Trading and execution agents bind access solely to their on-chain identity.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          WHY PROGRAMMABLE SECRETS — Horizontal comparison table
          ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32">
        <div className="mx-auto max-w-5xl px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              Why <span className="text-gradient-brand">Programmable Secrets?</span>
            </h2>
          </div>

          {/* Comparison — NOT cards. A clean split layout */}
          <div className="space-y-0">
            {[
              { vs: 'vs. Data NFTs', headline: 'Full policy engine, not a wrapper', line: 'A complete verifiable policy and entitlement protocol — not just a token-wrapper over an IPFS link.', accent: 'var(--brand-blue)' },
              { vs: 'vs. Key Management', headline: 'Policy is the key gate', line: 'On-chain evaluator policy is the literal gating input to the Key Release System. No policy match, no key.', accent: 'var(--brand-purple)' },
              { vs: 'vs. TEE Chains', headline: 'No chain migration needed', line: 'Confidential data delivery natively on EVM chains. Zero migration required from Arbitrum or Robinhood.', accent: 'var(--brand-green)' },
            ].map((item, i, arr) => (
              <div
                key={item.vs}
                className="flex flex-col md:flex-row items-start gap-6 py-10 transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="md:w-48 shrink-0 flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: item.accent }} />
                  <span className="text-sm font-black uppercase tracking-[0.15em]" style={{ color: item.accent }}>{item.vs}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl lg:text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{item.headline}</h3>
                  <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.line}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          DEPLOYED CONTRACTS
          ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 relative" style={{ background: 'var(--surface-1)' }}>
        <div className="mx-auto max-w-5xl px-6 lg:px-12">
          <div className="flex flex-col sm:flex-row items-center justify-between mb-16 gap-6 text-center sm:text-left">
            <div>
              <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                Deployed <span className="text-gradient-brand">Contracts</span>
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>Open architecture. Fully verifiable.</p>
            </div>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold tracking-wide uppercase shadow-sm" style={{ background: 'rgba(72, 223, 123, 0.1)', color: 'var(--brand-green)', border: '1px solid rgba(72, 223, 123, 0.2)' }}>
              <span className="h-2 w-2 rounded-full pulse-dot" style={{ background: 'currentColor' }} />
              Active System
            </span>
          </div>
          
          <div className="space-y-12">
            {Object.entries(DEPLOYMENTS).map(([networkName, network]) => (
              <div key={networkName} className="p-5 sm:p-8 lg:p-10 rounded-3xl" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 sm:h-4 sm:w-4 rounded-full shadow-lg" style={{ background: network.color, boxShadow: `0 0 20px ${network.color}88` }} />
                    <h3 className="text-lg sm:text-2xl font-bold uppercase tracking-wide" style={{ color: network.color }}>
                      {networkName}
                    </h3>
                  </div>
                  <span className="text-xs sm:text-sm font-mono font-medium px-3 py-1 sm:px-4 sm:py-1.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                    Chain ID: {network.chainId}
                  </span>
                </div>
                <div className="grid gap-3 sm:gap-4">
                  {network.contracts.map((contract) => (
                    <div
                      key={contract.name}
                      className="group flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-4 py-4 sm:px-6 sm:py-5 rounded-2xl transition-all duration-200 hover:shadow-md"
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <span className="text-base sm:text-lg font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
                          {contract.name}
                        </span>
                        {contract.proxy && (
                          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md shrink-0" style={{ background: 'rgba(85,153,254,0.1)', color: 'var(--brand-blue)' }}>
                            UUPS Proxy
                          </span>
                        )}
                      </div>
                      <a
                        href={`${network.explorer}/address/${contract.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs sm:text-sm font-mono font-medium hover:underline flex items-center gap-2 transition-colors min-w-0 min-h-[44px] sm:min-h-0 items-center"
                        style={{ color: 'var(--brand-blue)' }}
                      >
                        <span className="hidden sm:inline">{contract.address}</span>
                        <span className="sm:hidden truncate">{contract.address.slice(0, 10)}…{contract.address.slice(-6)}</span>
                        <span className="shrink-0 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          ROADMAP — Premium vertical-card timeline
          ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 relative overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        {/* Ambient decorative blurs */}
        <div className="pointer-events-none absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full blur-[200px] opacity-[0.04]" style={{ background: 'var(--brand-green)' }} />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full blur-[200px] opacity-[0.04]" style={{ background: 'var(--brand-purple)' }} />

        <div className="mx-auto max-w-6xl px-6 lg:px-12 relative z-10">
          <div className="text-center mb-16 lg:mb-20">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-[0.2em] mb-6" style={{ background: 'rgba(85, 153, 254, 0.08)', color: 'var(--brand-blue)', border: '1px solid rgba(85, 153, 254, 0.15)' }}>
              What&apos;s ahead
            </span>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Project <span className="text-gradient-brand">Roadmap</span>
            </h2>
            <p className="text-lg mt-4 max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Building the infrastructure for programmable, verifiable data access.
            </p>
          </div>

          {/* Desktop: Three-column card layout with connecting line */}
          <div className="relative">
            {/* Horizontal connecting line (desktop) */}
            <div className="hidden lg:block absolute top-[60px] left-[16%] right-[16%] h-[2px]" style={{ background: 'linear-gradient(90deg, var(--brand-green), var(--brand-blue), var(--brand-purple))' }}>
              <div className="absolute inset-0 blur-sm opacity-50" style={{ background: 'linear-gradient(90deg, var(--brand-green), var(--brand-blue), var(--brand-purple))' }} />
            </div>

            <div className="grid gap-6 lg:gap-8 lg:grid-cols-3">
              {[
                {
                  phase: 'Now',
                  status: 'Live',
                  title: 'Receipt-Backed Access',
                  items: ['Policy-defined ERC-721 receipts', 'ERC-8004 agent identity gating', 'Evaluator-driven policy engine'],
                  accent: 'var(--brand-green)',
                  accentRgb: '72, 223, 123',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                },
                {
                  phase: 'Next',
                  status: 'In Progress',
                  title: 'Multi-Node Key Release',
                  items: ['Threshold key splitting', 'BLS quorum aggregation', 'Distributed KRS network'],
                  accent: 'var(--brand-blue)',
                  accentRgb: '85, 153, 254',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                },
                {
                  phase: 'Future',
                  status: 'Planned',
                  title: 'Privacy Primitives',
                  items: ['Proxy re-encryption', 'Cross-chain receipt portability', 'Zero-knowledge proof integration'],
                  accent: 'var(--brand-purple)',
                  accentRgb: '181, 108, 255',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  ),
                },
              ].map((phase, idx) => (
                <div key={phase.phase} className="relative group">
                  {/* Timeline node */}
                  <div className="flex justify-center mb-6">
                    <div className="relative">
                      <div
                        className="w-[120px] h-[120px] rounded-3xl flex flex-col items-center justify-center gap-2 shadow-xl transition-all duration-500 group-hover:scale-105 group-hover:shadow-2xl"
                        style={{
                          background: `linear-gradient(135deg, rgba(${phase.accentRgb}, 0.12), rgba(${phase.accentRgb}, 0.04))`,
                          border: `1.5px solid rgba(${phase.accentRgb}, 0.25)`,
                          backdropFilter: 'blur(12px)',
                        }}
                      >
                        <div style={{ color: phase.accent }}>{phase.icon}</div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: phase.accent }}>{phase.phase}</span>
                      </div>
                      {/* Glow effect */}
                      <div
                        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl -z-10"
                        style={{ background: `rgba(${phase.accentRgb}, 0.15)` }}
                      />
                      {/* Pulse for active phase */}
                      {idx === 0 && (
                        <span
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center"
                          style={{ background: phase.accent, boxShadow: `0 0 12px rgba(${phase.accentRgb}, 0.6)` }}
                        >
                          <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: phase.accent }} />
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 text-white relative z-10">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Phase card */}
                  <div
                    className="rounded-2xl p-6 lg:p-8 transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1"
                    style={{
                      background: 'var(--surface-0)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {/* Status badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          background: `rgba(${phase.accentRgb}, 0.08)`,
                          color: phase.accent,
                          border: `1px solid rgba(${phase.accentRgb}, 0.15)`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: phase.accent }} />
                        {phase.status}
                      </span>
                    </div>

                    <h3 className="text-lg lg:text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
                      {phase.title}
                    </h3>

                    <ul className="space-y-3">
                      {phase.items.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          <span className="shrink-0 mt-1.5">
                            {idx === 0 ? (
                              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke={phase.accent} strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className="block h-1.5 w-1.5 rounded-full mt-0.5" style={{ background: `rgba(${phase.accentRgb}, 0.4)`, border: `1.5px solid rgba(${phase.accentRgb}, 0.6)` }} />
                            )}
                          </span>
                          <span style={{ color: idx === 0 ? 'var(--text-primary)' : undefined }}>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          FOOTER — Full multi-column (matches hol-points-portal)
          ════════════════════════════════════════════ */}
      <footer
        className="py-12 lg:py-16"
        style={{ background: 'linear-gradient(135deg, #3f4174, var(--brand-blue))', color: '#c7d2fe' }}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Docs */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-white">Docs</h3>
              <ul className="space-y-2">
                {[
                  { label: 'Agent Guide', href: '/agents?path=agent', external: false },
                  { label: 'Developer Guide', href: '/agents?path=human', external: false },
                  { label: 'Skill Install Flow', href: '/agents?path=agent', external: false },
                  { label: 'Contracts Repo', href: 'https://github.com/hashgraph-online/programmable-secrets-contracts', external: true },
                ].map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-200 hover:text-white transition-colors text-sm"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-indigo-200 hover:text-white transition-colors text-sm no-underline"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Networks */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-white">Networks</h3>
              <ul className="space-y-2">
                {[
                  { label: 'Arbitrum Sepolia', href: 'https://sepolia.arbiscan.io', external: true },
                  { label: 'Robinhood Testnet', href: 'https://explorer.testnet.chain.robinhood.com', external: true },
                  { label: 'Submit ERC-8004 Contract', href: 'https://hol.org/registry/submit-erc8004', external: true },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-indigo-200 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Community */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-white">Community</h3>
              <ul className="space-y-2">
                {[
                  { label: 'Telegram', href: 'https://t.me/hashinals', external: true },
                  { label: 'X', href: 'https://x.com/HashgraphOnline', external: true },
                  { label: 'GitHub', href: 'https://github.com/hashgraph-online', external: true },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-200 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* More */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-white">More</h3>
              <ul className="space-y-2">
                {[
                  { label: 'Blog', href: 'https://hol.org/blog', external: true },
                  { label: 'HOL Points', href: 'https://hol.org/points', external: true },
                  { label: 'Privacy Policy', href: 'https://hol.org/points/legal/privacy', external: true },
                  { label: 'Terms of Service', href: 'https://hol.org/points/legal/terms', external: true },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-indigo-200 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-indigo-200/20 text-center">
            <p className="text-blue-200 text-sm">
              Copyright © {new Date().getFullYear()} Hashgraph Online DAO LLC.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
