import { parseAbi, type Address } from 'viem';

// ── Deployed contract addresses (Robinhood Testnet) ──
export const POLICY_VAULT_ADDRESS: Address =
  '0x073fc3fE9B2c00E470199550870D458D13421614';
export const PAYMENT_MODULE_ADDRESS: Address =
  '0x5b4a056d2203C5940257635F073A253B958ba43c';
export const ACCESS_RECEIPT_ADDRESS: Address =
  '0x4Aa65779ce3dF24E5EeC7a786721765dF50a106b';

// ── ABI (human-readable) ──
export const POLICY_VAULT_ABI = parseAbi([
  'function evaluatorRegistrationFee() view returns (uint256)',
  'function registerPolicyEvaluator(address evaluator,bytes32 metadataHash) payable',
  'function getPolicyEvaluator(address evaluator) view returns ((address registrant,bytes32 metadataHash,uint64 registeredAt,bool active,bool builtIn))',
  'function registerDataset(bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash) returns (uint256 datasetId)',
  'function createPolicyForDataset(uint256 datasetId,address payout,address paymentToken,uint96 price,bool receiptTransferable,bytes32 metadataHash,(address evaluator,bytes configData)[] conditions) returns (uint256 policyId)',
  'function getPolicy(uint256 policyId) view returns ((address provider,address payout,address paymentToken,uint96 price,uint64 createdAt,bool active,bool receiptTransferable,bool allowlistEnabled,bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash,uint256 datasetId,bytes32 conditionsHash,uint32 conditionCount))',
  'function getPolicyConditionCount(uint256 policyId) view returns (uint256)',
  'function getPolicyCondition(uint256 policyId,uint256 index) view returns (address evaluator,bytes configData,bytes32 configHash)',
  'function getDataset(uint256 datasetId) view returns ((address provider,uint64 createdAt,bool active,bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash))',
  'function hasAccess(uint256 policyId, address user) view returns (bool)',
  'function policyCount() view returns (uint256)',
  'function datasetCount() view returns (uint256)',
  'function updatePolicy(uint256 policyId,uint96 newPrice,bool active,bytes32 newMetadataHash)',
  'event DatasetRegistered(uint256 indexed datasetId,address indexed provider,bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash)',
  'event PolicyCreated(uint256 indexed policyId,uint256 indexed datasetId,address indexed provider,address payout,address paymentToken,uint256 price,bool receiptTransferable,bytes32 conditionsHash,uint32 conditionCount,bytes32 metadataHash,bytes32 datasetMetadataHash)',
  'event PolicyUpdated(uint256 indexed policyId,uint256 indexed datasetId,uint256 newPrice,bool active,bytes32 newMetadataHash)',
]);

export const PAYMENT_MODULE_ABI = parseAbi([
  'function purchase(uint256 policyId,address recipient,bytes[] conditionRuntimeInputs) payable returns (uint256 receiptTokenId)',
  'function receiptOfPolicyAndBuyer(uint256 policyId,address buyer) view returns (uint256)',
  'event AccessGranted(uint256 indexed policyId,uint256 indexed datasetId,uint256 indexed receiptTokenId,address buyer,address recipient,address paymentToken,uint256 price,uint64 purchasedAt,bool receiptTransferable,bytes32 ciphertextHash,bytes32 keyCommitment)',
]);
