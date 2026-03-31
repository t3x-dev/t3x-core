/**
 * YOps Replay — Replay and verify YOps against commit snapshots.
 *
 * Pure functions, no DB, no side effects.
 */

import { canonicalize } from 'json-canonicalize';
import type { SemanticContent, TreeNode } from '../semantic/types';
import { applyYOps } from './engine';
import { YOpSchema } from './schema';
import type { YOp, YOpsError } from './types';

// ── Types ──

export interface ReplayInput {
  baseContent: SemanticContent;
  ops: YOp[];
}

export interface ReplayResult {
  ok: boolean;
  content: SemanticContent;
  opsApplied: number;
  error?: YOpsError;
}

export interface VerifyResult {
  match: boolean;
  replayedContent: SemanticContent;
  expectedContent: SemanticContent;
  opsApplied: number;
  mismatch?: {
    replayed_tree_count: number;
    expected_tree_count: number;
    replayed_tree_keys: string[];
    expected_tree_keys: string[];
  };
}

// ── replayYOps ──

export function replayYOps(input: ReplayInput): ReplayResult {
  const result = applyYOps(input.baseContent, input.ops);
  return {
    ok: result.ok,
    content: { trees: result.trees, relations: result.relations },
    opsApplied: result.applied,
    error: result.error,
  };
}

// ── stripTree — strips metadata (source, slot_quotes, confidence), keeps key/slots/children ──

function stripTree(node: TreeNode): {
  key: string;
  slots: Record<string, unknown>;
  children: ReturnType<typeof stripTree>[];
} {
  return {
    key: node.key,
    slots: node.slots as Record<string, unknown>,
    children: node.children.map(stripTree),
  };
}

function stripContent(content: SemanticContent): unknown {
  return {
    trees: content.trees.map(stripTree),
    relations: content.relations.map((r) => ({
      from: r.from,
      to: r.to,
      type: r.type,
    })),
  };
}

// ── verifyReplay ──

export function verifyReplay(
  baseContent: SemanticContent,
  ops: YOp[],
  expectedContent: SemanticContent
): VerifyResult {
  const replay = replayYOps({ baseContent, ops });

  if (!replay.ok) {
    return {
      match: false,
      replayedContent: replay.content,
      expectedContent,
      opsApplied: replay.opsApplied,
      mismatch: {
        replayed_tree_count: replay.content.trees.length,
        expected_tree_count: expectedContent.trees.length,
        replayed_tree_keys: replay.content.trees.map((t) => t.key),
        expected_tree_keys: expectedContent.trees.map((t) => t.key),
      },
    };
  }

  const replayedCanonical = canonicalize(stripContent(replay.content));
  const expectedCanonical = canonicalize(stripContent(expectedContent));

  const match = replayedCanonical === expectedCanonical;

  return {
    match,
    replayedContent: replay.content,
    expectedContent,
    opsApplied: replay.opsApplied,
    ...(!match
      ? {
          mismatch: {
            replayed_tree_count: replay.content.trees.length,
            expected_tree_count: expectedContent.trees.length,
            replayed_tree_keys: replay.content.trees.map((t) => t.key),
            expected_tree_keys: expectedContent.trees.map((t) => t.key),
          },
        }
      : {}),
  };
}

// ── extractOpsFromEntries ──

/**
 * Extract and validate YOp[] from raw yops_log entries.
 * The `yops` field is stored as `unknown` (jsonb) in the DB.
 * Validates each op against YOpSchema. Throws on invalid ops.
 */
export function extractOpsFromEntries(entries: Array<{ id: string; yops: unknown }>): YOp[] {
  const allOps: YOp[] = [];

  for (const entry of entries) {
    if (!Array.isArray(entry.yops)) {
      throw new Error(
        `Invalid yops field in entry ${entry.id}: expected array, got ${typeof entry.yops}`
      );
    }

    for (const rawOp of entry.yops) {
      const parsed = YOpSchema.safeParse(rawOp);
      if (!parsed.success) {
        throw new Error(
          `Invalid YOp in entry ${entry.id}: ${parsed.error.issues.map((i) => i.message).join(', ')}`
        );
      }
      allOps.push(parsed.data as YOp);
    }
  }

  return allOps;
}
