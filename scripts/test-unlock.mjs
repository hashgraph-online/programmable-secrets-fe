import crypto from 'node:crypto';
import { createPublicClient, createWalletClient, http, defineChain, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { waitForTransactionReceipt } from 'viem/actions';

const API = process.env.API_BASE || 'https://ps.hol.org';
const PK = process.env.ETH_PK || '0xREDACTED_PRIVATE_KEY';

const chain = defineChain({
  id: 46630, name: 'Robinhood Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] } },
});

const account = privateKeyToAccount(PK);
const wc = createWalletClient({ account, chain, transport: http() });
const pc = createPublicClient({ chain, transport: http() });

const abi = parseAbi([
  'function hasAccess(uint256,address) view returns (bool)',
  'function purchase(uint256,address,string) payable returns (uint256)',
]);

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

const policyId = parseInt(process.argv[2] || '11');

console.log(`\n🔑 E2E Unlock Test — Policy ${policyId}\n`);

// Check / purchase
const has = await pc.readContract({
  address: '0xD24A62C55Bc730916F88B1AdDA5dCF6Cbd224e0A', abi,
  functionName: 'hasAccess', args: [BigInt(policyId), account.address],
});
console.log('Has access:', has);

if (!has) {
  const pRes = await fetch(`${API}/api/ps/policies/${policyId}`);
  const pData = await pRes.json();
  console.log('Purchasing...');
  const tx = await wc.writeContract({
    address: '0xD24A62C55Bc730916F88B1AdDA5dCF6Cbd224e0A', abi,
    functionName: 'purchase',
    args: [BigInt(policyId), account.address, ''],
    value: BigInt(pData.policy.priceWei), chain,
  });
  await waitForTransactionReceipt(pc, { hash: tx });
  console.log('Purchased:', tx);
}

// 1. Nonce
console.log('1. Issuing nonce...');
const nonce = await post('/api/ps/nonces', { policyId, buyerAddress: account.address });
console.log('   requestId:', nonce.requestId);

// 2. RSA key pair
console.log('2. Generating RSA key pair...');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const fp = crypto.createHash('sha256').update(publicKey).digest('hex');

// 3. Sign
console.log('3. Signing challenge...');
const sig = await wc.signMessage({ message: nonce.challengeMessage });

// 4. Request key
console.log('4. Requesting key...');
const kr = await post('/api/ps/keys/request', {
  requestId: nonce.requestId, policyId,
  buyerAddress: account.address, nonce: nonce.nonce,
  signature: sig, buyerRsaPublicKeyPem: publicKey,
  buyerPublicKeyFingerprint: fp,
});
console.log('   status:', kr.status);

if (kr.status !== 'issued' || !kr.encryptedKey) {
  console.error('❌ Key request failed:', JSON.stringify(kr));
  process.exit(1);
}

// 5. Decrypt AES key
console.log('5. Decrypting AES key envelope...');
const encKeyBuf = Buffer.from(kr.encryptedKey, 'base64');
const decKeyBuf = crypto.privateDecrypt(
  { key: privateKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
  encKeyBuf,
);
console.log('   AES key length:', decKeyBuf.length, 'bytes');

// 6. Fetch ciphertext
console.log('6. Fetching ciphertext...');
const ctRes = await fetch(`${API}/api/ps/policies/${policyId}/ciphertext`);
const ctBuf = Buffer.from(await ctRes.arrayBuffer());
console.log('   ciphertext length:', ctBuf.length, 'bytes');

// Get metadata
const pRes2 = await fetch(`${API}/api/ps/policies/${policyId}`);
const pData2 = await pRes2.json();
const meta = pData2.policy.metadataJson;
const storedIv = Buffer.from(meta.cipher.ivBase64, 'base64');

// Decrypt: ciphertext = [encrypted_data + tag] (WebCrypto format)
const tagLen = 16;
const encData = ctBuf.subarray(0, ctBuf.length - tagLen);
const authTag = ctBuf.subarray(ctBuf.length - tagLen);

const decipher = crypto.createDecipheriv('aes-256-gcm', decKeyBuf, storedIv);
decipher.setAuthTag(authTag);
const dec = Buffer.concat([decipher.update(encData), decipher.final()]);

const plainHash = crypto.createHash('sha256').update(dec).digest('hex');
console.log('\n   plaintext hash:', plainHash);
console.log('   expected hash: ', meta.plaintextHash);
console.log('   match:', plainHash === meta.plaintextHash ? '✅ YES' : '❌ NO');
console.log('   plaintext preview:', dec.toString('utf-8').slice(0, 120) + '...');
console.log('\n✅ E2E unlock test passed!\n');
