#!/usr/bin/env node
/**
 * Publish fresh test datasets through the full broker flow.
 * Requires ETH_PK and broker configuration to be provided explicitly.
 *
 * Usage: node script/publish-test-datasets.mjs
 */

import { createHash } from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  keccak256,
  toBytes,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createUaid, toEip155Caip10 } from '@hashgraphonline/standards-sdk';
if (process.env.ETH_PK && !process.env.ETH_PK.startsWith('0x')) {
  process.env.ETH_PK = '0x' + process.env.ETH_PK;
}

// ── Config ──
const BROKER_URL = process.env.BROKER_URL || 'http://localhost:4000';
const RPC_URL = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com/rpc';
const POLICY_VAULT_ADDRESS =
  process.env.POLICY_VAULT_ADDRESS || '0x1FC1624b70206825E9D60E6110F168FaF77E1c75';

const robinhoodTestnet = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const POLICY_VAULT_ABI = parseAbi([
  'function registerDataset(bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash) returns (uint256 datasetId)',
  'function createTimeboundPolicy(uint256 datasetId,address payout,address paymentToken,uint96 price,uint64 expiresAt,bool allowlistEnabled,bytes32 metadataHash,address[] allowlistAccounts) returns (uint256 policyId)',
]);

// ── Crypto helpers (Node.js native) ──
function bytesToBase64(buf) {
  return Buffer.from(buf).toString('base64');
}

async function generateAesKey() {
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportAesKeyBase64(key) {
  const { webcrypto } = await import('node:crypto');
  const raw = await webcrypto.subtle.exportKey('raw', key);
  return bytesToBase64(raw);
}

async function encryptPayload(key, plaintext) {
  const { webcrypto } = await import('node:crypto');
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext: new Uint8Array(ciphertext), iv };
}

function sha256Hex(data) {
  return '0x' + createHash('sha256').update(Buffer.from(data)).digest('hex');
}

// ── Broker API ──
const API_KEY =
  process.env.API_KEY ||
  (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)[0] ||
  '';
if (API_KEY) {
  console.log(`Using API key: ${API_KEY.slice(0, 8)}…`);
} else {
  console.warn('Warning: No API_KEYS found in env — broker auth may fail');
}

async function brokerPost(path, body) {
  const headers = { 'content-type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  const res = await fetch(`${BROKER_URL}/api/v1${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Broker ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Test datasets ──
const TEST_DATASETS = [
  {
    title: 'AAPL Options Chain — Weekly Expiry',
    description: 'Complete Apple options chain data with Greeks, IV surface, and open interest for the nearest weekly expiry.',
    fileName: 'aapl-options-weekly.json',
    mimeType: 'application/json',
    priceEth: '0.00001',
    content: JSON.stringify({
      ticker: 'AAPL',
      expiry: '2026-03-14',
      chain: [
        { strike: 220, type: 'call', bid: 5.20, ask: 5.35, iv: 0.28, delta: 0.65, gamma: 0.03, oi: 12400 },
        { strike: 225, type: 'call', bid: 2.80, ask: 2.95, iv: 0.31, delta: 0.42, gamma: 0.04, oi: 8900 },
        { strike: 220, type: 'put', bid: 3.10, ask: 3.25, iv: 0.27, delta: -0.35, gamma: 0.03, oi: 6700 },
      ],
      generatedAt: new Date().toISOString(),
    }),
  },
  {
    title: 'BTC/ETH Correlation Matrix — 30d',
    description: 'Rolling 30-day Pearson correlation matrix for BTC, ETH, SOL, and AVAX with hourly granularity.',
    fileName: 'crypto-correlation-30d.json',
    mimeType: 'application/json',
    priceEth: '0.00001',
    content: JSON.stringify({
      window: '30d',
      granularity: '1h',
      assets: ['BTC', 'ETH', 'SOL', 'AVAX'],
      matrix: [
        [1.0, 0.87, 0.72, 0.68],
        [0.87, 1.0, 0.79, 0.74],
        [0.72, 0.79, 1.0, 0.81],
        [0.68, 0.74, 0.81, 1.0],
      ],
      computedAt: new Date().toISOString(),
    }),
  },
  {
    title: 'SPY Intraday VWAP Bands',
    description: 'Institutional-grade VWAP with ±1σ/2σ bands for SPY, 1-minute resolution, full trading session.',
    fileName: 'spy-vwap-intraday.json',
    mimeType: 'application/json',
    priceEth: '0.00001',
    content: JSON.stringify({
      ticker: 'SPY',
      date: new Date().toISOString().split('T')[0],
      resolution: '1m',
      bands: {
        vwap: 512.34,
        upper1sigma: 513.78,
        upper2sigma: 515.22,
        lower1sigma: 510.90,
        lower2sigma: 509.46,
      },
      dataPoints: 390,
      generatedAt: new Date().toISOString(),
    }),
  },
];

// ── Main ──
async function main() {
  const pk = process.env.ETH_PK;
  if (!pk) {
    console.error('ETH_PK not found');
    process.exit(1);
  }

  const account = privateKeyToAccount(pk);
  const address = account.address;
  const nativeId = toEip155Caip10(robinhoodTestnet.id, getAddress(address));
  const providerUaid = createUaid(`did:pkh:${nativeId}`, { nativeId });
  console.log(`Provider: ${address}`);
  console.log(`UAID:     ${providerUaid}\n`);

  const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: robinhoodTestnet, transport: http(RPC_URL) });

  for (const ds of TEST_DATASETS) {
    console.log(`━━━ Publishing: ${ds.title} ━━━`);
    try {
      // 1. Encrypt
      const plaintext = new TextEncoder().encode(ds.content);
      const plaintextHash = sha256Hex(plaintext);
      const aesKey = await generateAesKey();
      const contentKeyB64 = await exportAesKeyBase64(aesKey);
      const encrypted = await encryptPayload(aesKey, plaintext);
      const ciphertextBase64 = bytesToBase64(encrypted.ciphertext);
      const ivBase64 = bytesToBase64(encrypted.iv);

      const priceWei = parseEther(ds.priceEth).toString();
      const expiresAtUnix = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7 days

      const metadata = {
        title: ds.title,
        description: ds.description,
        fileName: ds.fileName,
        mimeType: ds.mimeType,
        sizeBytes: plaintext.length,
        plaintextHash,
        providerUaid,
        priceWei,
        createdAt: new Date().toISOString(),
        cipher: { algorithm: 'AES-GCM', ivBase64, version: 1 },
      };

      console.log('  1/5 Encrypted locally');

      // 2. Prepare via broker
      const prepared = await brokerPost('/programmable-secrets/provider/prepare', {
        providerAddress: address,
        providerUaid,
        payoutAddress: address,
        priceWei,
        contentKeyB64,
        ciphertextBase64,
        metadata,
        expiresAtUnix,
      });
      console.log(`  2/5 Broker staged: ${prepared.stagedPolicyId}`);

      // 3. Register dataset on-chain
      const oi = prepared.onchainInputs;
      const registerTx = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'registerDataset',
        args: [
          oi.ciphertextHash,
          oi.keyCommitment,
          oi.metadataHash,
          oi.providerUaidHash,
        ],
      });
      const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerTx });
      const datasetLog = registerReceipt.logs.find((log) => {
        try {
          return log.topics[0] === keccak256(
            toBytes('DatasetRegistered(uint256,address,bytes32,bytes32,bytes32,bytes32)')
          );
        } catch { return false; }
      });
      const datasetId = datasetLog?.topics[1] ? BigInt(datasetLog.topics[1]) : 1n;
      console.log(`  3/5 Dataset registered on-chain (ID: ${datasetId}) — tx: ${registerTx.slice(0, 14)}…`);

      // 4. Create policy on-chain
      const policyTx = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'createTimeboundPolicy',
        args: [
          datasetId,
          getAddress(address),
          '0x0000000000000000000000000000000000000000',
          BigInt(priceWei),
          BigInt(expiresAtUnix),
          false,
          oi.metadataHash,
          [],
        ],
      });
      const policyReceipt = await publicClient.waitForTransactionReceipt({ hash: policyTx });
      const policyLog = policyReceipt.logs.find((log) => {
        try {
          return log.topics[0] === keccak256(
            toBytes('PolicyCreated(uint256,uint256,address,address,address,bytes32,uint256,uint64,bool,bytes32,bytes32)')
          );
        } catch { return false; }
      });
      const createdPolicyId = policyLog?.topics[1] ? Number(BigInt(policyLog.topics[1])) : 1;
      console.log(`  4/5 Policy created on-chain (ID: ${createdPolicyId}) — tx: ${policyTx.slice(0, 14)}…`);

      // 5. Confirm with broker
      await brokerPost('/programmable-secrets/provider/confirm', {
        stagedPolicyId: prepared.stagedPolicyId,
        policyId: createdPolicyId,
        createdTxHash: policyTx,
        createdBlockNumber: Number(policyReceipt.blockNumber),
      });
      console.log(`  5/5 Broker confirmed ✅`);
      console.log(`  → Policy #${createdPolicyId} live at ${ds.priceEth} ETH\n`);
    } catch (e) {
      const cause = e.cause ? ` (${e.cause.code ?? e.cause.message ?? e.cause})` : '';
      console.error(`  ✗ Failed: ${e.message}${cause}\n`);
    }
  }

  console.log('Done! Refresh the marketplace to see the new datasets.');
}

main().catch(console.error);
