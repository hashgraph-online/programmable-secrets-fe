import { NextRequest, NextResponse } from 'next/server';
import { getPolicyService } from '@/lib/server/services';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svc = await getPolicyService();
    const result = await svc.confirmPolicy({
      stagedPolicyId: body.stagedPolicyId,
      policyId: body.policyId,
      createdTxHash: body.createdTxHash,
      createdBlockNumber: body.createdBlockNumber ?? null,
      createdBlockHash: body.createdBlockHash ?? null,
      createdLogIndex: body.createdLogIndex ?? null,
    });
    if (!result) {
      return NextResponse.json({ error: 'Staged policy not found' }, { status: 404 });
    }
    return NextResponse.json({ policy: result });
  } catch (err) {
    console.error('[api/ps/provider/confirm] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
