import { NextRequest, NextResponse } from 'next/server';
import { resolveProviderAgentIdentity } from '@/lib/server/registry-provider-agent';

export async function GET(request: NextRequest) {
  const providerAddress = request.nextUrl.searchParams.get('providerAddress');
  const chainIdParam = request.nextUrl.searchParams.get('chainId');
  const policyProviderUaid = request.nextUrl.searchParams.get('policyProviderUaid');

  if (!providerAddress || providerAddress.trim().length === 0) {
    return NextResponse.json(
      { error: 'providerAddress is required' },
      { status: 400 },
    );
  }

  const chainId = Number(chainIdParam);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json(
      { error: 'chainId must be a positive integer' },
      { status: 400 },
    );
  }

  try {
    const identity = await resolveProviderAgentIdentity({
      providerAddress,
      chainId,
      policyProviderUaid,
    });
    return NextResponse.json(identity);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
