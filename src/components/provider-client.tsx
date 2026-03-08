'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther, getAddress, parseEther, keccak256, toBytes } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { createPublicClient, http } from 'viem';
import { robinhoodTestnet, buildTxUrl } from '@/lib/contracts/chain';
import { POLICY_VAULT_ABI, POLICY_VAULT_ADDRESS } from '@/lib/contracts/abi';
import { getNetworkMeta } from '@/lib/contracts/networks';

type PolicyTemplate = 'open' | 'uaid' | 'custom';
import { broker } from '@/lib/api/broker';
import { deriveWalletUaid } from '@/lib/uaid';
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

type Step = 'upload' | 'terms' | 'publish' | 'done';

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'upload', label: 'Upload', icon: '📁' },
  { key: 'terms', label: 'Terms', icon: '📋' },
  { key: 'publish', label: 'Publish', icon: '🚀' },
  { key: 'done', label: 'Done', icon: '✅' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: 'var(--text-tertiary)', letterSpacing: '0.1em' }}
    >
      {children}
    </h3>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        {children}
      </label>
      {hint && (
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  accent,
  truncate: shouldTruncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span
        className={`text-xs font-semibold text-right ${shouldTruncate ? 'truncate max-w-[220px]' : ''}`}
        style={{
          color: accent ?? 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ProviderClient() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const providerUaid = useMemo(
    () => (address ? deriveWalletUaid(address, chainId ?? robinhoodTestnet.id) : ''),
    [address, chainId],
  );

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceEth, setPriceEth] = useState('0.00001');
  const [receiptTransferable, setReceiptTransferable] = useState(false);
  const [policyTemplate, setPolicyTemplate] = useState<PolicyTemplate>('open');
  const [conditionJson, setConditionJson] = useState('[]');
  const [uaidRequiredBuyerUaid, setUaidRequiredBuyerUaid] = useState('');
  const [uaidAgentId, setUaidAgentId] = useState('');
  const [showConditions, setShowConditions] = useState(false);

  const connectedNetwork = useMemo(() => getNetworkMeta(chainId), [chainId]);
  const [customEvaluatorAddress, setCustomEvaluatorAddress] = useState('');
  const [customEvaluatorMetadataJson, setCustomEvaluatorMetadataJson] = useState('{\n  "name": "Custom Evaluator"\n}');
  const [evaluatorRegistrationFeeWei, setEvaluatorRegistrationFeeWei] = useState<string | null>(null);
  const [registeredEvaluatorState, setRegisteredEvaluatorState] = useState<{
    registrant: string;
    metadataHash: string;
    active: boolean;
    builtIn: boolean;
  } | null>(null);
  const [isLoadingEvaluatorState, setIsLoadingEvaluatorState] = useState(false);
  const [showEvaluatorPanel, setShowEvaluatorPanel] = useState(false);
  const [isRegisteringEvaluator, setIsRegisteringEvaluator] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState<number | null>(null);

  const publicClient = useMemo(
    () => createPublicClient({ chain: robinhoodTestnet, transport: http() }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const loadEvaluatorState = async () => {
      try {
        const fee = await publicClient.readContract({
          address: POLICY_VAULT_ADDRESS,
          abi: POLICY_VAULT_ABI,
          functionName: 'evaluatorRegistrationFee',
        });
        if (!cancelled) {
          setEvaluatorRegistrationFeeWei(fee.toString());
        }
      } catch {
        if (!cancelled) {
          setEvaluatorRegistrationFeeWei(null);
        }
      }

      const normalizedAddress = customEvaluatorAddress.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
        if (!cancelled) {
          setRegisteredEvaluatorState(null);
          setIsLoadingEvaluatorState(false);
        }
        return;
      }

      setIsLoadingEvaluatorState(true);
      try {
        const registration = await publicClient.readContract({
          address: POLICY_VAULT_ADDRESS,
          abi: POLICY_VAULT_ABI,
          functionName: 'getPolicyEvaluator',
          args: [getAddress(normalizedAddress)],
        });
        if (!cancelled) {
          setRegisteredEvaluatorState({
            registrant: registration.registrant,
            metadataHash: registration.metadataHash,
            active: registration.active,
            builtIn: registration.builtIn,
          });
        }
      } catch {
        if (!cancelled) {
          setRegisteredEvaluatorState(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEvaluatorState(false);
        }
      }
    };

    void loadEvaluatorState();

    return () => {
      cancelled = true;
    };
  }, [customEvaluatorAddress, publicClient]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  }, [title]);

  const handleRegisterEvaluator = useCallback(async () => {
    if (!walletClient || !address) {
      return;
    }

    const normalizedAddress = customEvaluatorAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
      setError('Custom evaluator address must be a valid EVM contract address');
      return;
    }

    setIsRegisteringEvaluator(true);
    setError(null);
    try {
      const metadata = JSON.parse(customEvaluatorMetadataJson) as Record<string, unknown>;
      const metadataHash = await hashMetadata(metadata);
      const feeWei = BigInt(evaluatorRegistrationFeeWei ?? parseEther('0.05').toString());
      const evTxHash = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'registerPolicyEvaluator',
        args: [getAddress(normalizedAddress), metadataHash as `0x${string}`],
        value: feeWei,
        chain: robinhoodTestnet,
        account: walletClient.account,
      });
      await waitForTransactionReceipt(publicClient, { hash: evTxHash });

      const registration = await publicClient.readContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'getPolicyEvaluator',
        args: [getAddress(normalizedAddress)],
      });

      setRegisteredEvaluatorState({
        registrant: registration.registrant,
        metadataHash: registration.metadataHash,
        active: registration.active,
        builtIn: registration.builtIn,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluator registration failed');
    } finally {
      setIsRegisteringEvaluator(false);
    }
  }, [
    walletClient,
    address,
    customEvaluatorAddress,
    customEvaluatorMetadataJson,
    evaluatorRegistrationFeeWei,
    publicClient,
  ]);

  const parsedConditionCount = useMemo(() => {
    try {
      const parsed = JSON.parse(conditionJson) as unknown;
      return Array.isArray(parsed) ? parsed.length : -1;
    } catch {
      return -1;
    }
  }, [conditionJson]);

  const handlePublish = useCallback(async () => {
    if (!file || !walletClient || !address) return;
    setIsPublishing(true);
    setError(null);

    try {
      const pkg = await packageFile(file);
      const aesKey = await generateAesKey();
      const contentKeyB64 = await exportAesKeyBase64(aesKey);
      const encrypted = await encryptPayload(aesKey, pkg.plaintextBytes);
      const ciphertextBase64 = bytesToBase64(encrypted.ciphertext);

      const priceWei = parseEther(priceEth).toString();
      const rawConditions = JSON.parse(conditionJson) as unknown;
      if (!Array.isArray(rawConditions)) {
        throw new Error('Condition JSON must be an array');
      }
      const conditions = rawConditions as ProgrammableSecretsConditionDescriptor[];

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
        purchaseRequirements: {
          receiptTransferable,
          conditions,
        },
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
          return log.topics[0] === keccak256(
            toBytes('DatasetRegistered(uint256,address,bytes32,bytes32,bytes32,bytes32)')
          );
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
          return log.topics[0] === keccak256(
            toBytes('PolicyCreated(uint256,uint256,address,address,address,uint256,bool,bytes32,uint32,bytes32,bytes32)')
          );
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
      setError(err instanceof Error ? err.message : 'Publishing failed');
    } finally {
      setIsPublishing(false);
    }
  }, [address, conditionJson, description, file, priceEth, providerUaid, publicClient, receiptTransferable, title, walletClient]);

  /* ───── Not Connected ───── */
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <div className="max-w-md w-full mx-4 animate-in">
          <div
            className="rounded-2xl p-10 text-center space-y-5"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
              style={{ background: 'rgba(85, 153, 254, 0.08)' }}
            >
              🔐
            </div>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Connect Your Wallet
              </h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Connect a wallet to encrypt and publish datasets with policy-enforced access.
              </p>
            </div>
            <div className="flex justify-center pt-1">
              <ConnectButton />
            </div>
            <div className="flex items-center justify-center gap-4 pt-2">
              {['AES-256-GCM', 'Client-side encryption', 'On-chain policies'].map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  /* ───── Main Flow ───── */
  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* ── Step Progress ── */}
        <div className="mb-10">
          <div className="flex items-center justify-between gap-1">
            {STEPS.map((s, i) => {
              const isActive = step === s.key;
              const isComplete = i < stepIndex;

              return (
                <div key={s.key} className="flex items-center gap-1 flex-1">
                  <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200"
                      style={{
                        background: isActive
                          ? 'var(--brand-blue)'
                          : isComplete
                            ? 'rgba(72, 223, 123, 0.12)'
                            : 'var(--surface-3)',
                        color: isActive
                          ? '#ffffff'
                          : isComplete
                            ? 'var(--accent-green)'
                            : 'var(--text-tertiary)',
                        boxShadow: isActive ? 'var(--shadow-brand-blue)' : 'none',
                      }}
                    >
                      {isComplete ? '✓' : s.icon}
                    </div>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        color: isActive
                          ? 'var(--brand-blue)'
                          : isComplete
                            ? 'var(--accent-green)'
                            : 'var(--text-tertiary)',
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className="flex-1 h-px mx-1"
                      style={{
                        background: isComplete
                          ? 'var(--accent-green)'
                          : 'var(--border)',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Step 1 — Upload ── */}
        {step === 'upload' && (
          <div className="animate-in space-y-6">
            <div
              className="rounded-2xl p-8 space-y-6"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Upload Dataset
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Select a file to encrypt and publish. The file will be encrypted locally before being uploaded.
                </p>
              </div>

              {/* Identity badge */}
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(72, 223, 123, 0.04)',
                  border: '1px solid rgba(72, 223, 123, 0.12)',
                }}
              >
                <span
                  className="h-2 w-2 rounded-full pulse-dot"
                  style={{ background: 'var(--accent-green)' }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Publishing as
                  </p>
                  <p
                    className="text-[11px] truncate"
                    style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}
                  >
                    {providerUaid}
                  </p>
                </div>
              </div>

              {/* File drop */}
              <label
                className="group relative block cursor-pointer rounded-xl transition-all duration-200"
                style={{
                  border: file ? '2px solid var(--brand-blue)' : '2px dashed var(--border-hover)',
                  background: file ? 'rgba(85, 153, 254, 0.03)' : 'var(--surface-0)',
                  padding: '2.5rem 1.5rem',
                }}
              >
                <input type="file" className="hidden" onChange={handleFileChange} />
                <div className="text-center space-y-3">
                  <div
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl text-2xl transition-transform group-hover:scale-105"
                    style={{
                      background: file ? 'rgba(85, 153, 254, 0.08)' : 'var(--surface-3)',
                    }}
                  >
                    {file ? '📄' : '📁'}
                  </div>
                  {file ? (
                    <>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {file.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}
                      </p>
                      <p className="text-[10px] font-medium" style={{ color: 'var(--brand-blue)' }}>
                        Click to change file
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Drop a file or click to browse
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        JSON, CSV, PDF, or any file type
                      </p>
                    </>
                  )}
                </div>
              </label>

              {/* Metadata fields */}
              <div className="space-y-4">
                <div>
                  <FieldLabel hint="Required">Title</FieldLabel>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. TSLA Volatility Model"
                    className="input-field"
                  />
                </div>
                <div>
                  <FieldLabel hint="Optional">Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this dataset contain?"
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>
              </div>

              <button
                onClick={() => file && setStep('terms')}
                disabled={!file}
                className="btn-primary w-full"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 — Terms ── */}
        {step === 'terms' && (
          <div className="animate-in space-y-6">
            <div
              className="rounded-2xl p-8 space-y-6"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Set Terms
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Define pricing and access policy. Choose who can purchase this dataset.
                </p>
              </div>

              {/* Price */}
              <div>
                <FieldLabel hint="Minimum 0.00001">Price (ETH)</FieldLabel>
                <input
                  type="text"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  className="input-field"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div
                className="rounded-xl p-4"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-0)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Transferable receipt
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      When enabled, the ERC-721 can move live access to another wallet. Leave this off to keep access bound to the original buyer.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiptTransferable((current) => !current)}
                    className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors"
                    style={{
                      background: receiptTransferable ? 'var(--brand-blue)' : 'var(--surface-3)',
                    }}
                  >
                    <span
                      className="absolute top-1 h-5 w-5 rounded-full transition-transform"
                      style={{
                        left: '4px',
                        transform: receiptTransferable ? 'translateX(20px)' : 'translateX(0)',
                        background: '#ffffff',
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* P0 #4 — Policy Template Selector */}
              <div>
                <FieldLabel>Access Policy Type</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    {
                      key: 'open' as PolicyTemplate,
                      icon: '🌐',
                      label: 'Open (Paid)',
                      desc: 'Anyone can purchase',
                      accent: 'var(--brand-green)',
                    },
                    {
                      key: 'uaid' as PolicyTemplate,
                      icon: '🤖',
                      label: 'UAID / ERC-8004',
                      desc: 'Agent identity gated',
                      accent: 'var(--brand-blue)',
                    },
                    {
                      key: 'custom' as PolicyTemplate,
                      icon: '⚙️',
                      label: 'Custom Evaluator',
                      desc: 'Raw condition JSON',
                      accent: 'var(--brand-purple)',
                    },
                  ].map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => {
                        setPolicyTemplate(tpl.key);
                        if (tpl.key === 'open') setConditionJson('[]');
                      }}
                      className="text-left p-3 rounded-xl cursor-pointer transition-all duration-150"
                      style={{
                        border: policyTemplate === tpl.key
                          ? `2px solid ${tpl.accent}`
                          : '2px solid var(--border)',
                        background: policyTemplate === tpl.key
                          ? `${tpl.accent}08`
                          : 'var(--surface-0)',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{tpl.icon}</span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {tpl.label}
                        </span>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {tpl.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* UAID Template Fields */}
              {policyTemplate === 'uaid' && (
                <div
                  className="rounded-xl p-4 space-y-4"
                  style={{ border: '1px solid rgba(85,153,254,0.15)', background: 'rgba(85,153,254,0.03)' }}
                >
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Agent-gated policy enforces three on-chain checks: non-empty UAID string, UAID hash match, and ERC-8004 IdentityRegistry ownership.
                  </p>
                  <div>
                    <FieldLabel hint="uaid:...">Required Buyer UAID</FieldLabel>
                    <input
                      type="text"
                      value={uaidRequiredBuyerUaid}
                      onChange={(e) => setUaidRequiredBuyerUaid(e.target.value)}
                      placeholder="uaid:did:eip155:421614:0x...;nativeId=eip155:421614:0x..."
                      className="input-field"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <FieldLabel hint="ERC-8004 token ID">Agent ID</FieldLabel>
                    <input
                      type="text"
                      value={uaidAgentId}
                      onChange={(e) => setUaidAgentId(e.target.value)}
                      placeholder="e.g. 97"
                      className="input-field"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    <span style={{ color: 'var(--brand-blue)' }}>ℹ</span>
                    Identity Registry: <code style={{ color: 'var(--brand-blue)' }}>0x8004A818BFB912233c491871b3d84c89A494BD9e</code> (Arbitrum Sepolia)
                  </div>
                </div>
              )}

              {/* Custom template — raw conditions */}
              {policyTemplate === 'custom' && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setShowConditions(!showConditions)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-transparent border-none cursor-pointer"
                    style={{ background: 'var(--surface-0)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Policy Conditions
                      </span>
                      {parsedConditionCount > 0 && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: 'rgba(85, 153, 254, 0.08)',
                            color: 'var(--brand-blue)',
                          }}
                        >
                          {parsedConditionCount} active
                        </span>
                      )}
                    </div>
                    <span
                      className="text-xs transition-transform duration-200"
                      style={{
                        color: 'var(--text-tertiary)',
                        transform: showConditions ? 'rotate(180deg)' : 'rotate(0)',
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {showConditions && (
                    <div className="px-4 pb-4 space-y-4" style={{ background: 'var(--surface-0)' }}>
                      <div>
                        <FieldLabel hint="JSON array">Condition Descriptors</FieldLabel>
                        <textarea
                          value={conditionJson}
                          onChange={(e) => setConditionJson(e.target.value)}
                          rows={6}
                          className="input-field resize-y"
                          placeholder={`[]\n\nor\n[\n  {\n    "kind": "custom-static",\n    "evaluatorAddress": "0x...",\n    "configDataHex": "0x...",\n    "runtimeWitness": { "kind": "none" }\n  }\n]`}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                        />
                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                          Use <code className="font-semibold" style={{ color: 'var(--text-secondary)' }}>[]</code> for an
                          open paid policy, or provide evaluator-backed descriptors for onchain conditions.
                        </p>
                        {parsedConditionCount === -1 && (
                          <p className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--accent-red)' }}>
                            ⚠ Invalid JSON — must be an array
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Evaluator registration — collapsible */}
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowEvaluatorPanel(!showEvaluatorPanel)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-transparent border-none cursor-pointer"
                  style={{ background: 'var(--surface-0)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Register Custom Evaluator
                    </span>
                    <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                      Optional
                    </span>
                  </div>
                  <span
                    className="text-xs transition-transform duration-200"
                    style={{
                      color: 'var(--text-tertiary)',
                      transform: showEvaluatorPanel ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                  >
                    ▼
                  </span>
                </button>

                {showEvaluatorPanel && (
                  <div className="px-4 pb-4 space-y-4" style={{ background: 'var(--surface-0)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Register a custom evaluator contract on the PolicyVault for{' '}
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {evaluatorRegistrationFeeWei
                          ? `${formatEther(BigInt(evaluatorRegistrationFeeWei))} ETH`
                          : '0.05 ETH'}
                      </span>
                      .
                    </p>

                    <div>
                      <FieldLabel>Evaluator Contract Address</FieldLabel>
                      <input
                        type="text"
                        value={customEvaluatorAddress}
                        onChange={(e) => setCustomEvaluatorAddress(e.target.value)}
                        placeholder="0x..."
                        className="input-field"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      />
                    </div>

                    <div>
                      <FieldLabel>Evaluator Metadata (JSON)</FieldLabel>
                      <textarea
                        value={customEvaluatorMetadataJson}
                        onChange={(e) => setCustomEvaluatorMetadataJson(e.target.value)}
                        rows={4}
                        className="input-field resize-y"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleRegisterEvaluator}
                        disabled={isRegisteringEvaluator || !walletClient || !customEvaluatorAddress.trim()}
                        className="btn-outline"
                        type="button"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        {isRegisteringEvaluator ? 'Registering…' : 'Register Evaluator'}
                      </button>
                      {isLoadingEvaluatorState && (
                        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          Checking registration…
                        </span>
                      )}
                      {registeredEvaluatorState && (
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                          style={{
                            color: registeredEvaluatorState.active ? 'var(--accent-green)' : 'var(--accent-red)',
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              background: registeredEvaluatorState.active ? 'var(--accent-green)' : 'var(--accent-red)',
                            }}
                          />
                          {registeredEvaluatorState.active ? 'Registered & active' : 'Registered but inactive'}
                        </span>
                      )}
                    </div>

                    {registeredEvaluatorState && (
                      <div
                        className="rounded-lg p-3 space-y-1"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        <SummaryRow
                          label="Registrant"
                          value={`${registeredEvaluatorState.registrant.slice(0, 8)}…${registeredEvaluatorState.registrant.slice(-6)}`}
                          mono
                        />
                        <SummaryRow
                          label="Metadata hash"
                          value={`${registeredEvaluatorState.metadataHash.slice(0, 10)}…`}
                          mono
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div>
                <SectionLabel>Review Summary</SectionLabel>
                <div
                  className="mt-2 rounded-xl px-4"
                  style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}
                >
                  <SummaryRow label="File" value={file?.name ?? '—'} />
                  <SummaryRow label="Price" value={`${priceEth} ETH`} mono accent="var(--text-primary)" />
                  <SummaryRow
                    label="Policy type"
                    value={policyTemplate === 'open' ? 'Open (paid)' : policyTemplate === 'uaid' ? 'UAID / ERC-8004 gated' : 'Custom evaluator'}
                    accent={policyTemplate === 'uaid' ? 'var(--brand-blue)' : undefined}
                  />
                  <SummaryRow
                    label="Conditions"
                    value={parsedConditionCount >= 0 ? String(parsedConditionCount) : 'invalid'}
                    accent={parsedConditionCount === -1 ? 'var(--accent-red)' : undefined}
                  />
                  {policyTemplate === 'uaid' && uaidRequiredBuyerUaid && (
                    <SummaryRow label="Required UAID" value={uaidRequiredBuyerUaid} mono truncate accent="var(--brand-blue)" />
                  )}
                  {registeredEvaluatorState?.active && (
                    <SummaryRow label="Custom Evaluator" value="Registered" accent="var(--accent-green)" />
                  )}
                  <SummaryRow label="Identity" value={providerUaid} mono truncate accent="var(--brand-blue)" />
                  <SummaryRow label="Settlement" value={connectedNetwork.name} accent={connectedNetwork.color} />
                </div>
              </div>

              {/* Navigation */}
              <div className="flex gap-3">
                <button onClick={() => setStep('upload')} className="btn-outline flex-1">
                  ← Back
                </button>
                <button
                  onClick={() => setStep('publish')}
                  disabled={parsedConditionCount === -1}
                  className="btn-primary flex-1"
                >
                  Review & Publish →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3 — Publish ── */}
        {step === 'publish' && (
          <div className="animate-in space-y-6">
            <div
              className="rounded-2xl p-8 space-y-6"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Publish to Chain
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Two on-chain transactions are required. Your wallet will prompt you for each.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { label: 'Encrypt dataset locally', detail: 'AES-256-GCM, client-side', icon: '🔐' },
                  { label: 'Upload ciphertext to broker', detail: 'Encrypted blob only', icon: '📤' },
                  { label: 'Register dataset on-chain', detail: 'Transaction 1 of 2', icon: '⛓️' },
                  { label: 'Create policy on-chain', detail: 'Transaction 2 of 2', icon: '📋' },
                  { label: 'Confirm with broker', detail: 'Links policy to ciphertext', icon: '✅' },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: 'var(--surface-0)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span className="text-lg shrink-0">{s.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {s.label}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {s.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm leading-relaxed"
                  style={{
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    background: 'rgba(239, 68, 68, 0.05)',
                    color: 'var(--accent-red)',
                  }}
                >
                  <p className="font-semibold mb-0.5">Transaction failed</p>
                  <p className="text-xs" style={{ wordBreak: 'break-word' }}>{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep('terms')} disabled={isPublishing} className="btn-outline flex-1">
                  ← Back
                </button>
                <button onClick={handlePublish} disabled={isPublishing} className="btn-primary flex-1">
                  {isPublishing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                      </svg>
                      Publishing…
                    </span>
                  ) : (
                    'Publish Dataset'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4 — Done ── */}
        {step === 'done' && (
          <div className="animate-in">
            <div
              className="rounded-2xl p-10 text-center space-y-6"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
                style={{ background: 'rgba(72, 223, 123, 0.1)' }}
              >
                ✅
              </div>
              <div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Dataset Published!
                </h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Your encrypted dataset is now live and available for purchase on the marketplace.
                </p>
              </div>

              <div
                className="rounded-xl px-4 text-left"
                style={{
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border)',
                }}
              >
                <SummaryRow label="Policy ID" value={`#${policyId}`} mono accent="var(--text-primary)" />
                <SummaryRow label="Identity" value={providerUaid} mono truncate accent="var(--brand-blue)" />
                {txHash && (
                  <div className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Transaction
                    </span>
                    <a
                      href={buildTxUrl(txHash) ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold hover:underline"
                      style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}
                    >
                      {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
                    </a>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Link href="/" className="btn-outline flex-1 no-underline text-center">
                  Back to Marketplace
                </Link>
                {policyId && (
                  <Link href={`/policy/${policyId}`} className="btn-primary flex-1 no-underline text-center">
                    View Policy
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
