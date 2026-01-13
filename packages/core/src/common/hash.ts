/**
 * Hash utilities
 */

import crypto from 'node:crypto';
import { canonicalize } from 'json-canonicalize';

import type { CommitAuthor, CommitContent } from '../types/commit';
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

/**
 * Input data for computing CommitV3 hash
 * 用于计算 CommitV3 哈希的输入数据
 */
export interface CommitV3HashInput {
  schema: 'commit/v3';
  parents: string[];
  author: CommitAuthor;
  committed_at: string;
  content: CommitContent;
}

/**
 * Compute hash for a CommitV3
 *
 * Hash is SHA-256 of JCS-canonicalized JSON (excluding the hash field itself).
 * This ensures deterministic hash computation regardless of field order.
 * 计算 CommitV3 的哈希值 - 使用 JCS 规范化的 JSON 的 SHA-256
 *
 * @param data - Commit data (without hash field)
 * @returns SHA-256 hash prefixed with 'sha256:'
 */
export function computeCommitV3Hash(data: CommitV3HashInput): string {
  const hash = sha256(data);
  return `sha256:${hash}`;
}
