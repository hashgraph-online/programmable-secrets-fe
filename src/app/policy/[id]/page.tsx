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
import { robinhoodTestnet, buildTxUrl } from '@/lib/contracts/chain';
import { PAYMENT_MODULE_ABI, PAYMENT_MODULE_ADDRESS } from '@/lib/contracts/abi';
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

interface DecryptedResult {
  plaintext: string | null;
  downloadUrl: string | null;
  mimeType: string;
  fileName: string;
  plaintextHash: string;
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
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const publicClient = useMemo(
    () => createPublicClient({ chain: robinhoodTestnet, transport: http() }),
    [],
  );

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

  const policyQuery = useQuery({
    queryKey: ['ps-policy', policyId],
    queryFn: () => broker.getPolicy(policyId),
    enabled: Number.isFinite(policyId) && policyId > 0,
  });

  // Check on-chain if the connected wallet already has a receipt for this policy
  const receiptQuery = useQuery({
    queryKey: ['ps-receipt', policyId, address],
    queryFn: async () => {
      if (!address) return 0n;
      const result = await publicClient.readContract({
        address: PAYMENT_MODULE_ADDRESS,
        abi: PAYMENT_MODULE_ABI,
        functionName: 'receiptOfPolicyAndBuyer',
        args: [BigInt(policyId), address],
      });
      return result as bigint;
    },
    enabled: Number.isFinite(policyId) && policyId > 0 && !!address,
    refetchInterval: purchaseTxHash ? 3000 : false, // Poll after purchase until receipt appears
  });

  const hasPurchased = !!purchaseTxHash || (receiptQuery.data != null && receiptQuery.data > 0n);

  const policy = policyQuery.data?.policy ?? null;
  const metadata = parsePolicyMetadata(policy?.metadataJson);
  const purchaseConditionFields = useMemo(
    () =>
      (policy?.conditions ?? []).filter(
        (condition) => condition.runtimeWitness.kind !== 'none',
      ),
    [policy?.conditions],
  );
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
        chain: robinhoodTestnet,
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

      console.log('[unlock] 1/6 issuing nonce…');
      const nonce = await broker.createNonce({ policyId: policy.policyId, buyerAddress });

      console.log('[unlock] 2/6 generating RSA key pair…');
      const keyPair = await generateBuyerKeyPair();
      const buyerRsaPublicKeyPem = await exportPublicKeyPem(keyPair.publicKey);
      const buyerPublicKeyFingerprint = await getPublicKeyFingerprint(keyPair.publicKey);

      console.log('[unlock] 3/6 requesting wallet signature…');
      const signature = await walletClient.signMessage({
        account: walletClient.account,
        message: nonce.challengeMessage,
      });
      console.log('[unlock] 3/6 signature obtained');

      console.log('[unlock] 4/6 requesting key release…');
      let keyRequest = await broker.requestKey({
        requestId: nonce.requestId,
        policyId: policy.policyId,
        buyerAddress,
        nonce: nonce.nonce,
        signature,
        buyerRsaPublicKeyPem,
        buyerPublicKeyFingerprint,
      });
      console.log('[unlock] 4/6 key request status:', keyRequest.status);

      if (keyRequest.status === 'pending' || keyRequest.status === 'nonce-issued') {
        keyRequest = await broker.pollKeyRequest(nonce.requestId);
      }
      if (keyRequest.status !== 'issued' || !keyRequest.encryptedKey) {
        const msg = keyRequest.errorMessage ?? `Key release denied (status: ${keyRequest.status})`;
        console.error('[unlock] key denied:', msg);
        throw new Error(msg);
      }

      console.log('[unlock] 5/6 decrypting AES key envelope…');
      const rawKey = await decryptEnvelope(keyPair.privateKey, keyRequest.encryptedKey);
      const aesKey = await importAesKeyBase64(bytesToBase64(rawKey));

      console.log('[unlock] 6/6 fetching ciphertext & decrypting…');
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
        console.log('[unlock] primary decrypt failed, trying Node crypto format…');
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
      console.log('[unlock] ✅ success — data decrypted');
      setDecryptedResult(result);
      queryClient.invalidateQueries({ queryKey: ['ps-policy'] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Decryption failed';
      console.error('[unlock] ❌ error:', msg);
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
  const txUrl = buildTxUrl(policy.createdTxHash);

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
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>About</h2>
              <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>Dataset Details</h2>
              <div className="flex flex-wrap gap-2">
                {metadata?.mimeType && <span className="tag-subtle">{metadata.mimeType}</span>}
                {fileSize && <span className="tag-subtle">{fileSize}</span>}
                <span className="tag-subtle">AES-256-GCM</span>
              </div>
            </div>

            <div>
              <button type="button" onClick={() => setShowProof((p) => !p)} className="flex items-center gap-2 text-sm font-medium cursor-pointer bg-transparent border-none" style={{ color: 'var(--text-tertiary)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showProof ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6" /></svg>
                On-chain proof
              </button>
              {showProof && (
                <div className="mt-3 rounded-xl p-4 space-y-2 text-sm" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                  {[
                    { label: 'Ciphertext hash', value: policy.ciphertextHash },
                    { label: 'Key commitment', value: policy.keyCommitment },
                    { label: 'Metadata hash', value: policy.metadataHash },
                    { label: 'Policy vault', value: policy.policyVaultAddress },
                    { label: 'Payment module', value: policy.paymentModuleAddress },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <span className="shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                      <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
                    </div>
                  ))}
                  {txUrl && <a href={txUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>View on explorer ↗</a>}
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
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>Settles on Robinhood Chain Testnet</p>
              </div>

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
                <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.04)' }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>{address}</span>
                </div>
              )}

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
                        This policy needs runtime witness values when you purchase.
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
                  <button onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending || !isConnected || !policy.policyId} className="btn-primary w-full">
                    {purchaseMutation.isPending ? 'Purchasing…' : `Purchase for ${priceLabel}`}
                  </button>
                )}

                {hasPurchased && !decryptedResult && (
                  <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)', flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Access receipt on-chain — ready to unlock</span>
                  </div>
                )}

                {hasPurchased && !decryptedResult && (
                  <button onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending || !isConnected || !policy.policyId} className="btn-primary w-full">
                    {unlockMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                        Generating keys & decrypting…
                      </span>
                    ) : 'Unlock & Decrypt Data'}
                  </button>
                )}

                {decryptedResult && (
                  <div className="rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)', flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Data decrypted — scroll down to view</span>
                  </div>
                )}
              </div>

              {purchaseTxHash && (
                <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Purchase tx: <a href={buildTxUrl(purchaseTxHash) ?? '#'} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--brand-blue)' }}>View on explorer ↗</a>
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
