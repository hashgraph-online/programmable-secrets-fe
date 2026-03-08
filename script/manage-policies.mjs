#!/usr/bin/env node
/**
 * Manage on-chain policies on Robinhood Chain Testnet:
 *   - Deactivate existing policies (set active=false)
 *   - Update prices to testnet-friendly amounts
 *
 * Usage:
 *   node script/manage-policies.mjs list
 *   node script/manage-policies.mjs deactivate-all
 *   node script/manage-policies.mjs update-prices
 *
 * Requires ETH_PK to be provided explicitly via the environment.
 */

import { createPublicClient, createWalletClient, http, parseAbi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Ensure ETH_PK is 0x-prefixed
if (process.env.ETH_PK && !process.env.ETH_PK.startsWith('0x')) {
  process.env.ETH_PK = '0x' + process.env.ETH_PK;
}

// ── Config ──
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
  'function policyCount() view returns (uint256)',
  'function getPolicy(uint256 policyId) view returns ((address provider,address payout,address paymentToken,uint96 price,uint64 createdAt,uint64 expiresAt,bool active,bool allowlistEnabled,bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash,uint256 datasetId,bytes32 policyType,bytes32 requiredBuyerUaidHash,address identityRegistry,uint256 agentId))',
  'function updatePolicy(uint256 policyId,uint96 newPrice,uint64 newExpiresAt,bool active,bool allowlistEnabled,bytes32 newMetadataHash)',
]);

// ── Helpers ──
const publicClient = createPublicClient({
  chain: robinhoodTestnet,
  transport: http(RPC_URL),
});

function getWalletClient() {
  const pk = process.env.ETH_PK;
  if (!pk) {
    console.error('Error: ETH_PK environment variable is required');
    process.exit(1);
  }
  const account = privateKeyToAccount(pk);
  console.log(`Using account: ${account.address}`);
  return createWalletClient({
    account,
    chain: robinhoodTestnet,
    transport: http(RPC_URL),
  });
}

async function listPolicies() {
  const count = await publicClient.readContract({
    address: POLICY_VAULT_ADDRESS,
    abi: POLICY_VAULT_ABI,
    functionName: 'policyCount',
  });
  console.log(`\nTotal policies on-chain: ${count}\n`);

  for (let i = 1n; i <= count; i++) {
    try {
      const p = await publicClient.readContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'getPolicy',
        args: [i],
      });
      console.log(`Policy #${i}:`);
      console.log(`  Provider:  ${p.provider}`);
      console.log(`  Price:     ${formatEther(p.price)} ETH (${p.price} wei)`);
      console.log(`  Active:    ${p.active}`);
      console.log(`  ExpiresAt: ${new Date(Number(p.expiresAt) * 1000).toISOString()}`);
      console.log(`  DatasetID: ${p.datasetId}`);
      console.log(`  MetaHash:  ${p.metadataHash}`);
      console.log('');
    } catch (e) {
      console.log(`Policy #${i}: error reading — ${e.message}\n`);
    }
  }
}

async function deactivateAll() {
  const walletClient = getWalletClient();
  const count = await publicClient.readContract({
    address: POLICY_VAULT_ADDRESS,
    abi: POLICY_VAULT_ABI,
    functionName: 'policyCount',
  });
  console.log(`\nDeactivating all ${count} policies...\n`);

  for (let i = 1n; i <= count; i++) {
    try {
      const p = await publicClient.readContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'getPolicy',
        args: [i],
      });

      if (p.provider.toLowerCase() !== walletClient.account.address.toLowerCase()) {
        console.log(`Policy #${i}: skip — owned by ${p.provider} (not you)`);
        continue;
      }
      if (!p.active) {
        console.log(`Policy #${i}: already inactive`);
        continue;
      }

      // Keep the same price, expiry, allowlist, metadata — just set active=false
      const tx = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'updatePolicy',
        args: [i, p.price, p.expiresAt, false, p.allowlistEnabled, p.metadataHash],
      });
      console.log(`Policy #${i}: deactivated — tx ${tx}`);

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✓ confirmed`);
    } catch (e) {
      console.error(`Policy #${i}: error — ${e.message}`);
    }
  }
  console.log('\nDone!');
}

async function updatePrices() {
  const walletClient = getWalletClient();
  const count = await publicClient.readContract({
    address: POLICY_VAULT_ADDRESS,
    abi: POLICY_VAULT_ABI,
    functionName: 'policyCount',
  });
  console.log(`\nUpdating prices on ${count} policies to 0.00001 ETH...\n`);

  const newPrice = 10000000000000n; // 0.00001 ETH — very cheap for testnet

  for (let i = 1n; i <= count; i++) {
    try {
      const p = await publicClient.readContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'getPolicy',
        args: [i],
      });

      if (p.provider.toLowerCase() !== walletClient.account.address.toLowerCase()) {
        console.log(`Policy #${i}: skip — owned by ${p.provider}`);
        continue;
      }

      const currentPriceEth = formatEther(p.price);
      console.log(`Policy #${i}: ${currentPriceEth} ETH → 0.00001 ETH`);

      const tx = await walletClient.writeContract({
        address: POLICY_VAULT_ADDRESS,
        abi: POLICY_VAULT_ABI,
        functionName: 'updatePolicy',
        args: [i, newPrice, p.expiresAt, p.active, p.allowlistEnabled, p.metadataHash],
      });
      console.log(`  tx: ${tx}`);

      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✓ confirmed — now 0.00001 ETH`);
    } catch (e) {
      console.error(`Policy #${i}: error — ${e.message}`);
    }
  }
  console.log('\nDone!');
}

// ── CLI ──
const command = process.argv[2] || 'list';
switch (command) {
  case 'list':
    await listPolicies();
    break;
  case 'deactivate-all':
    await deactivateAll();
    break;
  case 'update-prices':
    await updatePrices();
    break;
  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: ETH_PK=0x... node script/manage-policies.mjs [list|deactivate-all|update-prices]');
}
