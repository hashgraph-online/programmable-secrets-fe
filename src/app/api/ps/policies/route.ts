import { NextRequest, NextResponse } from 'next/server';
import { getPolicyService, getConfig } from '@/lib/server/services';
import { ProgrammableSecretsChainClient } from '@/lib/server/chain-client';
import { resolveProgrammableSecretsChainTarget } from '@/lib/server/contract-manifest';

const logger = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  error: () => undefined,
};

export async function GET() {
  try {
    const svc = await getPolicyService();
    const result = await svc.listPolicies();

    if (result.length > 0) {
      return NextResponse.json({ policies: result, total: result.length });
    }

    // Fallback: scan on-chain policies when DB is empty
    const config = getConfig();
    const target = resolveProgrammableSecretsChainTarget(config);
    if (!target) {
      return NextResponse.json({ policies: [], total: 0 });
    }

    const chainClient = new ProgrammableSecretsChainClient({
      logger,
      rpcUrl: target.rpcUrl,
    });

    const onchainPolicies = await chainClient.scanAllPolicies(
      target.policyVaultAddress,
    );
    const policies = onchainPolicies
      .filter((p) => p.active)
      .map((p) => ({
        id: `onchain-${target.chainId}-${p.policyId}`,
        network: target.network,
        chainId: target.chainId,
        policyId: p.policyId,
        status: 'indexed',
        active: p.active,
        providerAddress: p.provider,
        providerUaid: null,
        providerUaidHash: p.providerUaidHash,
        payoutAddress: p.payout,
        paymentToken: p.paymentToken,
        priceWei: p.priceWei,
        expiresAtUnix: null,
        conditionsHash: p.conditionsHash,
        conditionCount: p.conditionCount,
        conditions: p.conditions.map((c, idx) => ({
          index: idx,
          evaluatorAddress: c.evaluatorAddress,
          configHash: c.configHash,
          configDataHex: c.configDataHex,
          descriptor: null,
          runtimeWitness: { kind: 'none' as const },
        })),
        declaredConditions: [],
        ciphertextHash: p.ciphertextHash,
        keyCommitment: p.keyCommitment,
        metadataHash: p.metadataHash,
        metadataJson: null,
        keyReleaseReady: false,
        policyVaultAddress: target.policyVaultAddress,
        paymentModuleAddress: target.paymentModuleAddress,
        accessReceiptAddress: target.accessReceiptAddress,
        createdTxHash: null,
        confirmedAt: null,
        createdAt: new Date(p.createdAtUnix * 1000).toISOString(),
      }));

    return NextResponse.json({ policies, total: policies.length });
  } catch (err) {
    console.error('[api/ps/policies] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svc = await getPolicyService();

    // Provider prepare endpoint
    if (body.contentKeyB64) {
      const ciphertext = Buffer.from(body.ciphertextBase64, 'base64');
      const result = await svc.preparePolicy({
        chainId: body.chainId ?? null,
        providerAddress: body.providerAddress,
        providerUaid: body.providerUaid,
        payoutAddress: body.payoutAddress,
        paymentToken: body.paymentToken,
        priceWei: body.priceWei,
        metadata: body.metadata,
        ciphertext,
        contentKeyB64: body.contentKeyB64,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (err) {
    console.error('[api/ps/policies] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
