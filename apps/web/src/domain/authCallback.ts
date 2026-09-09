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
