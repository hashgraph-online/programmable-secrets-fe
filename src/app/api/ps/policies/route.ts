import { NextRequest, NextResponse } from 'next/server';
import { getPolicyService } from '@/lib/server/services';

export async function GET() {
  try {
    const svc = await getPolicyService();
    const result = await svc.listPolicies();
    return NextResponse.json({ policies: result, total: result.length });
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
