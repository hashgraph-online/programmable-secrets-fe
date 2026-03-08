type Logger = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbi,
  type Hex,
} from 'viem';

export interface ProgrammableSecretsChainClientDeps {
  logger: Logger;
  rpcUrl: string;
}

export interface ProgrammableSecretsOnchainPolicy {
  provider: string;
  payout: string;
  paymentToken: string;
  priceWei: string;
  createdAtUnix: number;
  active: boolean;
  receiptTransferable: boolean;
  ciphertextHash: string;
  keyCommitment: string;
  metadataHash: string;
  providerUaidHash: string;
  datasetId: number;
  conditionsHash: string;
  conditionCount: number;
  conditions: ProgrammableSecretsOnchainCondition[];
}

export interface ProgrammableSecretsOnchainCondition {
  evaluatorAddress: string;
  configDataHex: string;
  configHash: string;
}

export interface ProgrammableSecretsRegisteredEvaluator {
  registrant: string;
  metadataHash: string;
  registeredAtUnix: number;
  active: boolean;
  builtIn: boolean;
}

export interface ProgrammableSecretsTransactionReceipt {
  status: 'success' | 'reverted';
  blockNumber: number;
  blockHash: string;
}

export interface ProgrammableSecretsPolicyCreatedLog {
  logIndex: number;
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
}

export interface ProgrammableSecretsBlockInfo {
  blockNumber: number;
  blockHash: string;
  timestampUnix: number;
}

export type ProgrammableSecretsContractLog =
  | {
      eventName: 'PolicyCreated';
      policyId: number;
      datasetId: number;
      provider: string;
      payout: string;
      paymentToken: string;
      priceWei: string;
      receiptTransferable: boolean;
      conditionsHash: string;
      conditionCount: number;
      metadataHash: string;
      datasetMetadataHash: string;
      transactionHash: string;
      blockHash: string;
      blockNumber: number;
      logIndex: number;
    }
  | {
      eventName: 'PolicyUpdated';
      policyId: number;
      datasetId: number;
      newPriceWei: string;
      active: boolean;
      newMetadataHash: string;
      transactionHash: string;
      blockHash: string;
      blockNumber: number;
      logIndex: number;
    }
  | {
      eventName: 'AccessGranted';
      policyId: number;
      datasetId: number;
      receiptTokenId: number | null;
      buyer: string;
      recipient: string;
      paymentToken: string;
      priceWei: string;
      purchasedAtUnix: number;
      receiptTransferable: boolean;
      ciphertextHash: string;
      keyCommitment: string;
      transactionHash: string;
      blockHash: string;
      blockNumber: number;
      logIndex: number;
    };

const POLICY_VAULT_ABI = parseAbi([
  'function getPolicy(uint256 policyId) view returns ((address provider,address payout,address paymentToken,uint96 price,uint64 createdAt,bool active,bool receiptTransferable,bool allowlistEnabled,bytes32 ciphertextHash,bytes32 keyCommitment,bytes32 metadataHash,bytes32 providerUaidHash,uint256 datasetId,bytes32 conditionsHash,uint32 conditionCount))',
  'function getPolicyConditionCount(uint256 policyId) view returns (uint256)',
  'function getPolicyCondition(uint256 policyId,uint256 index) view returns (address evaluator, bytes configData, bytes32 configHash)',
  'function evaluatorRegistrationFee() view returns (uint256)',
  'function getPolicyEvaluator(address evaluator) view returns ((address registrant,bytes32 metadataHash,uint64 registeredAt,bool active,bool builtIn))',
  'function policyCount() view returns (uint256)',
  'event PolicyCreated(uint256 indexed policyId,uint256 indexed datasetId,address indexed provider,address payout,address paymentToken,uint256 price,bool receiptTransferable,bytes32 conditionsHash,uint32 conditionCount,bytes32 metadataHash,bytes32 datasetMetadataHash)',
  'event PolicyUpdated(uint256 indexed policyId,uint256 indexed datasetId,uint256 newPrice,bool active,bytes32 newMetadataHash)',
]);

const IDENTITY_REGISTRY_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
]);

const PAYMENT_MODULE_ABI = parseAbi([
  'function hasAccess(uint256 policyId, address buyer) view returns (bool)',
  'function receiptOfPolicyAndBuyer(uint256 policyId, address buyer) view returns (uint256)',
  'event AccessGranted(uint256 indexed policyId,uint256 indexed datasetId,uint256 indexed receiptTokenId,address buyer,address recipient,address paymentToken,uint256 price,uint64 purchasedAt,bool receiptTransferable,bytes32 ciphertextHash,bytes32 keyCommitment)',
]);

const toLowerHex = (value: Hex): string => value.toLowerCase();

const normalizeAddress = (value: string): string => getAddress(value).toLowerCase();

interface ProgrammableSecretsRawLog {
  address: string;
  data: Hex;
  topics: readonly Hex[];
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: bigint | number;
  logIndex: bigint | number;
}

const toEventTopics = (topics: readonly Hex[]): [] | [Hex, ...Hex[]] => {
  if (topics.length === 0) {
    return [];
  }

  return [topics[0], ...topics.slice(1)];
};

export class ProgrammableSecretsChainClient {
  private readonly logger: Logger;
  private readonly client: ReturnType<typeof createPublicClient>;

  constructor({ logger, rpcUrl }: ProgrammableSecretsChainClientDeps) {
    this.logger = logger;
    this.client = createPublicClient({
      transport: http(rpcUrl),
    });
  }

  async getLatestBlockNumber(): Promise<number | null> {
    try {
      const blockNumber = await this.client.getBlockNumber();
      return Number(blockNumber);
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets head block', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getPolicyCount(policyVaultAddress: string): Promise<number> {
    try {
      const count = await this.client.readContract({
        address: getAddress(policyVaultAddress),
        abi: POLICY_VAULT_ABI,
        functionName: 'policyCount',
      });
      return Number(count);
    } catch (error) {
      this.logger.warn('Failed to read policy count', {
        policyVaultAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  async scanAllPolicies(
    policyVaultAddress: string,
    limit = 50,
  ): Promise<(ProgrammableSecretsOnchainPolicy & { policyId: number })[]> {
    const count = await this.getPolicyCount(policyVaultAddress);
    if (count === 0) return [];
    const max = Math.min(count, limit);
    const results: (ProgrammableSecretsOnchainPolicy & { policyId: number })[] = [];
    for (let i = 1; i <= max; i++) {
      const policy = await this.getPolicy(policyVaultAddress, i);
      if (policy) {
        results.push({ ...policy, policyId: i });
      }
    }
    return results;
  }

  async getPolicy(
    policyVaultAddress: string,
    policyId: number,
  ): Promise<ProgrammableSecretsOnchainPolicy | null> {
    try {
      const policy = await this.client.readContract({
        address: getAddress(policyVaultAddress),
        abi: POLICY_VAULT_ABI,
        functionName: 'getPolicy',
        args: [BigInt(policyId)],
      });
      const conditionCount = Number(policy.conditionCount);
      const conditions = await Promise.all(
        Array.from({ length: conditionCount }, async (_, index) => {
          const condition = await this.client.readContract({
            address: getAddress(policyVaultAddress),
            abi: POLICY_VAULT_ABI,
            functionName: 'getPolicyCondition',
            args: [BigInt(policyId), BigInt(index)],
          });

          return {
            evaluatorAddress: normalizeAddress(condition[0]),
            configDataHex: toLowerHex(condition[1]),
            configHash: toLowerHex(condition[2]),
          } satisfies ProgrammableSecretsOnchainCondition;
        }),
      );

      return {
        provider: normalizeAddress(policy.provider),
        payout: normalizeAddress(policy.payout),
        paymentToken: normalizeAddress(policy.paymentToken),
        priceWei: policy.price.toString(),
        createdAtUnix: Number(policy.createdAt),
        active: policy.active,
        receiptTransferable: policy.receiptTransferable,
        ciphertextHash: toLowerHex(policy.ciphertextHash),
        keyCommitment: toLowerHex(policy.keyCommitment),
        metadataHash: toLowerHex(policy.metadataHash),
        providerUaidHash: toLowerHex(policy.providerUaidHash),
        datasetId: Number(policy.datasetId),
        conditionsHash: toLowerHex(policy.conditionsHash),
        conditionCount,
        conditions,
      };
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets policy', {
        policyVaultAddress,
        policyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getPolicyEvaluator(
    policyVaultAddress: string,
    evaluatorAddress: string,
  ): Promise<ProgrammableSecretsRegisteredEvaluator | null> {
    try {
      const registration = await this.client.readContract({
        address: getAddress(policyVaultAddress),
        abi: POLICY_VAULT_ABI,
        functionName: 'getPolicyEvaluator',
        args: [getAddress(evaluatorAddress)],
      });

      return {
        registrant: normalizeAddress(registration.registrant),
        metadataHash: toLowerHex(registration.metadataHash),
        registeredAtUnix: Number(registration.registeredAt),
        active: registration.active,
        builtIn: registration.builtIn,
      };
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets evaluator registration', {
        policyVaultAddress,
        evaluatorAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getEvaluatorRegistrationFee(policyVaultAddress: string): Promise<string | null> {
    try {
      const fee = await this.client.readContract({
        address: getAddress(policyVaultAddress),
        abi: POLICY_VAULT_ABI,
        functionName: 'evaluatorRegistrationFee',
      });
      return fee.toString();
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets evaluator registration fee', {
        policyVaultAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getIdentityRegistryOwner(
    identityRegistryAddress: string,
    agentId: number,
  ): Promise<string | null> {
    try {
      const owner = await this.client.readContract({
        address: getAddress(identityRegistryAddress),
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(agentId)],
      });
      return normalizeAddress(owner);
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets identity owner', {
        identityRegistryAddress,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getTransactionReceipt(
    txHash: string,
  ): Promise<ProgrammableSecretsTransactionReceipt | null> {
    try {
      const receipt = await this.client.getTransactionReceipt({
        hash: txHash as Hex,
      });
      return {
        status: receipt.status,
        blockNumber: Number(receipt.blockNumber),
        blockHash: receipt.blockHash.toLowerCase(),
      };
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets transaction receipt', {
        txHash,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getPolicyCreatedLog(params: {
    policyVaultAddress: string;
    txHash: string;
    policyId: number;
  }): Promise<ProgrammableSecretsPolicyCreatedLog | null> {
    try {
      const receipt = await this.client.getTransactionReceipt({
        hash: params.txHash as Hex,
      });

      for (const log of receipt.logs) {
        if (
          normalizeAddress(log.address) !==
          normalizeAddress(params.policyVaultAddress)
        ) {
          continue;
        }

        try {
          const decoded = decodeEventLog({
            abi: POLICY_VAULT_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (
            decoded.eventName === 'PolicyCreated' &&
            Number(decoded.args.policyId) === params.policyId
          ) {
            return {
              logIndex: Number(log.logIndex),
              transactionHash: log.transactionHash.toLowerCase(),
              blockHash: log.blockHash.toLowerCase(),
              blockNumber: Number(log.blockNumber),
            };
          }
        } catch {}
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to decode programmable secrets policy creation log', {
        policyVaultAddress: params.policyVaultAddress,
        txHash: params.txHash,
        policyId: params.policyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getBlock(blockNumber: number): Promise<ProgrammableSecretsBlockInfo | null> {
    try {
      const block = await this.client.getBlock({
        blockNumber: BigInt(blockNumber),
      });
      return {
        blockNumber: Number(block.number),
        blockHash: block.hash.toLowerCase(),
        timestampUnix: Number(block.timestamp),
      };
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets block', {
        blockNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getContractLogs(params: {
    contractAddress?: string;
    paymentModuleAddress?: string;
    policyVaultAddress?: string;
    fromBlock: number;
    toBlock: number;
  }): Promise<ProgrammableSecretsContractLog[]> {
    const addresses = [
      params.contractAddress,
      params.paymentModuleAddress,
      params.policyVaultAddress,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map(normalizeAddress)
      .filter((value, index, values) => values.indexOf(value) === index);

    try {
      const logs = await Promise.all(
        addresses.map((address) =>
          this.client.getLogs({
            address: getAddress(address),
            fromBlock: BigInt(params.fromBlock),
            toBlock: BigInt(params.toBlock),
          }),
        ),
      );

      const decodedLogs = logs.flatMap((entries) =>
        entries.flatMap((log) => this.decodeContractLog(log)),
      );

      return decodedLogs.sort((left, right) => {
        if (left.blockNumber !== right.blockNumber) {
          return left.blockNumber - right.blockNumber;
        }
        return left.logIndex - right.logIndex;
      });
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets contract logs', {
        contractAddress: params.contractAddress ?? null,
        paymentModuleAddress: params.paymentModuleAddress ?? null,
        policyVaultAddress: params.policyVaultAddress ?? null,
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async hasAccess(
    paymentModuleAddress: string,
    policyId: number,
    buyerAddress: string,
  ): Promise<boolean | null> {
    try {
      return await this.client.readContract({
        address: getAddress(paymentModuleAddress),
        abi: PAYMENT_MODULE_ABI,
        functionName: 'hasAccess',
        args: [BigInt(policyId), getAddress(buyerAddress)],
      });
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets access state', {
        paymentModuleAddress,
        policyId,
        buyerAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getReceiptTokenId(
    paymentModuleAddress: string,
    policyId: number,
    buyerAddress: string,
  ): Promise<number | null> {
    try {
      const receiptTokenId = await this.client.readContract({
        address: getAddress(paymentModuleAddress),
        abi: PAYMENT_MODULE_ABI,
        functionName: 'receiptOfPolicyAndBuyer',
        args: [BigInt(policyId), getAddress(buyerAddress)],
      });
      return Number(receiptTokenId);
    } catch (error) {
      this.logger.warn('Failed to read programmable secrets receipt token id', {
        paymentModuleAddress,
        policyId,
        buyerAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private decodeContractLog(
    log: ProgrammableSecretsRawLog,
  ): ProgrammableSecretsContractLog[] {
    try {
      const decoded = decodeEventLog({
        abi: POLICY_VAULT_ABI,
        data: log.data,
        topics: toEventTopics(log.topics),
      });

      if (decoded.eventName === 'PolicyCreated') {
        return [
          {
            eventName: 'PolicyCreated',
            policyId: Number(decoded.args.policyId),
            datasetId: Number(decoded.args.datasetId),
            provider: normalizeAddress(decoded.args.provider),
            payout: normalizeAddress(decoded.args.payout),
            paymentToken: normalizeAddress(decoded.args.paymentToken),
            priceWei: decoded.args.price.toString(),
            receiptTransferable: decoded.args.receiptTransferable,
            conditionsHash: toLowerHex(decoded.args.conditionsHash),
            conditionCount: Number(decoded.args.conditionCount),
            metadataHash: toLowerHex(decoded.args.metadataHash),
            datasetMetadataHash: toLowerHex(decoded.args.datasetMetadataHash),
            transactionHash: log.transactionHash.toLowerCase(),
            blockHash: log.blockHash.toLowerCase(),
            blockNumber: Number(log.blockNumber),
            logIndex: Number(log.logIndex),
          },
        ];
      }

      if (decoded.eventName === 'PolicyUpdated') {
        return [
          {
            eventName: 'PolicyUpdated',
            policyId: Number(decoded.args.policyId),
            datasetId: Number(decoded.args.datasetId),
            newPriceWei: decoded.args.newPrice.toString(),
            active: decoded.args.active,
            newMetadataHash: toLowerHex(decoded.args.newMetadataHash),
            transactionHash: log.transactionHash.toLowerCase(),
            blockHash: log.blockHash.toLowerCase(),
            blockNumber: Number(log.blockNumber),
            logIndex: Number(log.logIndex),
          },
        ];
      }
    } catch {}

    try {
      const decoded = decodeEventLog({
        abi: PAYMENT_MODULE_ABI,
        data: log.data,
        topics: toEventTopics(log.topics),
      });

      if (decoded.eventName === 'AccessGranted') {
        return [
          {
            eventName: 'AccessGranted',
            policyId: Number(decoded.args.policyId),
            datasetId: Number(decoded.args.datasetId),
            receiptTokenId: Number(decoded.args.receiptTokenId),
            buyer: normalizeAddress(decoded.args.buyer),
            recipient: normalizeAddress(decoded.args.recipient),
            paymentToken: normalizeAddress(decoded.args.paymentToken),
            priceWei: decoded.args.price.toString(),
            purchasedAtUnix: Number(decoded.args.purchasedAt),
            receiptTransferable: decoded.args.receiptTransferable,
            ciphertextHash: toLowerHex(decoded.args.ciphertextHash),
            keyCommitment: toLowerHex(decoded.args.keyCommitment),
            transactionHash: log.transactionHash.toLowerCase(),
            blockHash: log.blockHash.toLowerCase(),
            blockNumber: Number(log.blockNumber),
            logIndex: Number(log.logIndex),
          },
        ];
      }
    } catch {}

    return [];
  }
}
