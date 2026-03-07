import { NextRequest, NextResponse } from 'next/server';
import { getPolicyService } from '@/lib/server/services';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const policyId = Number(id);
    if (!Number.isFinite(policyId)) {
      return NextResponse.json({ error: 'Invalid policy ID' }, { status: 400 });
    }
    const svc = await getPolicyService();
    const result = await svc.getPolicyById(policyId);
    if (!result) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }
    return NextResponse.json({ policy: result });
  } catch (err) {
    console.error('[api/ps/policies/[id]] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
