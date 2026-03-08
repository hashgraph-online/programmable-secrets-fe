'use client';

import Link from 'next/link';
import { formatEther, getAddress } from 'viem';
import { parsePolicyMetadata } from '@/lib/crypto';
import { getNetworkMeta } from '@/lib/contracts/networks';
import {
  hasRuntimeWitness,
  hasUaidGate,
  uniqueEvaluatorCount,
  type PolicyConditionViewModel,
} from '@/lib/policy-evaluator-display';

interface PolicyView {
  id: string | number;
  policyId: number | null;
  chainId?: number | null;
  providerUaid?: string | null;
  providerAddress?: string | null;
  priceWei: string;
  active: boolean;
  status: string;
  metadataJson?: Record<string, unknown> | null;
  conditionCount?: number | null;
  conditions?: PolicyConditionViewModel[];
  confirmedAt?: string | null;
  createdAt?: string | null;
}

export function PolicyCard({ policy, connectedAddress }: { policy: PolicyView; connectedAddress?: string | null }) {
  const isProvider = (() => {
    if (!connectedAddress || !policy.providerAddress) return false;
    try { return getAddress(connectedAddress) === getAddress(policy.providerAddress); }
    catch { return connectedAddress.toLowerCase() === policy.providerAddress.toLowerCase(); }
  })();
  const metadata = parsePolicyMetadata(policy.metadataJson);
  const title = metadata?.title ?? `Dataset #${policy.policyId}`;
  const description = metadata?.description ?? 'AES-256-GCM encrypted dataset with on-chain policy enforcement and receipt-based access control.';
  const mimeType = metadata?.mimeType ?? '';
  const net = getNetworkMeta(policy.chainId);
  const conditions = policy.conditions ?? [];
  const evaluatorCount = uniqueEvaluatorCount(conditions);
  const uaidGated = hasUaidGate(conditions);
  const witnessRequired = hasRuntimeWitness(conditions);
  const priceLabel = (() => {
    try {
      return `${formatEther(BigInt(policy.priceWei))} ${net.currencySymbol}`;
    } catch {
      return policy.priceWei;
    }
  })();

  const accentColor = net.color ?? 'var(--brand-blue)';

  return (
    <Link
      href={`/policy/${policy.policyId}`}
      className="group block no-underline rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
      style={{
        background: 'var(--surface-0)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* ── Top accent bar ── */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, var(--brand-purple))` }} />

      <div className="p-6">
        {/* ── Header: Network + Status ── */}
        <div className="flex items-center justify-between mb-5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full text-xs font-bold"
            style={{
              padding: '4px 10px',
              background: `${accentColor}14`,
              color: accentColor,
              border: `1px solid ${accentColor}28`,
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: accentColor }}
            />
            {net.shortName}
          </span>
          <div className="flex items-center gap-2">
            {isProvider && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: 'rgba(99,102,241,0.1)',
                  color: 'var(--brand-blue)',
                  border: '1px solid rgba(99,102,241,0.2)',
                }}
              >
                Your listing
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
              style={{
                background: policy.active ? 'rgba(34, 197, 94, 0.1)' : 'var(--surface-3)',
                color: policy.active ? 'var(--accent-green)' : 'var(--text-tertiary)',
              }}
            >
              {policy.active && (
                <span
                  className="h-2 w-2 rounded-full pulse-dot"
                  style={{ background: 'var(--accent-green)' }}
                />
              )}
              {policy.active ? 'Active' : policy.status}
            </span>
          </div>
        </div>

        {/* ── Price ── */}
        <div className="mb-4">
          <p className="text-3xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {priceLabel}
          </p>
        </div>

        {/* ── Title & Description ── */}
        <h3 className="text-lg font-bold mb-2 truncate" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed line-clamp-2 mb-5" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>

        {/* ── Details row ── */}
        <div className="flex flex-wrap items-center gap-2 mb-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
          {(policy.conditionCount ?? 0) > 0 && (
            <span className="tag-subtle text-xs" style={{ padding: '3px 10px' }}>
              {policy.conditionCount} condition{policy.conditionCount === 1 ? '' : 's'}
            </span>
          )}
          {evaluatorCount > 0 && (
            <span className="tag-subtle text-xs" style={{ padding: '3px 10px' }}>
              {evaluatorCount} evaluator{evaluatorCount === 1 ? '' : 's'}
            </span>
          )}
          {uaidGated && (
            <span className="tag-subtle text-xs" style={{ padding: '3px 10px', color: 'var(--brand-blue)' }}>
              UAID gate
            </span>
          )}
          {witnessRequired && (
            <span className="tag-subtle text-xs" style={{ padding: '3px 10px' }}>
              Runtime witness
            </span>
          )}
          <span className="tag-subtle text-xs" style={{ padding: '3px 10px' }}>
            AES-GCM
          </span>
          {mimeType && (
            <span className="tag-subtle text-xs" style={{ padding: '3px 10px' }}>
              {mimeType}
            </span>
          )}
        </div>

        {/* ── CTA ── */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>
            Policy #{policy.policyId}
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-sm font-bold transition-all duration-200 group-hover:gap-2.5"
            style={{ color: 'var(--brand-blue)' }}
          >
            View Details
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

