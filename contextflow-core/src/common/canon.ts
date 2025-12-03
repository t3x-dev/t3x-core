/**
 * Text canonicalization utilities
 */

export function canonText(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}
