/**
 * SSRF Protection Utility
 *
 * Shared isInternalUrl function to block requests to internal/private IP ranges.
 * Used by webhook dispatcher, webhook routes, and recipe executor.
 *
 * Two layers:
 * - isInternalUrl (sync): Fast hostname/IP pattern check
 * - isInternalUrlResolved (async): DNS resolution + IP check (prevents DNS rebinding)
 */

import { promises as dns } from 'node:dns';

/**
 * Check if an IP address string is internal/private.
 * Used by both the hostname check and the DNS resolution check.
 */
function isInternalIP(ip: string): boolean {
  // Localhost
  if (ip === '127.0.0.1' || ip === '::1') return true;
  // 0.0.0.0
  if (ip === '0.0.0.0') return true;
  // IPv6 unspecified
  if (ip === '::' || ip === '::0') return true;
  // Private IPv4 ranges
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // Link-local and cloud metadata
  if (ip.startsWith('169.254.')) return true;
  // IPv6 private (fd00::/8) and link-local (fe80::/10)
  if (ip.startsWith('fd') || ip.startsWith('fe80')) return true;

  return false;
}

/**
 * Block requests to internal/private IP ranges to prevent SSRF attacks.
 * Synchronous hostname-only check (fast path).
 * For full protection including DNS rebinding, use isInternalUrlResolved().
 */
export function isInternalUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^\[|\]$/g, ''); // Strip IPv6 brackets

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;

    // Block 0.0.0.0
    if (hostname === '0.0.0.0') return true;

    // Block IPv6 unspecified address (:: and ::0)
    if (hostname === '::' || hostname === '::0') return true;

    // Block ::ffff: IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1)
    // Node's URL constructor normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex notation),
    // so we must detect hex-format mapped addresses and convert back to dotted-decimal IPv4.
    if (hostname.startsWith('::ffff:')) {
      const mapped = hostname.slice(7); // strip "::ffff:"
      if (/^[0-9a-f]+:[0-9a-f]+$/i.test(mapped)) {
        const [hi, lo] = mapped.split(':').map((h) => parseInt(h, 16));
        const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isInternalUrl(`http://${dotted}/`);
      }
      return isInternalUrl(`http://${mapped}/`);
    }

    // Block private IPv4 ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true;
    if (hostname.startsWith('172.')) {
      const second = parseInt(hostname.split('.')[1], 10);
      if (second >= 16 && second <= 31) return true;
    }

    // Block link-local and cloud metadata
    if (hostname.startsWith('169.254.') || hostname === 'metadata.google.internal') return true;

    // Block IPv6 private (fd00::/8) and link-local (fe80::/10)
    if (hostname.startsWith('fd') || hostname.startsWith('fe80')) return true;

    return false;
  } catch {
    // Invalid URL — block by default
    return true;
  }
}

/**
 * Async SSRF check with DNS resolution to prevent DNS rebinding attacks.
 *
 * First runs the fast synchronous hostname check, then resolves the hostname
 * via DNS and checks the resolved IP addresses against the internal range blocklist.
 * This prevents attacks where evil.example.com resolves to 169.254.169.254.
 */
export async function isInternalUrlResolved(urlStr: string): Promise<boolean> {
  // Fast path: synchronous hostname check
  if (isInternalUrl(urlStr)) return true;

  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');

    // If hostname is already an IP literal, the sync check above handled it
    if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return false;

    // Resolve DNS and check all resolved addresses
    const [ipv4Addrs, ipv6Addrs] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);

    for (const addr of [...ipv4Addrs, ...ipv6Addrs]) {
      if (isInternalIP(addr)) return true;
    }

    return false;
  } catch {
    // DNS resolution failure or invalid URL — block by default
    return true;
  }
}
