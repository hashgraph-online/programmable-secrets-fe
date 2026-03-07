'use client';

import Link from 'next/link';
import { formatEther } from 'viem';
import { parsePolicyMetadata } from '@/lib/crypto';
import { getNetworkMeta } from '@/lib/contracts/networks';

interface PolicyView {
  id: string | number;
  policyId: number | null;
  chainId?: number | null;
  providerUaid?: string | null;
  priceWei: string;
  active: boolean;
  status: string;
  metadataJson?: Record<string, unknown> | null;
  confirmedAt?: string | null;
  createdAt?: string | null;
}

export function PolicyCard({ policy }: { policy: PolicyView }) {
  const metadata = parsePolicyMetadata(policy.metadataJson);
  const title = metadata?.title ?? `Policy #${policy.policyId}`;
  const description = metadata?.description ?? 'Encrypted dataset';
  const mimeType = metadata?.mimeType ?? '';
  const net = getNetworkMeta(policy.chainId);
  const priceLabel = (() => {
    try {
      return `${formatEther(BigInt(policy.priceWei))} ${net.currencySymbol}`;
    } catch {
      return policy.priceWei;
    }
  })();

  return (
    <Link
      href={`/policy/${policy.policyId}`}
      className="surface-card block p-5 no-underline group"
    >
      {/* Price & status row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {priceLabel}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: policy.active ? 'rgba(34, 197, 94, 0.1)' : 'var(--surface-3)',
            color: policy.active ? 'var(--accent-green)' : 'var(--text-tertiary)',
          }}
        >
          {policy.active && (
            <span
              className="h-1.5 w-1.5 rounded-full pulse-dot"
              style={{ background: 'var(--accent-green)' }}
            />
          )}
          {policy.active ? 'Active' : policy.status}
        </span>
      </div>

      {/* Title & description */}
      <h3 className="text-[14px] font-semibold mb-1.5 truncate" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p className="text-xs line-clamp-2 leading-relaxed mb-4" style={{ color: 'var(--text-tertiary)' }}>
        {description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Network badge */}
        <span
          className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold"
          style={{
            padding: '2px 8px',
            background: `${net.color}14`,
            color: net.color,
            border: `1px solid ${net.color}28`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: net.color }}
          />
          {net.shortName}
        </span>

        {mimeType && (
          <span className="tag-subtle" style={{ fontSize: '10px', padding: '2px 8px' }}>
            {mimeType}
          </span>
        )}
        <span className="tag-subtle" style={{ fontSize: '10px', padding: '2px 8px' }}>
          AES-GCM
        </span>
        <span className="ml-auto text-xs font-medium transition-colors group-hover:translate-x-0.5" style={{ color: 'var(--brand-blue)', transition: 'transform 0.15s ease, color 0.15s ease' }}>
          View →
        </span>
      </div>
    </Link>
  );
}
