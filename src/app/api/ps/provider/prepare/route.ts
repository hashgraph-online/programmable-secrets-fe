import { NextRequest, NextResponse } from 'next/server';
import { getPolicyService } from '@/lib/server/services';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svc = await getPolicyService();
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
  } catch (err) {
    console.error('[api/ps/provider/prepare] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
