import { NextRequest, NextResponse } from 'next/server';
import { getKrsService } from '@/lib/server/services';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;
    const svc = await getKrsService();
    const result = await svc.getRequest(requestId);
    if (!result) {
      return NextResponse.json({ error: 'Key request not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/ps/keys/[requestId]] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
