/**
 * Shared utilities for draft operations
 */

/** Generate a random ID with the given prefix (e.g. 'ds_') */
export function nextDraftId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${hex}`;
}
