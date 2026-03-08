import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy that checks if a trust embed URL is reachable (returns 200).
 * This avoids CORS issues and lets the client decide whether to render the iframe.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ ok: false, reason: 'missing url' }, { status: 400 });
  }

  // Only allow requests to known registry origins
  const configuredOrigin = process.env.NEXT_PUBLIC_REGISTRY_ORIGIN?.trim();
  const allowedOrigins = [
    request.nextUrl.origin,
    'http://localhost:3000',
    'https://hol.org',
    'https://hol.org/registry',
  ];
  if (configuredOrigin && configuredOrigin.length > 0) {
    allowedOrigins.push(configuredOrigin.replace(/\/+$/, ''));
  }
  const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin));
  if (!isAllowed) {
    return NextResponse.json({ ok: false, reason: 'origin not allowed' }, { status: 403 });
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'ProgrammableSecrets-TrustCheck/1.0',
      },
    });

    return NextResponse.json(
      { ok: response.ok, status: response.status },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=60',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'fetch failed' },
      { status: 200 },
    );
  }
}
