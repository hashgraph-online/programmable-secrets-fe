'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

/* ── Inline SVG icons ── */
function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}
function IconTerminal() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconExternalLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── Code Block component ── */
function CodeBlock({ title, children }: { title: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <IconTerminal />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{title}</span>
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md cursor-pointer bg-transparent border-none transition-colors" style={{ color: copied ? 'var(--brand-green)' : 'var(--text-tertiary)' }}>
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm leading-relaxed overflow-x-auto" style={{ margin: 0, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

/* ── Dropdown Link ── */
function DropdownLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const Tag = external ? 'a' : Link;
  return (
    <Tag
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
      {external && <IconExternalLink />}
    </Tag>
  );
}

/* ── Path Card ── */
function PathCard({
  icon, label, title, description, active, onClick, accentColor,
}: {
  icon: React.ReactNode; label: string; title: string; description: string;
  active: boolean; onClick: () => void; accentColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full p-6 rounded-2xl cursor-pointer transition-all duration-200"
      style={{
        border: active ? `2px solid ${accentColor}` : '2px solid var(--border)',
        background: active ? `${accentColor}08` : 'var(--surface-1)',
        boxShadow: active ? `0 0 20px ${accentColor}12` : 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: `${accentColor}15`, color: accentColor }}>
          {icon}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accentColor }}>{label}</span>
      </div>
      <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
    </button>
  );
}

/* ── Main Page ── */
export default function AgentsPage() {
  const [path, setPath] = useState<'human' | 'agent'>('agent');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const skillFileUrl = 'https://raw.githubusercontent.com/hashgraph-online/programmable-secrets-skill/main/SKILL.md';
  const registryUrl = 'https://hol.org/registry/skills/programmable-secrets';
  const githubUrl = 'https://github.com/hashgraph-online/programmable-secrets-skill';
  const npmUrl = 'https://www.npmjs.com/package/skill-publish';

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      <div className="mx-auto max-w-5xl px-6 py-12">

        {/* ── Breadcrumb ── */}
        <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <Link href="/" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>Marketplace</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Agentic Access</span>
        </nav>

        {/* ── Hero ── */}
        <div className="mb-12 stagger">
          <div className="relative inline-block text-left mb-6 z-30">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="inline-flex items-center gap-3 px-4 py-2 rounded-full cursor-pointer text-sm font-semibold tracking-wider transition-colors bg-transparent"
              style={{
                border: '1px solid rgba(85, 153, 254, 0.3)',
                background: 'rgba(85, 153, 254, 0.06)',
                color: 'var(--brand-blue)',
                fontFamily: 'var(--font-mono)',
              }}
              type="button"
            >
              <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--brand-blue)' }} />
              SKILL
              <IconChevron open={isDropdownOpen} />
            </button>

            {isDropdownOpen && (
              <div
                className="absolute left-0 mt-2 w-72 rounded-xl shadow-2xl overflow-hidden animate-in"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              >
                <div className="py-1">
                  <DropdownLink href={registryUrl} external>
                    <IconShield /> View on HOL Registry
                  </DropdownLink>
                  <DropdownLink href={githubUrl} external>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                    GitHub Repository
                  </DropdownLink>
                  <DropdownLink href={npmUrl} external>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0h-2.666v1.336H8.001V8.667h2.667v5.331zm12-5.331v4h-1.332v-4h-1.338v4h-1.33v-4h-1.336v4h-1.33V8.667h6.666z" /></svg>
                    skill-publish on npm
                  </DropdownLink>
                  <div className="h-px" style={{ background: 'var(--border)' }} />
                  <DropdownLink href={skillFileUrl} external>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                    Download SKILL.md
                  </DropdownLink>
                  <DropdownLink href="/">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    Back to Marketplace
                  </DropdownLink>
                </div>
              </div>
            )}
          </div>

          <h1 className="mb-4 tracking-tight" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.1 }}>
            Programmable Secrets
            <br />
            <span className="text-gradient-brand">for Agentic Access</span>
          </h1>

          <p className="max-w-2xl leading-relaxed mb-2" style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
            Whether you&apos;re a developer building agent workflows or an autonomous agent consuming encrypted datasets — choose your path below.
          </p>

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <a href={registryUrl} target="_blank" rel="noreferrer" className="tag-brand no-underline">
              <IconShield /> Verified on HOL Registry
            </a>
            <span className="tag-green">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-green)' }} />
              v1.0.0
            </span>
            <span className="tag-subtle">Apache-2.0</span>
          </div>
        </div>

        {/* ── Path Selector ── */}
        <div className="grid gap-4 sm:grid-cols-2 mb-12">
          <PathCard
            icon={<IconBot />}
            label="Agent Path"
            title="I'm an Agent"
            description="Install the verified skill via npx skill-publish, resolve canonical URLs, and hand off to your agent runtime."
            active={path === 'agent'}
            onClick={() => setPath('agent')}
            accentColor="var(--brand-blue)"
          />
          <PathCard
            icon={<IconUser />}
            label="Human Path"
            title="I'm a Developer"
            description="Human building agent workflows, deploying operators, or integrating the Programmable Secrets stack."
            active={path === 'human'}
            onClick={() => setPath('human')}
            accentColor="var(--brand-purple)"
          />
        </div>

        {/* ── Content: Agent Path ── */}
        {path === 'agent' && (
          <div className="space-y-8 stagger">
            <div className="surface-card-static p-6 sm:p-8">
              <h2 className="text-sm uppercase tracking-wider mb-6" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                Quick Start — Install the Skill
              </h2>

              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>1. Get pinned install URLs</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Use <code style={{ color: 'var(--brand-blue)', background: 'rgba(85,153,254,0.08)', padding: '1px 4px', borderRadius: '4px' }}>npx skill-publish</code> to resolve the canonical, version-pinned resolver URLs. No clone or local files needed:
                  </p>
                  <CodeBlock title="terminal">{`# Get all install URLs for programmable-secrets v1.0.0
npx skill-publish install-url \\
  --name programmable-secrets \\
  --version 1.0.0

# Get just the pinned SKILL.md resolver URL
npx skill-publish install-url \\
  --name programmable-secrets \\
  --version 1.0.0 \\
  --format pinned-skill-md

# Machine-readable JSON with all URLs
npx skill-publish install-url \\
  --name programmable-secrets \\
  --version 1.0.0 \\
  --json`}</CodeBlock>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>2. Or use the canonical HRL directly</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    The immutable on-chain reference for this skill. Paste into any runtime or config that accepts HCS Resource Locators:
                  </p>
                  <CodeBlock title="skill-hrl.txt">{`hcs://1/0.0.10352904`}</CodeBlock>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>3. Generate distribution assets</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Generate badges, README snippets, and the full attested distribution kit for embedding:
                  </p>
                  <CodeBlock title="terminal">{`# Badge for docs or README
npx skill-publish badge \\
  --name programmable-secrets \\
  --version 1.0.0

# README install snippet
npx skill-publish readme-snippet \\
  --name programmable-secrets \\
  --version 1.0.0

# Full attested distribution kit (JSON)
npx skill-publish attested-kit \\
  --name programmable-secrets \\
  --version 1.0.0 \\
  --format json

# Release notes
npx skill-publish release-notes \\
  --name programmable-secrets \\
  --version 1.0.0`}</CodeBlock>
                </div>

                <div className="p-4 rounded-xl" style={{ border: '1px solid rgba(85,153,254,0.15)', background: 'rgba(85,153,254,0.04)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--brand-blue)' }}>💡 How it works:</strong>{' '}
                    The pinned SKILL.md resolver URL returns the full operator instructions. Your agent reads those instructions and follows them to run the Programmable Secrets CLI (<code style={{ color: 'var(--brand-blue)' }}>npx programmable-secret</code>). All contract commands, guided workflows, and operator rules are documented in the SKILL.md itself.
                  </p>
                </div>
              </div>
            </div>

            {/* Canonical URLs reference card */}
            <div className="surface-card-static p-6 sm:p-8">
              <h2 className="text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                Canonical References
              </h2>
              <div className="space-y-3">
                {[
                  ['Registry Page', 'https://hol.org/registry/skills/programmable-secrets'],
                  ['HRL (on-chain)', 'hcs://1/0.0.10352904'],
                  ['Directory Topic', '0.0.10273101'],
                  ['Package Topic', '0.0.10352904'],
                  ['npm', 'npx skill-publish'],
                ].map(([label, value], i) => (
                  <div key={i}>
                    {i > 0 && <div className="h-px mb-3" style={{ background: 'var(--border)' }} />}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                      <span className="text-xs font-semibold shrink-0 w-32" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <code className="text-xs break-all" style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}>{value}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Wallet-first setup */}
            <div className="surface-card-static p-6 sm:p-8">
              <h2 className="text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                Wallet-First Bootstrap (Optional)
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                If you need to publish your own skills or manage credits, bootstrap with your Hedera wallet:
              </p>
              <CodeBlock title="terminal">{`# Create API key via ledger challenge and fund credits
npx skill-publish setup \\
  --account-id 0.0.12345 \\
  --hedera-private-key <key> \\
  --hbar 5

# Check your credentials
npx skill-publish whoami

# Check credit balance
npx skill-publish credits`}</CodeBlock>
            </div>
          </div>
        )}

        {/* ── Content: Human/Developer Path ── */}
        {path === 'human' && (
          <div className="space-y-8 stagger">
            <div className="surface-card-static p-6 sm:p-8">
              <h2 className="text-sm uppercase tracking-wider mb-6" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                Quick Start — Developer Mode
              </h2>

              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>1. Use the marketplace UI</p>
                  <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                    The simplest path — connect your wallet and interact with the visual marketplace.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link href="/" className="btn-primary no-underline text-sm" style={{ padding: '10px 20px' }}>
                      Open Marketplace
                    </Link>
                    <Link href="/provider" className="btn-outline no-underline text-sm" style={{ padding: '10px 20px' }}>
                      Publish a Dataset
                    </Link>
                  </div>
                </div>

                <div className="h-px" style={{ background: 'var(--border)' }} />

                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>2. Or use the CLI interactively</p>
                  <CodeBlock title="terminal">{`# Install and explore
npx programmable-secret help

# Interactive guided setup
npx programmable-secret init
npx programmable-secret doctor`}</CodeBlock>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>3. Register a dataset as a provider</p>
                  <CodeBlock title="terminal">{`# Register a new dataset
npx programmable-secret datasets register \\
  --provider-uaid "did:uaid:hol:quantlab?uid=quantlab&registry=hol&proto=hol&nativeId=quantlab" \\
  --metadata-json '{"title":"TSLA Vol Surface"}' \\
  --ciphertext "encrypted payload" \\
  --key-material "wrapped key"

# Create a time-bound access policy
npx programmable-secret policies create-timebound \\
  --dataset-id 1 \\
  --price-eth 0.00001 \\
  --duration-hours 24 \\
  --metadata-json '{"title":"24 hour access"}'`}</CodeBlock>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>4. Create UAID-gated access for specific agents</p>
                  <CodeBlock title="terminal">{`# Create a policy that requires a specific buyer UAID
npx programmable-secret policies create-uaid \\
  --dataset-id 1 \\
  --price-eth 0.00001 \\
  --duration-hours 24 \\
  --required-buyer-uaid uaid:aid:... \\
  --agent-id 97

# Register an ERC-8004 identity for your agent
npx programmable-secret identity register \\
  --agent-uri https://hol.org/agents/my-trading-agent`}</CodeBlock>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>5. Manage and export</p>
                  <CodeBlock title="terminal">{`# Export datasets and policies for backup/migration
npx programmable-secret datasets export --dataset-id 1 --output dataset-1.json
npx programmable-secret policies export --policy-id 1 --output policy-1.json

# Update policy pricing
npx programmable-secret policies update --policy-id 1 --price-eth 0.00002 --active true

# Manage access allowlists
npx programmable-secret policies allowlist --policy-id 1 --accounts 0xabc,0xdef --allowed true`}</CodeBlock>
                </div>
              </div>
            </div>

            {/* KRS Helpers */}
            <div className="surface-card-static p-6 sm:p-8">
              <h2 className="text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                Local KRS Helpers
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                The Key Release Service (KRS) bundle helpers let you encrypt, verify, and decrypt data locally:
              </p>
              <CodeBlock title="terminal">{`# Encrypt data into a KRS bundle
npx programmable-secret krs encrypt \\
  --plaintext '{"signal":"buy","market":"TSLA"}' \\
  --output bundle.json

# Verify bundle against an on-chain policy
npx programmable-secret krs verify \\
  --bundle-file bundle.json \\
  --policy-id 1 \\
  --buyer 0x...

# Decrypt the bundle
npx programmable-secret krs decrypt --bundle-file bundle.json`}</CodeBlock>
            </div>
          </div>
        )}

        {/* ── Bottom CTA ── */}
        <div className="mt-16 mb-8 text-center">
          <div className="surface-card-static p-8 sm:p-12">
            <h2 className="text-xl font-semibold mb-3">Ready to get started?</h2>
            <p className="text-sm mb-6 max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Explore the verified skill on the HOL Registry, browse the source on GitHub, or jump straight into the marketplace.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={registryUrl} target="_blank" rel="noreferrer" className="btn-primary no-underline inline-flex items-center gap-2">
                <IconShield /> HOL Registry <IconExternalLink />
              </a>
              <a href={githubUrl} target="_blank" rel="noreferrer" className="btn-outline no-underline inline-flex items-center gap-2">
                GitHub <IconExternalLink />
              </a>
              <Link href="/" className="btn-outline no-underline">
                Marketplace
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
