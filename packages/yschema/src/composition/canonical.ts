import { canonicalJson, type YValue } from '@t3x-dev/yops';

function toYValue(value: unknown): YValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toYValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toYValue(item)])
    );
  }
  throw new TypeError(`Composition canonicalization does not support ${typeof value}`);
}

export function canonicalizeCompositionValue(value: unknown): string {
  return canonicalJson(toYValue(value));
}

export async function sha256CompositionValue(value: unknown): Promise<string> {
  const canonical = canonicalizeCompositionValue(value);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
  return `sha256:${hex}`;
}
