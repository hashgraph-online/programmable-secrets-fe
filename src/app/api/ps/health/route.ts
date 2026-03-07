import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/server/services';

export async function GET() {
  const config = getConfig();
  return NextResponse.json({
    enabled: config.enabled,
    network: config.network,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    paymentModuleAddress: config.paymentModuleAddress,
    policyVaultAddress: config.policyVaultAddress,
    accessReceiptAddress: config.accessReceiptAddress,
    krsConfigured: Boolean(config.krsMasterKey),
  });
}
