/**
 * Next.js Middleware
 *
 * Protects routes when AUTH_DISABLED=false.
 * When AUTH_DISABLED=true (default for self-hosted), all routes are public.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Paths that are always public (even when auth is enabled) */
const PUBLIC_PATHS = ['/login', '/api/auth'];

export function middleware(request: NextRequest) {
  // Auth is DISABLED by default (safe for local dev without .env).
  // Only enabled when AUTH_DISABLED is explicitly set to 'false'.
  if (process.env.AUTH_DISABLED !== 'false') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/robots.txt') {
    return NextResponse.next();
  }

  // Check for NextAuth session token (cookie name varies by env)
  const hasSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg).*)'],
};
