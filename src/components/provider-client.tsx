'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery } from '@tanstack/react-query';
import { formatEther, getAddress, parseEther, keccak256, toBytes } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { createPublicClient, http } from 'viem';
import { robinhoodTestnet, buildTxUrl } from '@/lib/contracts/chain';
import { POLICY_VAULT_ABI, POLICY_VAULT_ADDRESS } from '@/lib/contracts/abi';
import { getNetworkMeta } from '@/lib/contracts/networks';

import { broker } from '@/lib/api/broker';
import type { ProgrammableSecretsConditionDescriptor } from '@/lib/server/policy-conditions';
import {
  generateAesKey,
  exportAesKeyBase64,
  encryptPayload,
  packageFile,
  bytesToBase64,
  hashMetadata,
  type PolicyMetadata,
} from '@/lib/crypto';

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
type Step = 'packaging' | 'targeting' | 'preflight' | 'done';

type UIRuleKind = 'time-range' | 'uaid-ownership' | 'evm-allowlist' | 'custom-static';

interface UIRule {
  id: string;
  kind: UIRuleKind;
  // time
  startDate?: string;
  endDate?: string;
  // allowlist
  addresses?: string;
  // uaid
  requiredBuyerUaid?: string;
  agentTokenId?: string;
  // custom
  evaluatorAddress?: string;
  configHex?: string;
}

interface ProviderIdentityResolution {
  uaid: string | null;
  source: 'policy-uaid' | 'registry-search' | 'none';
}

async function resolveProviderIdentity(params: {
  providerAddress: string;
  chainId: number;
}): Promise<ProviderIdentityResolution> {
  const url = new URL('/api/ps/provider-identity', window.location.origin);
  url.searchParams.set('providerAddress', params.providerAddress);
  url.searchParams.set('chainId', String(params.chainId));
  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve provider identity (${response.status})`);
  }
  return (await response.json()) as ProviderIdentityResolution;
}

/* ═══════════════════════════════════════════
   UI COMPONENTS 
   ═══════════════════════════════════════════ */
function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
      {subtitle && <p className="text-sm mt-1 text-[var(--text-secondary)]">{subtitle}</p>}
    </div>
  );
}

function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-[var(--brand-blue)] hover:shadow-md hover:bg-[var(--surface-0)]' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent transition-shadow ${props.className || ''}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent transition-shadow resize-y ${props.className || ''}`}
    />
  );
}

function Label({ children, required, description }: { children: React.ReactNode; required?: boolean; description?: string }) {
  return (
    <div className="mb-2">
      <label className="block text-sm font-semibold text-[var(--text-primary)]">
        {children} {required && <span className="text-[var(--text-tertiary)] font-normal text-xs ml-1">— required</span>}
      </label>
      {description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>}
    </div>
  );
}

function Badge({ children, color = 'blue' }: { children: React.ReactNode; color?: 'blue' | 'green' | 'purple' | 'amber' | 'gray' }) {
  const colors = {
    blue: 'bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] border-[var(--brand-blue)]/20',
    green: 'bg-[var(--brand-green)]/10 text-[var(--brand-green)] border-[var(--brand-green)]/20',
    purple: 'bg-[var(--brand-purple)]/10 text-[var(--brand-purple)] border-[var(--brand-purple)]/20',
    amber: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
    gray: 'bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border)]'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colors[color]}`}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export function ProviderClient() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const providerIdentityQuery = useQuery({
    queryKey: ['provider-identity', address ?? null, chainId ?? robinhoodTestnet.id],
    queryFn: () =>
      resolveProviderIdentity({
        providerAddress: address ?? '',
        chainId: chainId ?? robinhoodTestnet.id,
      }),
    enabled: Boolean(address),
    staleTime: 300_000,
  });

  const providerUaid = useMemo(
    () => providerIdentityQuery.data?.uaid?.trim() ?? '',
    [providerIdentityQuery.data?.uaid],
  );
  const providerIdentityLoading = providerIdentityQuery.isLoading;
  const providerIdentityResolved = providerUaid.length > 0;


  const connectedNetwork = useMemo(() => getNetworkMeta(chainId), [chainId]);
  const publicClient = useMemo(() => createPublicClient({ chain: robinhoodTestnet, transport: http() }), []);

  // -- Wizard State --
  const [step, setStep] = useState<Step>('packaging');
  
  // -- Step 1: Packaging & Price --
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceEth, setPriceEth] = useState('0.005');
  const [receiptTransferable, setReceiptTransferable] = useState(false);
  const dropRef = useRef<HTMLLabelElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // -- Step 2: Targeting / Policy --
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [rawConditionJson, setRawConditionJson] = useState('[]');
  const [uiRules, setUiRules] = useState<UIRule[]>([]);

  // -- Step 3 & 4: Publish State --
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState<number | null>(null);

  let providerIdentityIndicatorClass = 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]';
  if (providerIdentityLoading) {
    providerIdentityIndicatorClass = 'bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]';
  } else if (providerIdentityResolved) {
    providerIdentityIndicatorClass = 'bg-[var(--brand-green)]/10 text-[var(--brand-green)]';
  }
  let providerIdentityMessage = 'No canonical UAID found for this wallet';
  if (providerIdentityLoading) {
    providerIdentityMessage = 'Resolving provider identity…';
  } else if (providerIdentityResolved) {
    providerIdentityMessage = 'Resolved from Registry Broker';
  }
  const publishDisabled = isPublishing || !providerIdentityResolved;
  let publishButtonLabel = 'Resolve UAID Before Publishing';
  if (isPublishing) {
    publishButtonLabel = 'Signing and Executing...';
  } else if (providerIdentityResolved) {
    publishButtonLabel = 'Sign & Publish Product';
  }

  // Preflight validation checks
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (address && publicClient) {
      publicClient.getBalance({ address }).then(setEthBalance).catch(() => {});
    }
  }, [address, publicClient]);

  // Evaluator helpers
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  }, [title]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  }, [title]);

  const addRule = (kind: UIRuleKind) => {
    setUiRules(prev => [...prev, { id: Math.random().toString(36).substring(7), kind }]);
  };

  const removeRule = (id: string) => {
    setUiRules(prev => prev.filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<UIRule>) => {
    setUiRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  // Convert UI rules to expected backend conditions
  const generateConditions = (): ProgrammableSecretsConditionDescriptor[] => {
    if (isAdvancedMode) {
      try {
        const raw = JSON.parse(rawConditionJson);
        if (Array.isArray(raw)) return raw;
      } catch { /* ignore */ }
      return [];
    }

    const conditions: ProgrammableSecretsConditionDescriptor[] = [];
    for (const r of uiRules) {
      if (r.kind === 'time-range') {
        const notBefore = r.startDate ? Math.floor(new Date(r.startDate).getTime() / 1000) : null;
        const notAfter = r.endDate ? Math.floor(new Date(r.endDate).getTime() / 1000) : null;
        if (notBefore || notAfter) {
          conditions.push({ kind: 'time-range', notBeforeUnix: notBefore, notAfterUnix: notAfter });
        }
      } else if (r.kind === 'evm-allowlist') {
        if (r.addresses) {
          const list = r.addresses.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
          if (list.length > 0) {
            conditions.push({ kind: 'evm-allowlist', allowlistedBuyerAddresses: list });
          }
        }
      } else if (r.kind === 'uaid-ownership') {
        if (r.requiredBuyerUaid) {
          conditions.push({
            kind: 'uaid-ownership',
            requiredBuyerUaid: r.requiredBuyerUaid,
            agentId: r.agentTokenId ? Number.parseInt(r.agentTokenId, 10) : null
          });
        }
      } else if (r.kind === 'custom-static') {
        if (r.evaluatorAddress && r.configHex) {
          conditions.push({
            kind: 'custom-static',
            evaluatorAddress: r.evaluatorAddress,
            configDataHex: r.configHex
          });
        }
      }
    }
    return conditions;
  };

  const handlePublish = useCallback(async () => {
    if (!file || !walletClient || !address || !providerUaid) return;
    setIsPublishing(true);
    setError(null);

    try {
      const conditions = generateConditions();
      const pkg = await packageFile(file);
      const aesKey = await generateAesKey();
      const contentKeyB64 = await exportAesKeyBase64(aesKey);
      const encrypted = await encryptPayload(aesKey, pkg.plaintextBytes);
      const ciphertextBase64 = bytesToBase64(encrypted.ciphertext);

      const priceWei = parseEther(priceEth || '0').toString();

      const metadata: PolicyMetadata = {
        title: title || pkg.fileName,
        description: description || undefined,
        fileName: pkg.fileName,
        mimeType: pkg.mimeType,
        sizeBytes: pkg.sizeBytes,
        plaintextHash: pkg.plaintextHash,
        providerUaid,
        priceWei,
        createdAt: new Date().toISOString(),
        cipher: { algorithm: 'AES-GCM', ivBase64: bytesToBase64(encrypted.iv), version: 1 },
        purchaseRequirements: { receiptTransferable, conditions },
      };

      const prepared = await broker.preparePolicy({
        providerAddress: address,
        providerUaid,
        payoutAddress: address,
        priceWei,
        contentKeyB64,
        ciphertextBase64,
        metadata: metadata as unknown as Record<string, unknown>,
      });

      const registerTx = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'registerDataset',
        args: [
          prepared.onchainInputs.ciphertextHash as `0x${string}`,
          prepared.onchainInputs.keyCommitment as `0x${string}`,
          prepared.onchainInputs.metadataHash as `0x${string}`,
          prepared.onchainInputs.providerUaidHash as `0x${string}`,
        ],
        chain: robinhoodTestnet,
        account: walletClient.account,
      });

      const registerReceipt = await waitForTransactionReceipt(publicClient, { hash: registerTx });

      const datasetLog = registerReceipt.logs.find((log) => {
        try {
          return log.topics[0] === keccak256(toBytes('DatasetRegistered(uint256,address,bytes32,bytes32,bytes32,bytes32)'));
        } catch { return false; }
      });
      const datasetId = datasetLog?.topics[1] ? BigInt(datasetLog.topics[1]) : 1n;

      const policyTx = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'createPolicyForDataset',
        args: [
          datasetId,
          getAddress(address),
          '0x0000000000000000000000000000000000000000' as `0x${string}`,
          BigInt(priceWei),
          prepared.onchainInputs.receiptTransferable,
          prepared.onchainInputs.metadataHash as `0x${string}`,
          prepared.onchainInputs.conditions.map((condition) => ({
            evaluator: condition.evaluator,
            configData: condition.configData,
          })),
        ],
        chain: robinhoodTestnet,
        account: walletClient.account,
      });

      const policyReceipt = await waitForTransactionReceipt(publicClient, { hash: policyTx });

      const policyLog = policyReceipt.logs.find((log) => {
        try {
          return log.topics[0] === keccak256(toBytes('PolicyCreated(uint256,uint256,address,address,address,uint256,bool,bytes32,uint32,bytes32,bytes32)'));
        } catch { return false; }
      });
      const createdPolicyId = policyLog?.topics[1] ? Number(BigInt(policyLog.topics[1])) : 1;
      setTxHash(policyTx);
      setPolicyId(createdPolicyId);

      await broker.confirmPolicy({
        stagedPolicyId: prepared.stagedPolicyId,
        policyId: createdPolicyId,
        createdTxHash: policyTx,
        createdBlockNumber: Number(policyReceipt.blockNumber),
      });

      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish error: execution failed');
    } finally {
      setIsPublishing(false);
    }
  }, [file, walletClient, address, generateConditions, title, description, providerUaid, priceEth, receiptTransferable, publicClient]);


  /* ═══════════════════════════════════════════
     UNAUTHENTICATED MARKETING LANDING
     ═══════════════════════════════════════════ */
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[var(--surface-0)] pt-20 pb-24 px-6 md:px-12 flex items-center justify-center">
        <div className="max-w-4xl mx-auto w-full text-center">
          <Badge>Protocol Operator Mode</Badge>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-[var(--text-primary)] mb-6 mx-auto max-w-3xl leading-tight">
            Package and Sell Premium Intelligence.
          </h1>
          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed mb-12">
            Wrap datasets, market feeds, and private resources in zero-trust AES-GCM encryption. Gate access behind cryptographically enforced, on-chain entitlements.
          </p>
          
          <div className="flex justify-center mb-20 relative">
            <div className="absolute inset-0 max-w-[200px] mx-auto bg-[var(--brand-blue)] blur-3xl opacity-20 rounded-full" />
            <div className="relative z-10 p-2 bg-[var(--surface-0)] border border-[var(--border)] rounded-2xl shadow-xl hover:shadow-2xl transition-shadow">
              <ConnectButton showBalance={false} />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left border-t border-[var(--border)] pt-16">
            <div>
              <div className="h-10 w-10 rounded-full bg-[var(--brand-blue)]/5 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--brand-blue)]"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">1. Package Product</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">Local encryption ensures the broker never sees plaintext. Define your product&apos;s profile, metadata, and set pricing natively in ETH.</p>
            </div>
            <div>
              <div className="h-10 w-10 rounded-full bg-[var(--brand-purple)]/5 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--brand-purple)]"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">2. Programmable Access</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">Ditch static sales. Attach time-locks, ERC-8004 agent-identity checks, or allowlists directly to the smart contract entitlement.</p>
            </div>
            <div>
              <div className="h-10 w-10 rounded-full bg-[var(--brand-green)]/5 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--brand-green)]"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">3. Operate & Distribute</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">Publish to the active registry. Buyers mint ERC-721 receipts that trigger client-side decryption seamlessly in their environment.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     AUTHENTICATED PROVIDER CONSOLE WIZARD
     ═══════════════════════════════════════════ */
  const PENDING_CONDITIONS = generateConditions();

  return (
    <div className="min-h-screen bg-[var(--surface-0)] py-12 px-4 md:px-8">
      <div className="max-w-[1000px] mx-auto">
        
        {/* Header Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 overflow-hidden mb-10 pb-6 border-b border-[var(--border)]">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-3">
              <span className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer">Console</span>
              <span className="opacity-30">/</span>
              <span>New Access Product</span>
            </h1>
            <div className="flex gap-2 items-center mt-1">
              <Badge color="gray">{connectedNetwork.name}</Badge>
              <span className="text-xs text-[var(--text-secondary)]">Create a premium data listing</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {['packaging', 'targeting', 'preflight'].map((s, i) => {
              const isActive = step === s;
              const isPast = ['packaging', 'targeting', 'preflight', 'done'].indexOf(step) > i;
              if (s === 'done' && step !== 'done') return null;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${isActive ? 'bg-[var(--text-primary)] text-[var(--surface-0)]' : isPast ? 'bg-[var(--brand-green)]/10 text-[var(--brand-green)]' : 'bg-[var(--surface-1)] text-[var(--text-tertiary)]'}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </div>
                  {i < 2 && <div className="w-4 h-px bg-[var(--border)] hidden sm:block" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================== */}
        {/* STEP 1: PACKAGING */}
        {/* ========================================================== */}
        {step === 'packaging' && (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            <SectionHeading 
              title="1. Product Packaging" 
              subtitle="Supply the payload and characterize the offering for the marketplace." 
            />

            <div className="grid md:grid-cols-5 gap-8">
              {/* Left Col: File & Meta */}
              <div className="md:col-span-3 space-y-8">
                <Card className="p-1">
                  <label
                    ref={dropRef}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className="block cursor-pointer"
                  >
                    <div className={`p-10 md:p-14 text-center rounded-xl border-2 border-dashed transition-all ${file ? 'border-transparent bg-[var(--brand-blue)]/5' : isDragging ? 'border-[var(--brand-green)] bg-[var(--brand-green)]/5' : 'border-[var(--border)] hover:border-[var(--text-tertiary)] hover:bg-[var(--surface-2)]'}`}>
                      {file ? (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] flex items-center justify-center">
                            <IconCheck />
                          </div>
                          <div>
                            <p className="font-bold text-[var(--text-primary)]">{file.name}</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">{(file.size / 1024).toFixed(1)} KB • {file.type || 'Unknown Type'}</p>
                          </div>
                          <span className="text-xs font-semibold text-[var(--brand-blue)] mt-2">Replace Target</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[var(--surface-3)] text-[var(--text-secondary)] flex items-center justify-center mb-1">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                          </div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">Drop target resource payload here</p>
                          <p className="text-xs text-[var(--text-tertiary)]">JSON, CSV, PDF, or binary data</p>
                        </div>
                      )}
                      <input type="file" className="hidden" onChange={handleFileChange} />
                    </div>
                  </label>
                </Card>

                <div className="space-y-5">
                  <div>
                    <Label required description="A public, human-readable name for your product listing.">Product Title</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Acme Corp Q3 Proprietary Signals" />
                  </div>
                  <div>
                    <Label description="Details on what the payload contains, schema structure, or update frequency.">Description</Label>
                    <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Provide context to potential buyers..." />
                  </div>
                </div>
              </div>

              {/* Right Col: Commercials */}
              <div className="md:col-span-2 space-y-6">
                <Card className="p-6">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 pb-4 border-b border-[var(--border)]">Commercial Structure</h3>
                  
                  <div className="mb-6">
                    <Label required description="Set the purchase price in ETH.">List Price (ETH)</Label>
                    <div className="relative">
                      <Input 
                        value={priceEth} 
                        onChange={e => setPriceEth(e.target.value)} 
                        className="pl-8 text-lg font-bold text-[var(--brand-green)] border-[var(--border)]"
                      />
                      <span className="absolute left-3 top-2.5 text-lg font-bold text-[var(--text-tertiary)]">♦</span>
                    </div>
                  </div>

                  <div>
                    <Label description="Determine if the ERC-721 receipt can be moved to another wallet after purchase.">Entitlement Mobility</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button 
                        onClick={() => setReceiptTransferable(false)}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${!receiptTransferable ? 'bg-[var(--brand-blue)]/5 border-[var(--brand-blue)] text-[var(--brand-blue)]' : 'bg-[var(--surface-0)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'}`}
                      >
                        Soulbound
                      </button>
                      <button 
                        onClick={() => setReceiptTransferable(true)}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${receiptTransferable ? 'bg-[var(--brand-blue)]/5 border-[var(--brand-blue)] text-[var(--brand-blue)]' : 'bg-[var(--surface-0)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'}`}
                      >
                        Transferable
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="mt-10 flex justify-end pt-6 border-t border-[var(--border)]">
              <button 
                onClick={() => setStep('targeting')} 
                disabled={!file || !title || !priceEth}
                className={`py-3 px-8 rounded-xl font-bold text-sm transition-all shadow-sm ${file && title ? 'bg-[var(--brand-blue)] text-white hover:shadow-md hover:bg-[var(--brand-blue)]/90' : 'bg-[var(--surface-3)] text-[var(--text-tertiary)] cursor-not-allowed'}`}
              >
                Next: Configure Access Rules →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* STEP 2: TARGETING & POLICY */}
        {/* ========================================================== */}
        {step === 'targeting' && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-start mb-6">
              <SectionHeading 
                title="2. Targeting & Programmable Access" 
                subtitle="Design your on-chain entitlement policy. Who can buy, and when?" 
              />
              <button 
                onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] px-3 py-1.5 rounded-lg bg-[var(--surface-1)]"
              >
                {isAdvancedMode ? 'Switch to Visual Builder' : 'Advanced: Raw JSON'}
              </button>
            </div>

            {isAdvancedMode ? (
              <Card className="p-6">
                <Label description="Paste your raw ConditionalDescriptor JSON array here.">Raw Evaluator Input</Label>
                <Textarea 
                  rows={12} 
                  value={rawConditionJson} 
                  onChange={e => setRawConditionJson(e.target.value)} 
                  className="font-mono text-xs mt-2"
                />
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-5 rounded-xl border border-[var(--border)] bg-[var(--brand-blue)]/5">
                  <div className="w-10 h-10 rounded-full bg-[var(--brand-blue)]/10 flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--brand-blue)]"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--text-primary)] mb-1">Base Availability</h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      By default, if no conditions are added below, this product is configured as <strong>Open (Paid)</strong>. Any wallet with sufficient ETH can purchase and decrypt.
                      Add target conditions below if you want to restrict who can buy this dataset. <strong>Buyers must satisfy all created conditions successfully.</strong>
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  {uiRules.map((rule, idx) => (
                    <Card key={rule.id} className="p-5 border-l-4 border-l-[var(--brand-blue)] relative fade-in">
                      <div className="absolute top-4 right-4">
                        <button onClick={() => removeRule(rule.id)} className="text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors p-1">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <Badge color="blue">Condition {idx + 1}</Badge>
                        <span className="font-bold text-sm text-[var(--text-primary)]">
                          {rule.kind === 'time-range' && 'Time Restriction'}
                          {rule.kind === 'uaid-ownership' && 'Agent Identity Gating'}
                          {rule.kind === 'evm-allowlist' && 'Address Allowlist'}
                          {rule.kind === 'custom-static' && 'Custom Evaluator'}
                        </span>
                      </div>

                      {rule.kind === 'time-range' && (
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div><Label>Not Before (Date/Time)</Label><Input type="datetime-local" value={rule.startDate || ''} onChange={e => updateRule(rule.id, { startDate: e.target.value })} /></div>
                          <div><Label>Not After (Date/Time)</Label><Input type="datetime-local" value={rule.endDate || ''} onChange={e => updateRule(rule.id, { endDate: e.target.value })} /></div>
                        </div>
                      )}

                      {rule.kind === 'uaid-ownership' && (
                        <div className="space-y-4">
                          <div className="p-3 mb-2 rounded border border-[var(--brand-purple)]/20 bg-[var(--brand-purple)]/5 flex items-start gap-3">
                            <span className="text-lg">🤖</span>
                            <div>
                               <p className="text-sm font-semibold text-[var(--text-primary)]">Target a Specific Agent Identity</p>
                               <p className="text-xs text-[var(--text-secondary)] mt-1">Restrict purchases to a specific autonomous agent. You can find their UAID by browsing the <a href="/" target="_blank" rel="noreferrer" className="text-[var(--brand-blue)] hover:underline">Agent Registry</a>.</p>
                            </div>
                          </div>
                          <div>
                            <Label description="The cryptographic identity the buyer must hold via ERC-8004. Format: uaid:did:eip155:...">Required Buyer UAID</Label>
                            <Input value={rule.requiredBuyerUaid || ''} onChange={e => updateRule(rule.id, { requiredBuyerUaid: e.target.value })} placeholder="uaid:did:eip155:..." className="font-mono text-xs" />
                          </div>
                          <div>
                            <Label description="Explicit Agent Token ID verification in the Registry Broker.">Agent Token ID (Optional)</Label>
                            <Input value={rule.agentTokenId || ''} onChange={e => updateRule(rule.id, { agentTokenId: e.target.value })} placeholder="e.g. 97" />
                          </div>
                        </div>
                      )}

                      {rule.kind === 'evm-allowlist' && (
                        <div>
                          <Label description="List of EVM addresses allowed to purchase. Comma or newline separated.">Allowed Wallet Addresses</Label>
                          <Textarea value={rule.addresses || ''} onChange={e => updateRule(rule.id, { addresses: e.target.value })} rows={3} placeholder="0x123..., 0xabc..." className="font-mono text-xs" />
                        </div>
                      )}

                      {rule.kind === 'custom-static' && (
                        <div className="space-y-4">
                          <div><Label>Evaluator Contract Address</Label><Input value={rule.evaluatorAddress || ''} onChange={e => updateRule(rule.id, { evaluatorAddress: e.target.value })} placeholder="0x..." className="font-mono text-xs" /></div>
                          <div><Label>Config Data (Hex)</Label><Input value={rule.configHex || ''} onChange={e => updateRule(rule.id, { configHex: e.target.value })} placeholder="0x..." className="font-mono text-xs" /></div>
                        </div>
                      )}
                    </Card>
                  ))}

                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => addRule('uaid-ownership')} className="px-4 py-2 border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--brand-purple)] hover:text-[var(--brand-purple)] text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors">
                      <span className="text-lg leading-none">+</span> Agent Targeting
                    </button>
                    <button onClick={() => addRule('evm-allowlist')} className="px-4 py-2 border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)] text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors">
                      <span className="text-lg leading-none">+</span> EVM Allowlist
                    </button>
                    <button onClick={() => addRule('time-range')} className="px-4 py-2 border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)] text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors">
                      <span className="text-lg leading-none">+</span> Time Lock
                    </button>
                    <button onClick={() => addRule('custom-static')} className="px-4 py-2 border border-[var(--border)] text-[var(--surface-3)] hover:text-[var(--text-primary)] text-xs font-semibold rounded-lg transition-colors">
                      Custom
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-10 flex justify-between pt-6 border-t border-[var(--border)]">
              <button 
                onClick={() => setStep('packaging')} 
                className="py-3 px-6 rounded-xl font-bold text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors"
               >
                 ← Back
              </button>
              <button 
                onClick={() => setStep('preflight')} 
                className="py-3 px-8 rounded-xl font-bold text-sm bg-[var(--brand-blue)] text-white hover:shadow-md hover:bg-[var(--brand-blue)]/90 transition-all shadow-sm"
              >
                Proceed to Preflight →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* STEP 3: PREFLIGHT & PUBLISH */}
        {/* ========================================================== */}
        {step === 'preflight' && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <SectionHeading 
              title="3. Preflight & Readiness" 
              subtitle="Review your product architecture before committing to the chain." 
            />

            <div className="grid md:grid-cols-2 gap-8">
              {/* Product Preview */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Listing Preview</h3>
                  <Card className="p-6 overflow-hidden relative">
                    {/* Simulated tag */}
                    <div className="absolute top-0 right-0 bg-[var(--surface-2)] text-[var(--text-tertiary)] text-[10px] font-bold px-3 py-1 rounded-bl-lg">LIVE PREVIEW</div>
                    
                    <h4 className="text-xl font-bold text-[var(--text-primary)] mt-2">{title || 'Untitled Product'}</h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{description?.slice(0, 100) || 'No description provided.'}...</p>
                    
                    <div className="mt-6 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-[var(--text-secondary)]">Price</span>
                        <span className="font-bold text-sm text-[var(--brand-green)]">{priceEth} ETH</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-[var(--text-secondary)]">Payload Size</span>
                        <span className="font-mono text-xs">{file ? (file.size / 1024).toFixed(2) : 0} KB</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-[var(--text-secondary)]">Policy Mode</span>
                        <Badge color={PENDING_CONDITIONS.length === 0 ? 'green' : 'blue'}>
                          {PENDING_CONDITIONS.length === 0 ? 'Open Access' : 'Conditional Gate'}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Simulation / Checklist */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">System Readiness</h3>
                  <Card className="p-1">
                    <div className="divide-y divide-[var(--border)]">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-[var(--brand-green)]/10 text-[var(--brand-green)] flex items-center justify-center shrink-0"><IconCheck /></div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Network Check</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">Connected to {connectedNetwork.name}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${ethBalance && ethBalance > 0n ? 'bg-[var(--brand-green)]/10 text-[var(--brand-green)]' : 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]'}`}>{ethBalance && ethBalance > 0n ? <IconCheck /> : <span className="font-bold text-xs">!</span>}</div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Gas Balance</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">{ethBalance ? formatEther(ethBalance).slice(0, 6) : '0'} ETH available</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${providerIdentityIndicatorClass}`}>
                            {providerIdentityLoading ? (
                              <span className="font-bold text-xs">…</span>
                            ) : providerIdentityResolved ? (
                              <IconCheck />
                            ) : (
                              <span className="font-bold text-xs">!</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Provider UAID</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">
                              {providerIdentityMessage}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${providerIdentityIndicatorClass}`}>
                            {providerIdentityLoading ? (
                              <span className="font-bold text-xs">…</span>
                            ) : providerIdentityResolved ? (
                              <IconCheck />
                            ) : (
                              <span className="font-bold text-xs">!</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Provider UAID</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">
                              {providerIdentityMessage}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] flex items-center justify-center shrink-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Payout Routing</p>
                            <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{address?.slice(0, 10)}...{address?.slice(-8)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] flex items-center justify-center shrink-0"><span className="text-[9px] font-bold">ENC</span></div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Cryptographic Payload</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">AES-256-GCM browser encryption ready</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border border-[var(--border)] bg-[var(--brand-green)]/10 text-[var(--brand-green)] flex items-center justify-center shrink-0"><IconCheck /></div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Storage & KRS</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">Centralized policy broker online</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border border-[var(--border)] text-[var(--text-tertiary)] flex items-center justify-center shrink-0"><span className="text-[10px] font-bold">TX</span></div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Execution Profile</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">2 Signatures required (Registry & Policy)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {error && (
                  <div className="p-4 rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5">
                    <p className="text-xs font-bold text-[var(--accent-red)] uppercase tracking-wider mb-1">Execution Failed</p>
                    <p className="text-sm text-[var(--text-primary)]">{error}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10 flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-[var(--border)]">
              <button 
                onClick={() => setStep('targeting')} 
                disabled={isPublishing}
                className="py-3 px-6 rounded-xl font-bold text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors w-full sm:w-auto text-left"
               >
                 ← Back to Targeting
              </button>
              <button 
                onClick={handlePublish} 
                disabled={publishDisabled}
                className={`py-4 px-10 rounded-xl font-bold text-base transition-all shadow-md w-full sm:w-auto ${isPublishing ? 'bg-[var(--brand-blue)]/50 text-white cursor-wait' : 'bg-[var(--brand-blue)] text-white hover:shadow-lg hover:-translate-y-0.5'}`}
              >
                {publishButtonLabel}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* STEP 4: DONE / OPERATIONS CONSOLE */}
        {/* ========================================================== */}
        {step === 'done' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-[var(--brand-green)]/10 border border-[var(--brand-green)]/20 rounded-3xl p-8 md:p-12 text-center mb-10 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-0)]/50 to-transparent pointer-events-none" />
              <div className="w-16 h-16 bg-[var(--brand-green)] text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[var(--brand-green)]/20">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3 relative z-10">Product Published</h2>
              <p className="text-base text-[var(--text-secondary)] max-w-lg mx-auto relative z-10">Your encrypted product is live on {connectedNetwork.name}. The payload is secured and the access policy is enforcing entitlements on-chain.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="p-6">
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Operations Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                    <span className="text-xs text-[var(--text-secondary)]">Policy ID</span>
                    <span className="font-mono text-sm font-bold text-[var(--text-primary)]">#{policyId}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                    <span className="text-xs text-[var(--text-secondary)]">Provider Authority</span>
                    <span className="font-mono text-xs text-[var(--brand-blue)] truncate max-w-[200px]">{providerUaid}</span>
                  </div>
                  {txHash && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-xs text-[var(--text-secondary)]">Creation Tx</span>
                      <a href={buildTxUrl(txHash) ?? '#'} target="_blank" rel="noreferrer" className="font-mono text-xs text-[var(--text-tertiary)] hover:text-[var(--brand-blue)] hover:underline truncate max-w-[150px]">
                        {txHash}
                      </a>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-8 flex flex-col justify-center items-center text-center">
                <div className="w-12 h-12 bg-[var(--surface-2)] rounded-full flex items-center justify-center mb-4 border border-[var(--border)] text-[var(--text-secondary)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Live Listing</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-xs">View how buyers perceive your access product on the marketplace.</p>
                {policyId && (
                  <Link href={`/policy/${policyId}`}>
                    <button className="py-2.5 px-6 rounded-xl border-2 border-[var(--brand-blue)] text-[var(--brand-blue)] font-bold text-sm hover:bg-[var(--brand-blue)]/5 transition-colors">
                      View Marketplace Listing
                    </button>
                  </Link>
                )}
              </Card>
            </div>
            
            <div className="mt-8 text-center">
               <Link href="/" className="text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors underline decoration-[var(--border)] underline-offset-4">
                 Return to explore products
               </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
