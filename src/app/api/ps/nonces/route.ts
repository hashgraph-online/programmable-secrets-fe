import { NextRequest, NextResponse } from 'next/server';
import { getKrsService } from '@/lib/server/services';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svc = await getKrsService();
    const result = await svc.issueNonce({
      policyId: body.policyId,
      buyerAddress: body.buyerAddress,
      chainId: body.chainId,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/ps/nonces] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
