export function hasDbErrorCode(err: unknown, code: string): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
