/**
 * Shared text formatters used across pages.
 *
 * Centralises shortHash, relativeTime, and formatDate so every page
 * renders them identically.
 */

/** Truncate a sha256-prefixed hash to 7 visible hex chars (Git convention). */
export function shortHash(hash: string): string {
  return hash.replace('sha256:', '').slice(0, 7);
}

/** Display label for a commit hash when only the short hash value is needed. */
export function commitHashLabel(hash: string): string {
  return shortHash(hash);
}

/** Human-friendly relative time string from an ISO-8601 timestamp. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Full locale date-time string (used in tooltips). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
