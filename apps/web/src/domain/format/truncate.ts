/**
 * Truncate text to a maximum length, appending ellipsis if truncated.
 */
export function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}
