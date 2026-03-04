/**
 * SSRF Protection Utility
 *
 * Shared isInternalUrl function to block requests to internal/private IP ranges.
 * Used by webhook dispatcher, webhook routes, and recipe executor.
 */

/**
 * Block requests to internal/private IP ranges to prevent SSRF attacks.
 * Returns true if the URL resolves to an internal address that should be blocked.
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
