/**
 * Hash utilities
 */

import crypto from 'node:crypto';
import { canonicalize } from 'json-canonicalize';

import type { CommitV3 } from '../types';
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
 * Compute the hash for a CommitV3.
 *
 * Only first-class fields are included in the hash:
 * - schema, parents, author, committed_at, content
 *
 * Second-class fields are excluded:
 * - project_id, message, branch, position
 *
 * @param commit - The commit object (without hash field)
 * @returns The computed hash with "sha256:" prefix
 */
export function computeCommitV3Hash(commit: Omit<CommitV3, 'hash'>): string {
  // Normalize constraints to [] to avoid undefined vs [] hash differences
  const normalizedContent = {
    sentences: commit.content.sentences,
    constraints: commit.content.constraints ?? [],
  };

  // Only hash first-class fields
  const hashable = {
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: normalizedContent,
  };

  const hash = sha256(hashable);
  return `sha256:${hash}`;
}
