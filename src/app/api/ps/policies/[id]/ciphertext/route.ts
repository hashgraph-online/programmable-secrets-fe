import { NextRequest, NextResponse } from 'next/server';
import { getPolicyService } from '@/lib/server/services';
import { createReadStream } from 'node:fs';

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
    const resolved = await svc.resolveCiphertext(policyId);
    if (!resolved) {
      return NextResponse.json({ error: 'Ciphertext not found' }, { status: 404 });
    }
    const ciphertextPath = resolved.path;

    // Read to buffer and return
    const chunks: Buffer[] = [];
    const stream = createReadStream(ciphertextPath);
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return new NextResponse(buffer, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(buffer.length),
      },
    });
  } catch (err) {
    console.error('[api/ps/policies/[id]/ciphertext] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
