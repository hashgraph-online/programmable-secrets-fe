'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseHcs14Did } from '@hashgraphonline/standards-sdk';
import {
  createPublicClient,
  encodeAbiParameters,
  formatEther,
  getAddress,
  http,
  parseAbiParameters,
} from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import {
  buildAddressUrl,
  buildTxUrl,
  resolveProgrammableSecretsChain,
} from '@/lib/contracts/chain';
import { PAYMENT_MODULE_ABI, PAYMENT_MODULE_ADDRESS } from '@/lib/contracts/abi';
import { getNetworkMeta } from '@/lib/contracts/networks';
import { broker } from '@/lib/api/broker';
import {
  parsePolicyMetadata,
  generateBuyerKeyPair,
  exportPublicKeyPem,
  getPublicKeyFingerprint,
  decryptEnvelope,
  importAesKeyBase64,
  decryptPayload,
  bytesToBase64,
  base64ToBytes,
  sha256Bytes,
  bytesToUtf8,
  bytesToArrayBuffer,
} from '@/lib/crypto';
import type { ProgrammableSecretsConditionWitness } from '@/lib/server/policy-conditions';
import {
  describeConditionKind,
  describeConditionSummary,
  formatWitnessLabel,
  hasUaidGate,
  uniqueEvaluatorCount,
} from '@/lib/policy-evaluator-display';

interface DecryptedResult {
  plaintext: string | null;
  downloadUrl: string | null;
  mimeType: string;
  fileName: string;
  plaintextHash: string;
}

const DEFAULT_REGISTRY_ORIGIN = 'https://hol.org';

function resolveRegistryOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_REGISTRY_ORIGIN;
  const value =
    typeof configured === 'string' && configured.trim().length > 0
      ? configured.trim()
      : DEFAULT_REGISTRY_ORIGIN;
  return value.replace(/\/+$/, '');
}

function normalizeUaid(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('uaid:')) {
    return null;
  }
  try {
    parseHcs14Did(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function buildRegistryAgentProfileUrl(uaid: string): string {
  return `${resolveRegistryOrigin()}/registry/agent/${encodeURIComponent(uaid)}`;
}

function buildRegistryTrustEmbedUrl(uaid: string): string {
  return `${buildRegistryAgentProfileUrl(uaid)}/trust/embed`;
}

function buildRegistryAddressSearchUrl(address: string): string {
  return `${resolveRegistryOrigin()}/registry/search?q=${encodeURIComponent(address)}`;
}

interface ProviderIdentityResolution {
  uaid: string | null;
  source: 'policy-uaid' | 'registry-search' | 'none';
}

async function resolveProviderIdentity(params: {
  providerAddress: string;
  chainId: number;
  policyProviderUaid: string | null;
}): Promise<ProviderIdentityResolution> {
  const url = new URL('/api/ps/provider-identity', window.location.origin);
  url.searchParams.set('providerAddress', params.providerAddress);
  url.searchParams.set('chainId', String(params.chainId));
  if (params.policyProviderUaid) {
    url.searchParams.set('policyProviderUaid', params.policyProviderUaid);
  }
  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve provider identity (${response.status})`);
  }
  const payload = (await response.json()) as ProviderIdentityResolution;
  return payload;
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function encodeConditionRuntimeInput(
  witness: ProgrammableSecretsConditionWitness,
  value: string,
): `0x${string}` {
  if (witness.kind === 'none') {
    return '0x';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${witness.label ?? 'Condition value'} is required`);
  }

  if (witness.kind === 'hex') {
    if (!/^0x[0-9a-fA-F]*$/.test(trimmed) || trimmed.length % 2 !== 0) {
      throw new Error(`${witness.label} must be a valid hex string`);
    }
    return trimmed as `0x${string}`;
  }

  return encodeAbiParameters(parseAbiParameters('string value'), [trimmed]);
}

function TrustEmbedSection({
  embedUrl,
  profileUrl,
  addressSearchUrl,
  providerUaid,
}: {
  embedUrl: string | null;
  profileUrl: string | null;
  addressSearchUrl: string;
  providerUaid: string | null;
}) {
  const [embedState, setEmbedState] = useState<'checking' | 'ok' | 'unavailable'>(
    embedUrl ? 'checking' : 'unavailable',
  );

  // Verify the embed URL is reachable server-side before rendering the iframe
  useEffect(() => {
    if (!embedUrl) {
      return;
    }
    let cancelled = false;

    fetch(`/api/ps/trust-check?url=${encodeURIComponent(embedUrl)}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setEmbedState(data.ok ? 'ok' : 'unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) setEmbedState('unavailable');
      });

    return () => { cancelled = true; };
  }, [embedUrl]);

  // Fallback: no UAID, checking failed, or embed unavailable
  if (!embedUrl || embedState === 'unavailable') {
    const linkUrl = profileUrl ?? addressSearchUrl;
    return (
      <div
        className="rounded-xl p-5"
        style={{ border: '1px solid rgba(85,153,254,0.15)', background: 'rgba(85,153,254,0.03)' }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(85,153,254,0.1)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-blue)' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Trust score temporarily unavailable
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              We could not load the external trust score for this provider. However, this dataset&apos;s <strong>entitlements, policies, and key commitments are cryptographically verifiable on-chain</strong>. 
              {providerUaid ? ' You can review the provider\'s linked registry identity below.' : ' This provider is anonymous, so please review the conditions carefully.'}
            </p>
            <div className="pt-2">
              <a
                href={linkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                style={{ color: 'var(--brand-blue)' }}
              >
                {profileUrl ? 'Review Agent Profile on Registry' : 'Inspect Wallet Adddress in Registry'} ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (embedState === 'checking') {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
      >
        <div className="flex items-center justify-center py-10" style={{ color: 'var(--text-tertiary)' }}>
          <span className="text-sm">Loading trust score…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: 'var(--surface-0)' }}>
      <iframe
        src={embedUrl}
        title={`Trust and reputation for ${providerUaid}`}
        loading="lazy"
        className="w-full"
        style={{ border: 'none', height: 460, background: 'transparent' }}
        onLoad={(e) => {
          const iframe = e.target as HTMLIFrameElement;
          try {
            const body = iframe.contentDocument?.body;
            if (body) {
              iframe.style.height = `${body.scrollHeight}px`;
            }
          } catch {
            // cross-origin — keep default height
          }
        }}
      />
    </div>
  );
}

/* ── DecryptedDataDisplay — structured JSON viewer ── */
const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'rgba(239,68,68,0.08)', text: 'var(--accent-red)', border: 'rgba(239,68,68,0.2)' },
  high: { bg: 'rgba(245,158,11,0.08)', text: 'var(--accent-amber)', border: 'rgba(245,158,11,0.2)' },
  medium: { bg: 'rgba(85,153,254,0.08)', text: 'var(--brand-blue)', border: 'rgba(85,153,254,0.2)' },
  low: { bg: 'rgba(72,223,123,0.08)', text: 'var(--brand-green)', border: 'rgba(72,223,123,0.2)' },
  info: { bg: 'rgba(181,108,255,0.08)', text: 'var(--brand-purple)', border: 'rgba(181,108,255,0.2)' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  fixed: { bg: 'rgba(34,197,94,0.1)', text: 'var(--accent-green)' },
  resolved: { bg: 'rgba(34,197,94,0.1)', text: 'var(--accent-green)' },
  acknowledged: { bg: 'rgba(85,153,254,0.1)', text: 'var(--brand-blue)' },
  open: { bg: 'rgba(245,158,11,0.1)', text: 'var(--accent-amber)' },
  pending: { bg: 'rgba(245,158,11,0.1)', text: 'var(--accent-amber)' },
  closed: { bg: 'rgba(107,114,128,0.1)', text: 'var(--text-tertiary)' },
};

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T|\s)/.test(value);
}

function isHexLike(value: string): boolean {
  return /^0x[0-9a-fA-F]{8,}$/.test(value);
}

function SeverityBadge({ severity }: { severity: string }) {
  const key = severity.toLowerCase();
  const colors = SEVERITY_COLORS[key] ?? { bg: 'var(--surface-3)', text: 'var(--text-secondary)', border: 'var(--border)' };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.text }} />
      {severity}
    </span>
  );
}

function StatusBadgeLocal({ status }: { status: string }) {
  const key = status.toLowerCase();
  const colors = STATUS_COLORS[key] ?? { bg: 'var(--surface-3)', text: 'var(--text-secondary)' };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: colors.bg, color: colors.text }}
    >
      {(key === 'fixed' || key === 'resolved') && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {status}
    </span>
  );
}

function ScalarValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold"
        style={{
          background: value ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          color: value ? 'var(--accent-green)' : 'var(--accent-red)',
        }}
      >
        {value ? '✓ true' : '✗ false'}
      </span>
    );
  }
  if (typeof value === 'number') {
    return (
      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}>
        {value.toLocaleString()}
      </span>
    );
  }
  const str = String(value);
  if (isHexLike(str)) {
    return (
      <span className="text-xs truncate max-w-[240px] inline-block align-bottom" style={{ color: 'var(--brand-purple)', fontFamily: 'var(--font-mono)' }} title={str}>
        {str.length > 20 ? `${str.slice(0, 10)}…${str.slice(-8)}` : str}
      </span>
    );
  }
  if (isIsoDate(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      return (
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
          {d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      );
    }
  }
  return <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{str}</span>;
}

function StructuredRow({ label, value }: { label: string; value: unknown }) {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel === 'severity' && typeof value === 'string') {
    return (
      <div className="flex items-center justify-between gap-4 py-2.5 px-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{humanizeKey(label)}</span>
        <SeverityBadge severity={value} />
      </div>
    );
  }
  if (lowerLabel === 'status' && typeof value === 'string') {
    return (
      <div className="flex items-center justify-between gap-4 py-2.5 px-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{humanizeKey(label)}</span>
        <StatusBadgeLocal status={value} />
      </div>
    );
  }
  if (typeof value === 'object' && value !== null) return null; // handled separately
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 px-1" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{humanizeKey(label)}</span>
      <div className="text-right min-w-0"><ScalarValue value={value} /></div>
    </div>
  );
}

function ObjectCard({ data, accent }: { data: Record<string, unknown>; accent?: string }) {
  const heading = (data.title ?? data.name ?? data.id ?? data.label) as string | undefined;
  const severity = data.severity as string | undefined;
  const status = data.status as string | undefined;
  const sevColors = severity ? (SEVERITY_COLORS[severity.toLowerCase()] ?? null) : null;
  const borderColor = sevColors?.border ?? (accent ? `${accent}33` : 'var(--border)');

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:shadow-md"
      style={{ border: `1px solid ${borderColor}`, background: sevColors?.bg ?? 'var(--surface-1)' }}
    >
      {/* Card header: title + badges */}
      {(heading || severity || status) && (
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {heading && (
            <span className="text-sm font-bold flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
              {String(heading)}
            </span>
          )}
          {severity && <SeverityBadge severity={severity} />}
          {status && <StatusBadgeLocal status={status} />}
        </div>
      )}
      {/* Remaining fields */}
      <div className="space-y-0">
        {Object.entries(data)
          .filter(([k]) => !['title', 'name', 'severity', 'status'].includes(k) || (!heading && k !== 'severity' && k !== 'status'))
          .map(([key, val]) => {
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
              return (
                <div key={key} className="py-2.5 px-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-tertiary)' }}>{humanizeKey(key)}</span>
                  <div className="pl-3" style={{ borderLeft: '2px solid var(--border-hover)' }}>
                    {Object.entries(val as Record<string, unknown>).map(([sk, sv]) => (
                      <StructuredRow key={sk} label={sk} value={sv} />
                    ))}
                  </div>
                </div>
              );
            }
            return <StructuredRow key={key} label={key} value={val} />;
          })}
      </div>
    </div>
  );
}

function DecryptedDataDisplay({ plaintext }: { plaintext: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  let parsed: unknown = null;
  let isJson = false;
  let formatted = plaintext;
  try {
    parsed = JSON.parse(plaintext);
    isJson = typeof parsed === 'object' && parsed !== null;
    formatted = JSON.stringify(parsed, null, 2);
  } catch { /* not JSON */ }

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render structured view for JSON objects
  const renderStructured = () => {
    if (!isJson || !parsed) return null;
    const obj = parsed as Record<string, unknown>;

    return (
      <div className="space-y-4">
        {Object.entries(obj).map(([key, value]) => {
          // Array of objects → list of cards
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--brand-blue)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
                    {humanizeKey(key)}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}>
                    {value.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {value.map((item, i) => (
                    <ObjectCard key={i} data={item as Record<string, unknown>} />
                  ))}
                </div>
              </div>
            );
          }

          // Nested object → section card
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--brand-purple)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M12 9v6" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
                    {humanizeKey(key)}
                  </span>
                </div>
                <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                  {Object.entries(value as Record<string, unknown>).map(([sk, sv]) => {
                    if (Array.isArray(sv) && sv.length > 0 && typeof sv[0] === 'object') {
                      return (
                        <div key={sk} className="py-2">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                              {humanizeKey(sk)}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}>
                              {sv.length}
                            </span>
                          </div>
                          <div className="space-y-3">
                            {sv.map((item, i) => (
                              <ObjectCard key={i} data={item as Record<string, unknown>} />
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return <StructuredRow key={sk} label={sk} value={sv} />;
                  })}
                </div>
              </div>
            );
          }

          // Scalar value → simple row
          return (
            <div key={key} className="flex items-center justify-between gap-4 py-2 px-1" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{humanizeKey(key)}</span>
              <div className="text-right min-w-0"><ScalarValue value={value} /></div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--brand-blue)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
            Decrypted Data
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isJson && (
            <button
              type="button"
              onClick={() => setShowRaw((r) => !r)}
              className="btn-ghost text-xs"
              style={{ color: showRaw ? 'var(--brand-blue)' : 'var(--text-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
              </svg>
              {showRaw ? 'Structured' : 'Raw JSON'}
            </button>
          )}
          <button type="button" onClick={handleCopy} className="btn-ghost text-xs">
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)' }}><polyline points="20 6 9 17 4 12" /></svg>
                Copied
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {isJson && !showRaw ? (
        <div
          className="rounded-xl p-5 max-h-[600px] overflow-auto"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
        >
          {renderStructured()}
        </div>
      ) : (
        <pre
          className="max-h-[500px] overflow-auto rounded-xl p-5 text-sm leading-relaxed"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <code>{formatted}</code>
        </pre>
      )}
    </div>
  );
}


export default function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const policyId = Number(id);
  const queryClient = useQueryClient();
  const { address, isConnected, chainId: connectedChainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [purchaseTxHash, setPurchaseTxHash] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [decryptedResult, setDecryptedResult] = useState<DecryptedResult | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [conditionInputs, setConditionInputs] = useState<Record<number, string>>({});
  const decryptedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (decryptedResult?.downloadUrl) URL.revokeObjectURL(decryptedResult.downloadUrl);
    };
  }, [decryptedResult?.downloadUrl]);

  useEffect(() => {
    setPurchaseTxHash(null);
    setUnlockError(null);
    setConditionInputs({});
    setDecryptedResult((current) => {
      if (current?.downloadUrl) {
        URL.revokeObjectURL(current.downloadUrl);
      }
      return null;
    });
  }, [policyId]);

  const policyQuery = useQuery({
    queryKey: ['ps-policy', policyId],
    queryFn: () => broker.getPolicy(policyId),
    enabled: Number.isFinite(policyId) && policyId > 0,
  });
  const currentPolicy = policyQuery.data?.policy ?? null;
  const targetChain = useMemo(
    () => resolveProgrammableSecretsChain(currentPolicy?.chainId),
    [currentPolicy?.chainId],
  );
  const targetNetwork = useMemo(
    () => getNetworkMeta(currentPolicy?.chainId),
    [currentPolicy?.chainId],
  );
  const publicClient = useMemo(
    () => createPublicClient({ chain: targetChain, transport: http() }),
    [targetChain],
  );

  // Check on-chain if the connected wallet already has a receipt for this policy
  const receiptQuery = useQuery({
    queryKey: ['ps-receipt', policyId, address, currentPolicy?.paymentModuleAddress],
    queryFn: async () => {
      if (!address) return 0n;
      const result = await publicClient.readContract({
        address: getAddress(currentPolicy?.paymentModuleAddress ?? PAYMENT_MODULE_ADDRESS),
        abi: PAYMENT_MODULE_ABI,
        functionName: 'receiptOfPolicyAndBuyer',
        args: [BigInt(policyId), address],
      });
      return result as bigint;
    },
    enabled: Number.isFinite(policyId) && policyId > 0 && !!address && !!currentPolicy?.paymentModuleAddress,
    refetchInterval: purchaseTxHash ? 3000 : false, // Poll after purchase until receipt appears
  });

  // Auto-resolve known identities if the buyer is registered in the broker
  const buyerIdentityQuery = useQuery({
    queryKey: ['buyer-identity', address, currentPolicy?.chainId],
    queryFn: () => resolveProviderIdentity({
      providerAddress: address!,
      chainId: currentPolicy?.chainId ?? targetChain.id,
      policyProviderUaid: null,
    }),
    enabled: !!address,
  });

  const policy = currentPolicy;

  // Detect if the connected wallet is the provider/publisher of this policy
  const isProvider = useMemo(() => {
    if (!address || !policy?.providerAddress) return false;
    try {
      return getAddress(address) === getAddress(policy.providerAddress);
    } catch {
      return address.toLowerCase() === policy.providerAddress.toLowerCase();
    }
  }, [address, policy?.providerAddress]);

  const hasReceipt = receiptQuery.data != null && receiptQuery.data > 0n;
  const hasPurchased = !!purchaseTxHash || hasReceipt;

  const metadata = parsePolicyMetadata(policy?.metadataJson);
  const keyReleaseReady = policy?.keyReleaseReady === true && metadata != null;
  const purchaseConditionFields = useMemo(
    () =>
      (policy?.conditions ?? []).filter(
        (condition) => condition.runtimeWitness.kind !== 'none',
      ),
    [policy?.conditions],
  );
  const evaluatorCount = uniqueEvaluatorCount(policy?.conditions ?? []);
  const uaidGated = hasUaidGate(policy?.conditions ?? []);
  const chainMismatch =
    isConnected && !isProvider && !!policy?.chainId && connectedChainId !== policy.chainId;
  const priceLabel = useMemo(() => {
    if (!policy) return '—';
    try { return `${formatEther(BigInt(policy.priceWei))} ETH`; }
    catch { return policy.priceWei; }
  }, [policy]);

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !address || !policy?.policyId) throw new Error('Not ready');
      const runtimeInputs = policy.conditions.map((condition) =>
        encodeConditionRuntimeInput(
          condition.runtimeWitness,
          conditionInputs[condition.index] ?? '',
        ),
      );
      const tx = await walletClient.writeContract({
        address: getAddress(policy.paymentModuleAddress),
        abi: PAYMENT_MODULE_ABI,
        functionName: 'purchase',
        args: [BigInt(policy.policyId), getAddress(address), runtimeInputs],
        value: BigInt(policy.priceWei),
        chain: targetChain,
        account: walletClient.account,
      });
      await waitForTransactionReceipt(publicClient, { hash: tx });
      setPurchaseTxHash(tx);
      await Promise.all([
        policyQuery.refetch(),
        receiptQuery.refetch(),
      ]);
      return tx;
    },
    onError: (e) => setUnlockError(e instanceof Error ? e.message : 'Purchase failed'),
  });

  const unlockMutation = useMutation({
    mutationFn: async (): Promise<DecryptedResult> => {
      if (!walletClient?.account || !address || !policy?.policyId || !metadata)
        throw new Error('Not ready');
      if (!metadata.cipher?.ivBase64) {
        throw new Error('Policy metadata is missing the AES-GCM IV');
      }
      if (typeof metadata.plaintextHash !== 'string') {
        throw new Error('Policy metadata is missing the plaintext hash');
      }

      const buyerAddress = getAddress(address);

      const nonce = await broker.createNonce({ policyId: policy.policyId, buyerAddress });

      const keyPair = await generateBuyerKeyPair();
      const buyerRsaPublicKeyPem = await exportPublicKeyPem(keyPair.publicKey);
      const buyerPublicKeyFingerprint = await getPublicKeyFingerprint(keyPair.publicKey);

      const signature = await walletClient.signMessage({
        account: walletClient.account,
        message: nonce.challengeMessage,
      });

      let keyRequest = await broker.requestKey({
        requestId: nonce.requestId,
        policyId: policy.policyId,
        buyerAddress,
        nonce: nonce.nonce,
        signature,
        buyerRsaPublicKeyPem,
        buyerPublicKeyFingerprint,
      });

      if (keyRequest.status === 'pending' || keyRequest.status === 'nonce-issued') {
        keyRequest = await broker.pollKeyRequest(nonce.requestId);
      }
      if (keyRequest.status !== 'issued' || !keyRequest.encryptedKey) {
        const msg = keyRequest.errorMessage ?? `Key release denied (status: ${keyRequest.status})`;
        throw new Error(msg);
      }

      const rawKey = await decryptEnvelope(keyPair.privateKey, keyRequest.encryptedKey);
      const aesKey = await importAesKeyBase64(bytesToBase64(rawKey));

      const ciphertextRaw = await broker.getPolicyCiphertext(policy.policyId);
      const ciphertextBytes = new Uint8Array(ciphertextRaw);

      // The ciphertext blob might be stored as [iv(12) + tag(16) + data] from Node crypto,
      // or as [data + tag] from WebCrypto. Try to detect and handle both formats.
      let plaintext: Uint8Array;
      const storedIv = base64ToBytes(metadata.cipher.ivBase64);

      try {
        // Try WebCrypto format first: separate IV, ciphertext = data + tag
        plaintext = await decryptPayload(aesKey, {
          ciphertext: ciphertextRaw,
          iv: storedIv,
        });
      } catch {
        // Fallback: ciphertext blob = iv(12) + tag(16) + encrypted_data
        // WebCrypto AES-GCM expects ciphertext = encrypted_data + tag
        if (ciphertextBytes.length > 28) {
          const embeddedTag = ciphertextBytes.slice(12, 28);
          const encryptedData = ciphertextBytes.slice(28);
          // WebCrypto expects tag to be appended to ciphertext
          const webCryptoCiphertext = new Uint8Array(encryptedData.length + 16);
          webCryptoCiphertext.set(encryptedData, 0);
          webCryptoCiphertext.set(embeddedTag, encryptedData.length);
          const embeddedIv = ciphertextBytes.slice(0, 12);
          plaintext = await decryptPayload(aesKey, {
            ciphertext: webCryptoCiphertext,
            iv: embeddedIv,
          });
        } else {
          throw new Error('Ciphertext too short to decrypt');
        }
      }

      const plaintextHash = await sha256Bytes(plaintext);
      if (plaintextHash !== metadata.plaintextHash) {
        throw new Error('Plaintext hash mismatch — data integrity check failed');
      }

      const mimeType = metadata.mimeType ?? 'application/octet-stream';
      const fileName = metadata.fileName ?? `policy-${policy.policyId}`;
      const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
      return {
        plaintext: isText ? bytesToUtf8(plaintext) : null,
        downloadUrl: isText ? null : URL.createObjectURL(new Blob([bytesToArrayBuffer(plaintext)], { type: mimeType })),
        mimeType,
        fileName,
        plaintextHash,
      };
    },
    onMutate: () => {
      setUnlockError(null);
      if (decryptedResult?.downloadUrl) URL.revokeObjectURL(decryptedResult.downloadUrl);
      setDecryptedResult(null);
    },
    onSuccess: (result) => {
      setDecryptedResult(result);
      queryClient.invalidateQueries({ queryKey: ['ps-policy'] });
      // Auto-scroll to the decrypted data after a brief render delay
      setTimeout(() => {
        decryptedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Decryption failed';
      setUnlockError(msg);
    },
  });

  const providerIdentityQuery = useQuery({
    queryKey: [
      'policy-provider-identity',
      policy?.providerAddress,
      policy?.chainId,
      policy?.providerUaid ?? null,
    ],
    queryFn: () =>
      resolveProviderIdentity({
        providerAddress: policy!.providerAddress,
        chainId: policy!.chainId,
        policyProviderUaid: policy!.providerUaid ?? null,
      }),
    enabled: !!policy?.providerAddress,
    staleTime: 300_000,
  });

  if (!Number.isFinite(policyId) || policyId < 1) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <p style={{ color: 'var(--text-tertiary)' }}>Invalid policy ID.</p>
      </div>
    );
  }

  if (policyQuery.isLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="space-y-6">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-8 w-80" />
            <div className="skeleton h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--surface-0)' }}>
        <p style={{ color: 'var(--text-tertiary)' }}>Policy #{policyId} not found.</p>
        <Link href="/" className="text-sm hover:underline" style={{ color: 'var(--brand-blue)' }}>← Back to marketplace</Link>
      </div>
    );
  }

  const title = metadata?.title ?? `Policy #${policy.policyId}`;
  const description = metadata?.description ?? 'Receipt-gated encrypted finance data access';
  const timeAgo = formatTimeAgo(policy.confirmedAt ?? policy.createdAt);
  const fileSize = formatFileSize(metadata?.sizeBytes);
  const txUrl = buildTxUrl(policy.createdTxHash, policy.chainId);
  const policyVaultUrl = buildAddressUrl(policy.policyVaultAddress, policy.chainId);
  const paymentModuleUrl = buildAddressUrl(policy.paymentModuleAddress, policy.chainId);
  const providerAddressUrl = buildAddressUrl(policy.providerAddress, policy.chainId);
  const payoutAddressUrl = buildAddressUrl(policy.payoutAddress, policy.chainId);
  const explorerName = targetNetwork.shortName === 'Arbitrum' ? 'Arbiscan' : 'Robinhood explorer';

  const providerUaid = normalizeUaid(
    providerIdentityQuery.data?.uaid ??
      policy.providerUaid ??
      metadata?.providerUaid ??
      null,
  );
  const providerTrustEmbedUrl = providerUaid
    ? buildRegistryTrustEmbedUrl(providerUaid)
    : null;
  const providerProfileUrl = providerUaid
    ? buildRegistryAgentProfileUrl(providerUaid)
    : null;
  const providerAddressSearchUrl = buildRegistryAddressSearchUrl(
    policy.providerAddress,
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <Link href="/" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>Marketplace</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{title}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
          <div className="space-y-8 stagger">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: policy.active ? 'rgba(34,197,94,0.1)' : 'var(--surface-3)', color: policy.active ? 'var(--accent-green)' : 'var(--text-tertiary)' }}>
                    {policy.active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent-green)' }} />}
                    {policy.active ? 'Active' : policy.status}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: `${targetNetwork.color}1A`,
                      color: targetNetwork.color,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: targetNetwork.color }}
                    />
                    {targetNetwork.name}
                  </span>
                  {uaidGated && (
                    <span className="tag-subtle" style={{ color: 'var(--brand-blue)' }}>
                      UAID / ERC-8004 gated
                    </span>
                  )}
                  {timeAgo && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Listed {timeAgo}</span>}
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                    {(policy.providerUaid ?? 'A')[0].toUpperCase()}
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    {providerUaid
                      ? (providerUaid.length > 28 ? `${providerUaid.slice(0, 28)}…` : providerUaid)
                      : 'Anonymous provider'}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {description}
                </p>
              </div>

              {/* Purchase Conviction Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Dataset Type</dt>
                  <dd className="text-sm font-medium">{metadata?.mimeType || 'Application/JSON'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Access Delivery</dt>
                  <dd className="text-sm font-medium">Browser Decryption</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Token Rights</dt>
                  <dd className="text-sm font-medium" style={{ color: policy?.receiptTransferable ? 'var(--brand-blue)' : 'var(--text-primary)' }}>
                    {policy?.receiptTransferable ? 'Transferable Receipt' : 'Buyer-bound Receipt'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Time Limit</dt>
                  <dd className="text-sm font-medium">Perpetual (No expiry)</dd>
                </div>
              </div>
            </div>

            {/* ── Decrypted data — shown immediately after About when available ── */}
            {decryptedResult && (
              <div ref={decryptedRef} className="space-y-4" style={{ scrollMarginTop: '2rem' }}>
                <div className="surface-card-static p-5 space-y-4" style={{ borderColor: 'rgba(34,197,94,0.25)', boxShadow: '0 0 0 1px rgba(34,197,94,0.08), 0 4px 20px rgba(34,197,94,0.06)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full" style={{ background: 'rgba(34,197,94,0.1)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)' }}><polyline points="20 6 9 17 4 12" /></svg>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">Decrypted Successfully</h3>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Integrity verified — plaintext hash matches on-chain commitment</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="tag-subtle" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)' }}>✓ Key issued</span>
                    <span className="tag-subtle" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)' }}>✓ Hash verified</span>
                    <span className="tag-subtle">{decryptedResult.mimeType}</span>
                    <span className="tag-subtle">{decryptedResult.fileName}</span>
                  </div>
                  <div className="rounded-lg p-2.5 flex items-center gap-2 text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span className="font-semibold shrink-0" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>SHA-256:</span>
                    <span className="truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }} title={decryptedResult.plaintextHash}>{decryptedResult.plaintextHash}</span>
                  </div>
                </div>

                {decryptedResult.plaintext ? (
                  <DecryptedDataDisplay plaintext={decryptedResult.plaintext} />
                ) : decryptedResult.downloadUrl ? (
                  <a href={decryptedResult.downloadUrl} download={decryptedResult.fileName} className="btn-primary no-underline inline-flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Download {decryptedResult.fileName}
                  </a>
                ) : null}

                {/* Post-Unlock Guidance */}
                {(decryptedResult.plaintext || decryptedResult.downloadUrl) && (
                  <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Next Steps</h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <button className="flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-[var(--surface-2)]" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(85,153,254,0.1)', color: 'var(--brand-blue)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        </div>
                        <div>
                          <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Export to Application</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Download to your local machine</p>
                        </div>
                      </button>
                      <button className="flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-[var(--surface-2)]" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--brand-purple)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        <div>
                          <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Agent Context Run</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Inject payload into MCP session</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                  Issuer Trust &amp; Reputation
                </h2>
                {providerProfileUrl ? (
                  <a
                    href={providerProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--brand-blue)' }}
                  >
                    Open full agent profile ↗
                  </a>
                ) : (
                  <a
                    href={providerAddressSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--brand-blue)' }}
                  >
                    Search seller address in registry ↗
                  </a>
                )}
              </div>
              <TrustEmbedSection
                embedUrl={providerTrustEmbedUrl}
                profileUrl={providerProfileUrl}
                addressSearchUrl={providerAddressSearchUrl}
                providerUaid={providerUaid}
              />
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Dataset Specification</h2>
              <div className="rounded-xl p-5 mb-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2 text-[11px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    <span>{metadata?.mimeType || 'application/octet-stream'}</span>
                    <span>•</span>
                    <span>{fileSize || 'Unknown size'}</span>
                    <span>•</span>
                    <span>AES-256-GCM Encrypted Payload</span>
                  </div>
                  
                  {metadata?.fileName && (
                    <div>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>File Pattern: </span>
                      <span className="text-[13px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{metadata.fileName}</span>
                    </div>
                  )}

                  <div className="rounded-lg p-4" style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Schema Preview</span>
                    </div>
                    {metadata?.schema ? (
                      <pre className="text-[11px] overflow-auto whitespace-pre-wrap" style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-blue)' }}>
                        {JSON.stringify(metadata.schema, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                        Provider did not upload a rigid JSON schema. The payload format is described in the main description above. Decryption will verify the exact SHA-256 plaintext hash before rendering.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* P0 #2 — Receipt Properties */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Access Receipt Properties</h2>
              <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                {[
                  {
                    icon: policy?.receiptTransferable ? '🔄' : '🔒',
                    label: policy?.receiptTransferable ? 'Transferable' : 'Buyer-Bound',
                    desc: policy?.receiptTransferable
                      ? 'This policy mints a transferable ERC-721. Moving the token moves live access to the new holder.'
                      : 'This policy mints a buyer-bound ERC-721. Transfers revert, so live access stays with the original buyer wallet.',
                    color: policy?.receiptTransferable ? 'var(--brand-blue)' : 'var(--accent-red)',
                  },
                  {
                    icon: '⛓️',
                    label: 'On-Chain Proof',
                    desc: 'Receipt stores ciphertextHash + keyCommitment on-chain. Acts as a durable audit trail — receipt = historical proof, PaymentModule = runtime authorization.',
                    color: 'var(--brand-blue)',
                  },
                  {
                    icon: '🔑',
                    label: 'Runtime-Checked Key Release',
                    desc: 'Key Release Service validates both a signed buyer request AND active on-chain entitlement state before delivering the buyer-bound key envelope.',
                    color: 'var(--brand-green)',
                  },
                ].map((prop) => (
                  <div key={prop.label} className="flex items-start gap-3">
                    <span className="text-base shrink-0 mt-0.5">{prop.icon}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{prop.label}</p>
                      <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{prop.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* P1 #7 — ERC-8004 / UAID Checks (shown when UAID-gated) */}
            {uaidGated && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Agent Identity Enforcement (ERC-8004)</h2>
                <div className="rounded-xl p-4 space-y-2" style={{ border: '1px solid rgba(85,153,254,0.15)', background: 'rgba(85,153,254,0.03)' }}>
                  <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    This policy enforces agent identity ownership. Three on-chain checks must pass at purchase time:
                  </p>
                  {[
                    {
                      check: 'UAID String Required',
                      desc: 'Buyer must supply a non-empty UAID string at purchase time.',
                    },
                    {
                      check: 'UAID Hash Match',
                      desc: 'The keccak256 hash of the buyer\'s UAID must match the policy\'s required UAID hash.',
                    },
                    {
                      check: 'ERC-8004 Ownership',
                      desc: 'Buyer\'s wallet must own the required agentId in the IdentityRegistry (ERC-721 based ERC-8004 singleton).',
                    },
                  ].map((item) => (
                    <div key={item.check} className="flex items-start gap-2">
                      <span className="text-xs mt-0.5" style={{ color: 'var(--brand-blue)' }}>✓</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{item.check}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {policy.conditions.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                  Purchase Eligibility
                </h2>
                <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                  <ul className="space-y-3">
                    {policy.conditions.map((condition) => {
                      let humanSummary = '';
                      let icon = '•';
                      if (!condition.descriptor) {
                        humanSummary = 'Must pass custom smart contract logic.';
                        icon = '⚙️';
                      } else if (condition.descriptor.kind === 'time-range') {
                        humanSummary = 'Must be purchased within the specified time window.';
                        icon = '🕒';
                      } else if (condition.descriptor.kind === 'uaid-ownership') {
                        humanSummary = `Only the wallet actively owning agent #${condition.descriptor.agentId || 'specified'} can purchase.`;
                        icon = '🤖';
                      } else if (condition.descriptor.kind === 'evm-allowlist') {
                        humanSummary = 'Only specific allowlisted wallets are authorized to purchase.';
                        icon = '📋';
                      } else {
                        humanSummary = condition.descriptor.description || 'Must satisfy custom policy requirements.';
                        icon = '⚙️';
                      }
                      return (
                        <li key={condition.index} className="flex items-start gap-3">
                          <span className="text-sm mt-0.5">{icon}</span>
                          <span className="text-[13px] font-medium leading-relaxed" style={{ color: 'var(--text-primary)' }}>{humanSummary}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="space-y-3 pt-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                    Technical Evaluators
                  </h2>
                <div className="space-y-2">
                  {policy.conditions.map((condition) => (
                    <div
                      key={`${condition.index}-${condition.evaluatorAddress}`}
                      className="rounded-xl p-4"
                      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{describeConditionKind(condition)}</p>
                        <span className="tag-subtle">
                          Witness: {formatWitnessLabel(condition.runtimeWitness)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {describeConditionSummary(condition)}
                      </p>
                      <p className="mt-2 text-[11px] truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        Evaluator: {condition.evaluatorAddress}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            ) : null}

            <div>
              <button type="button" onClick={() => setShowProof((p) => !p)} className="flex items-center gap-2 text-sm font-medium cursor-pointer bg-transparent border-none" style={{ color: 'var(--text-tertiary)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showProof ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6" /></svg>
                On-chain proof
              </button>
              {showProof && (
                <div className="mt-3 rounded-xl p-4 space-y-2 text-sm" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                  {[
                    { label: 'Chain', value: `${targetNetwork.name} (${policy.chainId})` },
                    { label: 'Policy id', value: String(policy.policyId) },
                    { label: 'Ciphertext hash', value: policy.ciphertextHash },
                    { label: 'Key commitment', value: policy.keyCommitment },
                    { label: 'Metadata hash', value: policy.metadataHash },
                    { label: 'Policy vault', value: policy.policyVaultAddress },
                    { label: 'Payment module', value: policy.paymentModuleAddress },
                    { label: 'Provider payout', value: policy.payoutAddress },
                    { label: 'Provider wallet', value: policy.providerAddress },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <span className="shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                      <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {txUrl && <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>Creation tx ↗</a>}
                    {policyVaultUrl && <a href={policyVaultUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>PolicyVault ↗</a>}
                    {paymentModuleUrl && <a href={paymentModuleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>PaymentModule ↗</a>}
                    {providerAddressUrl && <a href={providerAddressUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>Provider ↗</a>}
                    {payoutAddressUrl && <a href={payoutAddressUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>Payout ↗</a>}
                  </div>
                </div>
              )}
            </div>


          </div>

          {/* ── Right — Action Panel ── */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="surface-card-static p-6 space-y-5">
              <div>
                <p className="text-3xl font-semibold tracking-tight">{priceLabel}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Settles on {targetNetwork.name}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Explorer: {explorerName}
                </p>
              </div>

              {isProvider && (
                /* ── Provider / Publisher view ── */
                <div className="space-y-3 mb-6">
                  <div className="rounded-xl p-4" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.06)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-blue)' }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <span className="text-sm font-semibold" style={{ color: 'var(--brand-blue)' }}>You published this dataset</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Your connected wallet matches the provider address for this policy. You can still test the purchase and unlock flow below.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Buyer view ── */}
              <>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Readiness Check</h3>
                  <div className="space-y-3 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Wallet Connected</span>
                      {isConnected ? <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>✓ Ready</span> : <span className="font-semibold" style={{ color: 'var(--accent-red)' }}>Missing</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                      {isConnected ? (!chainMismatch ? <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>✓ {targetNetwork.name}</span> : <span className="font-semibold" style={{ color: 'var(--accent-amber)' }}>{targetNetwork.name} Required</span>) : <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </div>
                    {uaidGated && (
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Agent Identity</span>
                        <span className="font-semibold" style={{ color: 'var(--brand-blue)' }}>ERC-8004 Verification</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Policy Evaluators</span>
                      <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>✓ {evaluatorCount} passing</span>
                    </div>
                  </div>
                </div>

                <div className="h-px w-full my-6" style={{ background: 'var(--border)' }} />

                <div className="flex items-center gap-1.5 pb-2">
                  {[
                    { label: 'Execute', done: hasPurchased || purchaseMutation.isPending, active: purchaseMutation.isPending },
                    { label: 'Receipt', done: hasReceipt, active: false },
                    { label: 'Decrypt', done: !!decryptedResult, active: unlockMutation.isPending },
                  ].map((step, i) => (
                    <div key={step.label} className="flex items-center gap-1.5">
                      {i > 0 && <div className="h-px w-6" style={{ background: step.done ? 'var(--accent-green)' : 'var(--border)' }} />}
                      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: step.active ? 'rgba(85,153,254,0.1)' : step.done ? 'rgba(34,197,94,0.1)' : 'var(--surface-3)', color: step.active ? 'var(--brand-blue)' : step.done ? 'var(--accent-green)' : 'var(--text-tertiary)' }}>
                        {step.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        {step.active && <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>}
                        {step.label}
                      </div>
                    </div>
                  ))}
                </div>

                {!isConnected && (
                  <div className="rounded-xl p-5 text-center space-y-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Connect wallet to purchase</p>
                    <ConnectButton />
                  </div>
                )}
                
                {isConnected && chainMismatch && (
                  <div className="rounded-lg p-3 text-xs font-medium" style={{ border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: 'var(--accent-amber)' }}>
                    Wallet network mismatch. Switch to chain {policy.chainId} ({targetNetwork.shortName}) before purchasing.
                  </div>
                )}
              </>

              <div className="space-y-3">
                {purchaseConditionFields.length > 0 && (
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Purchase Witnesses
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Runtime witness values are passed to policy evaluators during purchase.
                      </p>
                    </div>
                    {purchaseConditionFields.map((condition) => {
                      const label =
                        condition.runtimeWitness.kind === 'buyer-uaid'
                          ? condition.runtimeWitness.label ?? 'Buyer UAID'
                          : condition.runtimeWitness.kind === 'utf8' ||
                              condition.runtimeWitness.kind === 'hex'
                            ? condition.runtimeWitness.label
                            : `Condition ${condition.index + 1}`;
                      const placeholder =
                        condition.runtimeWitness.kind === 'buyer-uaid'
                          ? 'uaid:...'
                          : condition.runtimeWitness.kind === 'hex'
                            ? condition.runtimeWitness.placeholder ?? '0x...'
                            : condition.runtimeWitness.kind === 'utf8'
                              ? condition.runtimeWitness.placeholder ?? 'Enter value'
                              : 'Enter value';

                      return (
                        <div key={condition.index}>
                          <label
                            className="mb-1 block text-xs font-semibold"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {label}
                          </label>
                          <input
                            type="text"
                            value={conditionInputs[condition.index] ?? ''}
                            onChange={(event) =>
                              setConditionInputs((current) => ({
                                ...current,
                                [condition.index]: event.target.value,
                              }))
                            }
                            placeholder={placeholder}
                            className="input-field"
                            style={{
                              fontFamily:
                                condition.runtimeWitness.kind === 'buyer-uaid' ||
                                condition.runtimeWitness.kind === 'hex'
                                  ? 'var(--font-mono)'
                                  : undefined,
                            }}
                          />
                          {condition.runtimeWitness.kind === 'buyer-uaid' && buyerIdentityQuery.data?.uaid && (
                            <button
                              type="button"
                              onClick={() =>
                                setConditionInputs((current) => ({
                                  ...current,
                                  [condition.index]: buyerIdentityQuery.data.uaid!,
                                }))
                              }
                              className="mt-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                              style={{ color: 'var(--brand-purple)', background: 'rgba(168,85,247,0.1)' }}
                            >
                              <span className="text-sm">🤖</span> Use my Agent Identity
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!hasPurchased && (
                  <button
                    onClick={() => purchaseMutation.mutate()}
                    disabled={
                      purchaseMutation.isPending ||
                      !isConnected ||
                      !policy.policyId ||
                      chainMismatch
                    }
                    className="btn-primary w-full"
                  >
                    {purchaseMutation.isPending ? 'Purchasing…' : `Purchase for ${priceLabel}`}
                  </button>
                )}

                {hasPurchased && !decryptedResult && (
                  <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)', flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>
                      {keyReleaseReady
                        ? 'Access receipt on-chain — ready to unlock'
                        : 'Access receipt on-chain — waiting for off-chain payload indexing'}
                    </span>
                  </div>
                )}

                {hasPurchased && !decryptedResult && keyReleaseReady && (
                  <button
                    onClick={() => unlockMutation.mutate()}
                    disabled={
                      unlockMutation.isPending ||
                      !isConnected ||
                      !policy.policyId ||
                      chainMismatch
                    }
                    className="btn-primary w-full"
                  >
                    {unlockMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                        Generating keys & decrypting…
                      </span>
                    ) : 'Unlock & Decrypt Data'}
                  </button>
                )}

                {hasPurchased && !decryptedResult && !keyReleaseReady && (
                  <div className="rounded-lg p-3 text-xs" style={{ border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: 'var(--accent-amber)' }}>
                    This policy exists on-chain, but the encrypted payload has not been indexed into the key release service yet. Purchase is provable, but browser decryption is not available until the provider publishes the off-chain payload.
                  </div>
                )}

                {decryptedResult && (
                  <button
                    type="button"
                    onClick={() => decryptedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="w-full rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    style={{ border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)', flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>View Decrypted Data ↑</span>
                  </button>
                )}
              </div>

              {purchaseTxHash && (
                <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Purchase tx: <a href={buildTxUrl(purchaseTxHash, policy.chainId) ?? '#'} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>View on {explorerName} ↗</a>
                </p>
              )}

              {unlockError && (
                <div className="rounded-lg p-3 text-xs" style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', color: 'var(--accent-red)' }}>
                  {unlockError}
                </div>
              )}

              {!hasPurchased && !decryptedResult && (
                <p className="text-center text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  Purchase creates an on-chain receipt. Then unlock to retrieve the AES key and decrypt the data in your browser.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
