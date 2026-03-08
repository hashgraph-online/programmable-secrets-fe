import { NextRequest, NextResponse } from 'next/server';
import { getPolicyImportService } from '@/lib/server/services';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svc = await getPolicyImportService();
    const policy = await svc.importPolicy({
      chainId: body.chainId ?? null,
      policyId: body.policyId,
      bundle: body.bundle,
      createdTxHash: body.createdTxHash ?? null,
      createdBlockNumber: body.createdBlockNumber ?? null,
      createdBlockHash: body.createdBlockHash ?? null,
      createdLogIndex: body.createdLogIndex ?? null,
    });
    if (!policy) {
      return NextResponse.json({ error: 'Policy not found after import' }, { status: 404 });
    }
    return NextResponse.json({ policy });
  } catch (err) {
    console.error('[api/ps/provider/import] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
