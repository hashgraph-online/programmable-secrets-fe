#!/usr/bin/env node
/**
 * Seed script — creates demo policies end-to-end.
 * 1. Generates a fake file content, encrypts it client-side
 * 2. POSTs to /api/ps/provider/prepare (stages policy + stores ciphertext)
 * 3. Sends on-chain txns: registerDataset + createTimeboundPolicy
 * 4. POSTs to /api/ps/provider/confirm (finalises the policy row)
 *
 * Usage:
 *   node scripts/seed-policies.mjs
 *
 * Env:
 *   API_BASE  — default https://ps.hol.org
 *   ETH_PK   — deployer private key on Robinhood testnet
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  parseEther,
  parseAbi,
  keccak256,
  toBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'node:crypto';

// ── Config ──
const API_BASE = process.env.API_BASE || 'https://ps.hol.org';
const ETH_PK = process.env.ETH_PK || '0xREDACTED_PRIVATE_KEY';

const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] } },
  testnet: true,
});

const POLICY_VAULT = '0x3e604b76Ca87682B4813053C0801Ab8f713f55A8';
const ABI = parseAbi([
  'function registerDataset(bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash) returns (uint256 datasetId)',
  'function createTimeboundPolicy(uint256 datasetId,address payout,address paymentToken,uint96 price,uint64 expiresAt,bool allowlistEnabled,bytes32 metadataHash,address[] allowlistAccounts) returns (uint256 policyId)',
  'event DatasetRegistered(uint256 indexed datasetId,address indexed provider,bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash)',
  'event PolicyCreated(uint256 indexed policyId,uint256 indexed datasetId,address indexed provider,address payout,address paymentToken,bytes32 policyType,uint256 price,uint64 expiresAt,bool allowlistEnabled,bytes32 metadataHash,bytes32 datasetMetadataHash)',
]);

// ── Helpers ──
function buf2b64(buf) { return Buffer.from(buf).toString('base64'); }

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ── Demo datasets to create ──
const DATASETS = [
  {
    title: 'TSLA Volatility Surface — Q1 2026',
    description: 'High-resolution implied-volatility surface for TSLA options, 30-min snapshots across all listed strikes & maturities.',
    fileName: 'tsla-vol-surface-q1-2026.csv',
    mimeType: 'text/csv',
    priceEth: '0.0001',
    expiresHours: 720,
    content: 'strike,expiry,iv,delta,gamma,theta,vega\n150,2026-03-21,0.42,0.65,0.012,-0.15,0.38\n160,2026-03-21,0.39,0.55,0.015,-0.12,0.41\n170,2026-03-21,0.35,0.45,0.018,-0.10,0.44\n180,2026-06-20,0.38,0.50,0.014,-0.08,0.52\n190,2026-06-20,0.34,0.40,0.016,-0.07,0.55\n200,2026-09-18,0.31,0.35,0.019,-0.05,0.58',
  },
  {
    title: 'DEX Arbitrage Signals — Robinhood Testnet',
    description: 'Real-time cross-DEX arbitrage opportunities detected on Robinhood Chain testnet with confidence scores.',
    fileName: 'dex-arb-signals.json',
    mimeType: 'application/json',
    priceEth: '0.00005',
    expiresHours: 168,
    content: JSON.stringify({
      signals: [
        { pair: 'ETH/USDC', dex_a: 'UniswapV3', dex_b: 'SushiSwap', spread_bps: 15, confidence: 0.92, timestamp: new Date().toISOString() },
        { pair: 'WBTC/ETH', dex_a: 'Curve', dex_b: 'Balancer', spread_bps: 8, confidence: 0.87, timestamp: new Date().toISOString() },
      ],
      metadata: { chain_id: 46630, block: 12345678, generated_at: new Date().toISOString() },
    }, null, 2),
  },
  {
    title: 'Smart Contract Audit Report — DeFi Vault',
    description: 'Independent security audit report for a DeFi yield-vault contract. Includes vulnerability findings, severity ratings, and remediation steps.',
    fileName: 'audit-report-defi-vault.json',
    mimeType: 'application/json',
    priceEth: '0.001',
    expiresHours: 2160,
    content: JSON.stringify({
      audit: {
        target: '0xABCD...1234',
        auditor: 'CryptoSec Labs',
        date: '2026-03-01',
        findings: [
          { id: 'F-001', severity: 'Critical', title: 'Reentrancy in withdraw()', status: 'Fixed' },
          { id: 'F-002', severity: 'High', title: 'Unchecked return value in token transfer', status: 'Acknowledged' },
          { id: 'F-003', severity: 'Medium', title: 'Missing access control on emergency pause', status: 'Fixed' },
          { id: 'F-004', severity: 'Low', title: 'Unused state variables increase deployment cost', status: 'Won\'t fix' },
        ],
        overall_risk: 'Medium',
        recommendation: 'Deploy after fixing Critical and High findings',
      },
    }, null, 2),
  },
];

// ── Main ──
async function main() {
  const account = privateKeyToAccount(ETH_PK);
  const address = account.address;
  const providerUaid = `uaid:eip155:46630:${address.toLowerCase()}`;

  console.log(`\n🔐 Seeding policies on ${API_BASE}`);
  console.log(`   Provider: ${address}`);
  console.log(`   UAID:     ${providerUaid}\n`);

  const walletClient = createWalletClient({
    account,
    chain: robinhoodTestnet,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(),
  });

  for (const ds of DATASETS) {
    console.log(`\n━━━ ${ds.title} ━━━`);

    // 1. Generate AES key, encrypt content
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const contentBytes = Buffer.from(ds.content, 'utf-8');
    const encrypted = Buffer.concat([cipher.update(contentBytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    // WebCrypto AES-GCM outputs ciphertext = encrypted_data + auth_tag (tag appended).
    // The IV is stored separately in metadata.cipher.ivBase64.
    const ciphertext = Buffer.concat([encrypted, tag]);
    const contentKeyB64 = buf2b64(aesKey);
    const ciphertextBase64 = buf2b64(ciphertext);
    const plaintextHash = '0x' + crypto.createHash('sha256').update(contentBytes).digest('hex');

    const priceWei = parseEther(ds.priceEth).toString();
    const expiresAtUnix = Math.floor(Date.now() / 1000) + ds.expiresHours * 3600;

    const metadata = {
      title: ds.title,
      description: ds.description,
      fileName: ds.fileName,
      mimeType: ds.mimeType,
      sizeBytes: contentBytes.length,
      plaintextHash,
      providerUaid,
      priceWei,
      createdAt: new Date().toISOString(),
      cipher: { algorithm: 'AES-GCM', ivBase64: buf2b64(iv), version: 1 },
    };

    // 2. Prepare with backend
    console.log('   📤 Preparing policy with backend...');
    const prepared = await post('/api/ps/provider/prepare', {
      providerAddress: address,
      providerUaid,
      payoutAddress: address,
      priceWei,
      contentKeyB64,
      ciphertextBase64,
      metadata,
      expiresAtUnix,
    });
    console.log(`   ✅ Staged: ${prepared.stagedPolicyId}`);

    // 3. Register dataset on-chain
    console.log('   ⛓️  Registering dataset on-chain...');
    const registerHash = await walletClient.writeContract({
      address: POLICY_VAULT,
      abi: ABI,
      functionName: 'registerDataset',
      args: [
        prepared.onchainInputs?.ciphertextHash || prepared.ciphertextHash,
        prepared.onchainInputs?.keyCommitment || prepared.keyCommitment,
        prepared.onchainInputs?.metadataHash || prepared.metadataHash,
        prepared.onchainInputs?.providerUaidHash || prepared.providerUaidHash,
      ],
    });
    console.log(`   Tx: ${registerHash}`);
    const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });

    const datasetTopic = keccak256(
      toBytes('DatasetRegistered(uint256,address,bytes32,bytes32,bytes32,bytes32)')
    );
    const dsLog = registerReceipt.logs.find(l => l.topics[0] === datasetTopic);
    const datasetId = dsLog?.topics[1] ? BigInt(dsLog.topics[1]) : 1n;
    console.log(`   ✅ Dataset ID: ${datasetId}`);

    // 4. Create policy on-chain
    console.log('   📋 Creating policy on-chain...');
    const policyHash = await walletClient.writeContract({
      address: POLICY_VAULT,
      abi: ABI,
      functionName: 'createTimeboundPolicy',
      args: [
        datasetId,
        address,
        '0x0000000000000000000000000000000000000000',
        BigInt(priceWei),
        BigInt(expiresAtUnix),
        false,
        prepared.onchainInputs?.metadataHash || prepared.metadataHash,
        [],
      ],
    });
    console.log(`   Tx: ${policyHash}`);
    const policyReceipt = await publicClient.waitForTransactionReceipt({ hash: policyHash });

    const policyTopic = keccak256(
      toBytes('PolicyCreated(uint256,uint256,address,address,address,bytes32,uint256,uint64,bool,bytes32,bytes32)')
    );
    const pLog = policyReceipt.logs.find(l => l.topics[0] === policyTopic);
    const onchainPolicyId = pLog?.topics[1] ? Number(BigInt(pLog.topics[1])) : 1;
    console.log(`   ✅ On-chain Policy ID: ${onchainPolicyId}`);

    // 5. Confirm with backend
    console.log('   🔄 Confirming with backend...');
    const confirmed = await post('/api/ps/provider/confirm', {
      stagedPolicyId: prepared.stagedPolicyId,
      policyId: onchainPolicyId,
      createdTxHash: policyHash,
      createdBlockNumber: Number(policyReceipt.blockNumber),
    });
    console.log(`   ✅ Policy confirmed: ${confirmed.policy?.status || 'finalized'}`);
  }

  // Verify
  console.log('\n━━━ Verification ━━━');
  const res = await fetch(`${API_BASE}/api/ps/policies`);
  const data = await res.json();
  console.log(`   Policies listed: ${data.total}`);
  for (const p of data.policies) {
    console.log(`   • #${p.policyId} — ${p.metadataJson?.title || 'untitled'} (${p.status})`);
  }
  console.log('\n✅ Done!\n');
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err.message || err);
  process.exit(1);
});
