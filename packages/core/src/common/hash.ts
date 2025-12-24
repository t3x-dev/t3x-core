/**
 * Hash utilities
 */

import { canonicalize } from 'json-canonicalize';
import crypto from 'node:crypto';

import { canonText } from './canon';

export function hashText(input: string): string {
  return sha256(canonText(input));
}

export function sha256(payload: unknown): string {
  const serialized = isBuffer(payload)
    ? payload
    : typeof payload === 'string'
      ? payload
      : canonicalize(payload);

  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function isBuffer(value: unknown): value is Buffer {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}
