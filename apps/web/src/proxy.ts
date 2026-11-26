/**
 * Next.js Proxy (formerly "middleware" — renamed in Next 16).
 *
 * Protects routes by default.
 * When AUTH_DISABLED=true, all routes are public (opt-in).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { schemaDocumentHeaders } from '@/domain/schemas/schemaDocumentRoute';

/** Paths that are always public (even when auth is enabled) */
const PUBLIC_PATHS = ['/login', '/api', '/share', '/invite'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const authDisabled =
    process.env.AUTH_DISABLED?.toLowerCase() === 'true' ||
    process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';

  const next = () => NextResponse.next({ request: { headers: schemaDocumentHeaders(request) } });

  // Auth is ENABLED by default (secure by default).
  // Only disabled when AUTH_DISABLED is explicitly set to 'true'.
  if (authDisabled) {
    return next();
  }

  const { pathname } = request.nextUrl;

  // Allow public paths
  if (pathname === '/.well-known/oauth-authorization-server' || isPublicPath(pathname)) {
    return next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt'
  ) {
    return next();
  }

  // Check for local auth session cookie
  const hasSession = request.cookies.has('t3x-session');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return next();
}

export const config = {
  // Match all paths except static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg).*)'],
};
