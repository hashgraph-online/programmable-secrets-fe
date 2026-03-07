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

type Step = 'upload' | 'terms' | 'publish' | 'done';

function deriveUaid(address: string, chainId: number = 46630): string {
  return `uaid:eip155:${chainId}:${address.toLowerCase()}`;
}

export function ProviderClient() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const providerUaid = useMemo(
    () => (address ? deriveUaid(address, chainId ?? 46630) : ''),
    [address, chainId],
  );

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceEth, setPriceEth] = useState('0.00001');
  const [conditionJson, setConditionJson] = useState('[]');
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
      const txHash = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'registerPolicyEvaluator',
        args: [getAddress(normalizedAddress), metadataHash as `0x${string}`],
        value: feeWei,
        chain: robinhoodTestnet,
        account: walletClient.account,
      });
      await waitForTransactionReceipt(publicClient, { hash: txHash });

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
            toBytes('PolicyCreated(uint256,uint256,address,address,address,uint256,bytes32,uint32,bytes32,bytes32)')
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
  }, [file, walletClient, address, title, description, priceEth, conditionJson, publicClient, providerUaid]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <div className="surface-card-static max-w-md p-8 text-center space-y-4">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
            style={{ background: 'var(--surface-3)' }}
          >
            🔐
          </div>
          <h2 className="text-xl font-semibold">Connect Your Wallet</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Connect MetaMask to publish encrypted datasets on Robinhood Chain.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  const stepIndex = ['upload', 'terms', 'publish', 'done'].indexOf(step);

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Steps indicator */}
        <div className="mb-10 flex items-center justify-center gap-2">
          {(['upload', 'terms', 'publish', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all"
                style={{
                  background:
                    step === s
                      ? 'var(--brand-blue)'
                      : i < stepIndex
                      ? 'rgba(34, 197, 94, 0.1)'
                      : 'var(--surface-3)',
                  color:
                    step === s
                      ? 'var(--text-inverse)'
                      : i < stepIndex
                      ? 'var(--accent-green)'
                      : 'var(--text-tertiary)',
                }}
              >
                {i < stepIndex ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="h-px w-8" style={{ background: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <div className="surface-card-static p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Upload Dataset</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Select a file to encrypt and publish as a purchasable dataset.
              </p>
            </div>

            {/* Identity badge */}
            <div
              className="rounded-xl p-4 space-y-1"
              style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Publishing as
                </span>
              </div>
              <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {providerUaid}
              </p>
            </div>

            <label
              className="group block cursor-pointer rounded-xl p-10 text-center transition-all duration-200"
              style={{
                border: '2px dashed var(--border)',
                background: 'var(--surface-2)',
              }}
            >
              <input type="file" className="hidden" onChange={handleFileChange} />
              {file ? (
                <div className="space-y-2">
                  <div className="text-3xl">📄</div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {file.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl">📁</div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Drop a file or click to browse
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    JSON, CSV, PDF, or any file type
                  </p>
                </div>
              )}
            </label>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. TSLA Volatility Model"
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </label>
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
              Continue
            </button>
          </div>
        )}

        {/* Terms step */}
        {step === 'terms' && (
          <div className="surface-card-static p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Set Terms</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Define pricing and optional generic condition descriptors.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Price (ETH)
                </label>
                <input
                  type="text"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Condition Descriptors (JSON)
              </label>
              <textarea
                value={conditionJson}
                onChange={(e) => setConditionJson(e.target.value)}
                rows={8}
                className="input-field resize-y"
                placeholder={`[]\n\nor\n[\n  {\n    "kind": "custom-static",\n    "evaluatorAddress": "0x...",\n    "configDataHex": "0x...",\n    "runtimeWitness": { "kind": "none" }\n  }\n]`}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Use `[]` for an open paid policy, or provide evaluator-backed descriptors for generic onchain conditions.
              </p>
            </div>

            <div
              className="rounded-xl p-4 space-y-4"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Register Custom Evaluator
                </h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Anyone can register a custom evaluator contract on the PolicyVault for{' '}
                  {evaluatorRegistrationFeeWei ? `${formatEther(BigInt(evaluatorRegistrationFeeWei))} ETH` : '0.05 ETH'}.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Evaluator Contract Address
                </label>
                <input
                  type="text"
                  value={customEvaluatorAddress}
                  onChange={(e) => setCustomEvaluatorAddress(e.target.value)}
                  placeholder="0x..."
                  className="input-field"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Evaluator Metadata (JSON)
                </label>
                <textarea
                  value={customEvaluatorMetadataJson}
                  onChange={(e) => setCustomEvaluatorMetadataJson(e.target.value)}
                  rows={5}
                  className="input-field resize-y"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleRegisterEvaluator}
                  disabled={isRegisteringEvaluator || !walletClient || !customEvaluatorAddress.trim()}
                  className="btn-outline"
                  type="button"
                >
                  {isRegisteringEvaluator ? 'Registering…' : 'Register Evaluator'}
                </button>
                {isLoadingEvaluatorState && (
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Checking registration…
                  </span>
                )}
                {registeredEvaluatorState && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: registeredEvaluatorState.active ? 'var(--accent-green)' : 'var(--accent-red)' }}
                  >
                    {registeredEvaluatorState.active ? 'Registered and active' : 'Registered but inactive'}
                  </span>
                )}
              </div>

              {registeredEvaluatorState && (
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <div>Registrant: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{registeredEvaluatorState.registrant}</span></div>
                  <div>Metadata hash: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{registeredEvaluatorState.metadataHash}</span></div>
                </div>
              )}
            </div>

            <div
              className="rounded-xl p-4 space-y-2 text-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {[
                { label: 'File', value: file?.name ?? '' },
                { label: 'Price', value: `${priceEth} ETH` },
                { label: 'Conditions', value: (() => {
                  try {
                    const parsed = JSON.parse(conditionJson) as unknown;
                    return Array.isArray(parsed) ? String(parsed.length) : 'invalid';
                  } catch {
                    return 'invalid';
                  }
                })() },
                { label: 'Custom Evaluator', value: registeredEvaluatorState?.active ? 'registered' : 'optional' },
                { label: 'Identity', value: providerUaid, mono: true, color: 'var(--brand-blue)' },
                { label: 'Settlement', value: 'Robinhood Chain', color: 'var(--accent-blue)' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                  <span>{row.label}</span>
                  <span
                    className={`font-semibold ${row.mono ? 'text-xs truncate max-w-[220px]' : ''}`}
                    style={{ color: row.color ?? 'var(--text-primary)', fontFamily: row.mono ? 'var(--font-mono)' : undefined }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('upload')} className="btn-outline flex-1">
                Back
              </button>
              <button onClick={() => setStep('publish')} className="btn-primary flex-1">
                Review & Publish
              </button>
            </div>
          </div>
        )}

        {/* Publish step */}
        {step === 'publish' && (
          <div className="surface-card-static p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Publish to Chain</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Two transactions: register the dataset, then create the policy.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Encrypt dataset locally', icon: '🔐' },
                { label: 'Upload ciphertext to broker', icon: '📤' },
                { label: 'Register dataset on-chain (tx 1)', icon: '⛓️' },
                { label: 'Create policy on-chain (tx 2)', icon: '📋' },
                { label: 'Confirm with broker', icon: '✅' },
              ].map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                </div>
              ))}
            </div>

            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'rgba(239, 68, 68, 0.06)',
                  color: 'var(--accent-red)',
                }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('terms')} disabled={isPublishing} className="btn-outline flex-1">
                Back
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
        )}

        {/* Done step */}
        {step === 'done' && (
          <div className="surface-card-static p-8 text-center space-y-6">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
              style={{ background: 'rgba(34, 197, 94, 0.1)' }}
            >
              ✅
            </div>
            <div>
              <h2 className="text-xl font-semibold">Dataset Published!</h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your encrypted dataset is now available for purchase on Robinhood Chain.
              </p>
            </div>

            <div
              className="rounded-xl p-4 space-y-2 text-sm text-left"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>Policy ID</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>#{policyId}</span>
              </div>
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>Identity</span>
                <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}>
                  {providerUaid}
                </span>
              </div>
              {txHash && (
                <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                  <span>Transaction</span>
                  <a
                    href={buildTxUrl(txHash) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                    style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}
                  >
                    {txHash.slice(0, 10)}…{txHash.slice(-6)}
                  </a>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Link href="/" className="btn-outline flex-1 no-underline text-center">
                Back to Marketplace
              </Link>
              {policyId && (
                <a href={`/policy/${policyId}`} className="btn-primary flex-1 no-underline text-center">
                  View Policy
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
