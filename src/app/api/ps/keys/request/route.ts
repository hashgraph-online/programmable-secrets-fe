import { NextRequest, NextResponse } from 'next/server';
import { getKrsService } from '@/lib/server/services';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svc = await getKrsService();
    const result = await svc.requestKey({
      requestId: body.requestId,
      policyId: body.policyId,
      buyerAddress: body.buyerAddress,
      nonce: body.nonce,
      signature: body.signature,
      buyerRsaPublicKeyPem: body.buyerRsaPublicKeyPem,
      buyerPublicKeyFingerprint: body.buyerPublicKeyFingerprint,
    });
    if (!result) {
      return NextResponse.json({ error: 'Key request not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/ps/keys/request] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
