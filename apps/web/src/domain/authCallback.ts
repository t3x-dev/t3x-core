const CALLBACK_BASE = 'https://t3x.invalid';

/**
 * Resolve a post-authentication destination without allowing an external or
 * scheme-relative redirect. The returned value is always local to this app.
 */
export function safeAuthCallbackUrl(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return fallback;

  try {
    const base = new URL(CALLBACK_BASE);
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base.origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * New local accounts do not own a namespace yet, so their first default
 * destination is namespace onboarding instead of the shared home route.
 * Explicit callbacks (for example an invitation) keep their original target.
 */
export function postAuthDestination(
  mode: 'login' | 'register',
  callbackUrl: string,
  personalNamespaceSlug?: string | null
): string {
  if (callbackUrl !== '/') return callbackUrl;
  if (mode === 'login' && personalNamespaceSlug) {
    return `/${encodeURIComponent(personalNamespaceSlug)}`;
  }
  return '/onboarding/namespace';
}
