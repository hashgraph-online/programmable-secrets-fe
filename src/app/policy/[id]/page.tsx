'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  if (!trimmed.toLowerCase().startsWith('uaid:')) {
    return null;
  }
  return trimmed;
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

  const hasReceipt =
    !isProvider && receiptQuery.data != null && receiptQuery.data > 0n;
  const hasPurchased = !isProvider && (!!purchaseTxHash || hasReceipt);

  const metadata = parsePolicyMetadata(policy?.metadataJson);
  const keyReleaseReady = policy?.keyReleaseReady === true && metadata != null;
  const purchaseConditionFields = useMemo(
    () =>
      (policy?.conditions ?? []).filter(
        (condition) => condition.runtimeWitness.kind !== 'none',
      ),
    [policy?.conditions],
  );
  const conditionCount = policy?.conditionCount ?? policy?.conditions.length ?? 0;
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

      const isText = metadata.mimeType.startsWith('text/') || metadata.mimeType === 'application/json';
      return {
        plaintext: isText ? bytesToUtf8(plaintext) : null,
        downloadUrl: isText ? null : URL.createObjectURL(new Blob([bytesToArrayBuffer(plaintext)], { type: metadata.mimeType })),
        mimeType: metadata.mimeType,
        fileName: metadata.fileName,
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
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Decryption failed';
      setUnlockError(msg);
    },
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
        <div className="mx-auto max-w-5xl px-6 py-12">
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
  const networkStory =
    targetNetwork.shortName === 'Arbitrum'
      ? 'UAID and ERC-8004 identity-gated policy path'
      : 'Primary finance-data marketplace flow';
  const providerUaid = normalizeUaid(
    policy.providerUaid ?? metadata?.providerUaid ?? null,
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
      <div className="mx-auto max-w-5xl px-6 py-12">
        <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <Link href="/" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>Marketplace</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-8 stagger">
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
              <h1 className="text-2xl font-semibold sm:text-3xl tracking-tight">{title}</h1>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                  {(policy.providerUaid ?? 'A')[0].toUpperCase()}
                </div>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {policy.providerUaid ? (policy.providerUaid.length > 28 ? `${policy.providerUaid.slice(0, 28)}…` : policy.providerUaid) : 'Anonymous provider'}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {networkStory}
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>About</h2>
              <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
            </div>

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
              {providerTrustEmbedUrl ? (
                <div
                  className="overflow-hidden rounded-2xl"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
                >
                  <iframe
                    src={providerTrustEmbedUrl}
                    title={`Trust and reputation for ${providerUaid}`}
                    loading="lazy"
                    className="w-full"
                    style={{ border: 'none', minHeight: 740, background: 'transparent' }}
                  />
                </div>
              ) : (
                <div
                  className="rounded-2xl p-4 text-sm"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
                >
                  Trust score is unavailable because this seller has not linked a Registry Broker UAID to the policy yet.
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Dataset Details</h2>
              <div className="flex flex-wrap gap-2">
                {metadata?.mimeType && <span className="tag-subtle">{metadata.mimeType}</span>}
                {fileSize && <span className="tag-subtle">{fileSize}</span>}
                <span className="tag-subtle">AES-256-GCM</span>
                <span className="tag-subtle">{conditionCount} condition{conditionCount === 1 ? '' : 's'}</span>
                <span className="tag-subtle">{evaluatorCount} evaluator{evaluatorCount === 1 ? '' : 's'}</span>
              </div>
            </div>

            {/* P0 #2 — Receipt Properties */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Access Receipt Properties</h2>
              <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                {[
                  {
                    icon: '🔒',
                    label: 'Non-Transferable',
                    desc: 'Receipt is an ERC-721 but transfers are blocked by design (ReceiptNonTransferable revert). Prevents resale and secondary-market leakage.',
                    color: 'var(--accent-red)',
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

            {policy.conditions.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                  Policy Evaluators
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
            )}

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

            {decryptedResult && (
              <div className="space-y-4">
                <div className="surface-card-static p-5 space-y-4" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full" style={{ background: 'rgba(34,197,94,0.1)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)' }}><polyline points="20 6 9 17 4 12" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Decrypted Successfully</h3>
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
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Decrypted Data</span>
                      <button type="button" onClick={() => navigator.clipboard.writeText((() => { try { return JSON.stringify(JSON.parse(decryptedResult.plaintext!), null, 2); } catch { return decryptedResult.plaintext!; } })())} className="btn-ghost text-xs">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                        Copy
                      </button>
                    </div>
                    <pre className="max-h-[500px] overflow-auto rounded-xl p-5 text-sm leading-relaxed" style={{ border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      <code>{(() => { try { return JSON.stringify(JSON.parse(decryptedResult.plaintext), null, 2); } catch { return decryptedResult.plaintext; } })()}</code>
                    </pre>
                  </div>
                ) : decryptedResult.downloadUrl ? (
                  <a href={decryptedResult.downloadUrl} download={decryptedResult.fileName} className="btn-primary no-underline inline-flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Download {decryptedResult.fileName}
                  </a>
                ) : null}
              </div>
            )}
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

              {isProvider ? (
                /* ── Provider / Publisher view ── */
                <div className="space-y-3">
                  <div className="rounded-xl p-4" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.06)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-blue)' }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <span className="text-sm font-semibold" style={{ color: 'var(--brand-blue)' }}>You published this dataset</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Your connected wallet matches the provider address for this policy.
                    </p>
                  </div>
                  <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.04)' }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--brand-blue)' }} />
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--brand-blue)', fontFamily: 'var(--font-mono)' }}>{address}</span>
                  </div>
                </div>
              ) : (
                /* ── Buyer view ── */
                <>
                  <div className="flex items-center gap-1">
                    {[
                      { label: 'Purchase', done: hasPurchased },
                      { label: 'Unlock', done: !!decryptedResult },
                      { label: 'View Data', done: !!decryptedResult },
                    ].map((step, i) => (
                      <div key={step.label} className="flex items-center gap-1">
                        {i > 0 && <div className="h-px w-4" style={{ background: step.done ? 'var(--accent-green)' : 'var(--border)' }} />}
                        <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: step.done ? 'rgba(34,197,94,0.1)' : 'var(--surface-3)', color: step.done ? 'var(--accent-green)' : 'var(--text-tertiary)' }}>
                          {step.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                          {step.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isConnected ? (
                    <div className="rounded-xl p-4 text-center space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Connect wallet to purchase</p>
                      <ConnectButton />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.04)' }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>{address}</span>
                      </div>
                      {chainMismatch && (
                        <div className="rounded-lg p-3 text-xs" style={{ border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: 'var(--accent-amber)' }}>
                          Wallet network mismatch. Switch to chain {policy.chainId} ({targetNetwork.shortName}) before purchasing.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {!isProvider && (
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
                  <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)', flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Data decrypted — scroll down to view</span>
                  </div>
                )}
              </div>
              )}

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

              {!isProvider && !hasPurchased && !decryptedResult && (
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
