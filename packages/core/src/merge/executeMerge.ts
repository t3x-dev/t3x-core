/**
 * Execute Merge
 *
 * Executes a merge after user has made all decisions.
 * Returns SemanticContent (frames + relations) ready for commit creation.
 *
 * 执行合并 - 在用户完成所有决策后返回合并后的 SemanticContent
 *
 * V4 Changes:
 * - Returns SemanticContent instead of SentenceCommit
 * - Commit wrapping (hash, parents, author) is handled by the storage layer
 * - No constraint handling (constraints belong to Leaf)
 */

import { sha256 } from '../common/hash';
import type { DiffableSentence } from '../diff/types';
import type { Frame, SemanticContent } from '../semantic/types';
import type { Merge2WayResult } from './types';

/**
 * Execute a merge after user has made all decisions.
 * 在用户完成所有决策后执行合并
 *
 * Returns SemanticContent with merged frames. Each DiffableSentence becomes
 * a frame of type 'knowledge' with a 'text' slot. The caller is responsible
 * for wrapping this in a commit (hash, parents, author, etc.) via the storage layer.
 *
 * @throws Error if any similarPair has no resolution
 *
 * @example
 * // After user resolves all pairs and toggles keep/discard:
 * prepared.similarPairs[0].resolution = 'target';
 * prepared.onlyInSource[0].keep = false;
 *
 * executeMerge(prepared, 'sha256:source123', 'sha256:target456')
 * → SemanticContent { frames: [...], relations: [] }
 */
export function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string
): SemanticContent {
  // Collect sentences with their sort position for order preservation
  // 收集句子及其排序位置，用于保持原始文档顺序
  const collected: Array<{
    sentence: DiffableSentence;
    sortPosition: number;
    insertionOrder: number;
  }> = [];
  let insertionCounter = 0;

  // Helper to get the position from a DiffableSentence (falls back to Infinity)
  const getPosition = (s: DiffableSentence): number => s.position ?? Number.POSITIVE_INFINITY;

  // 1. Collect identical sentences (use source position)
  for (const s of prepared.identical) {
    collected.push({
      sentence: s,
      sortPosition: getPosition(s),
      insertionOrder: insertionCounter++,
    });
  }

  // 2. Collect resolved similar pairs
  for (const pair of prepared.similarPairs) {
    if (!pair.resolution) {
      throw new Error(`Unresolved similar pair: "${pair.source.text}" vs "${pair.target.text}"`);
    }

    if (pair.resolution === 'source') {
      collected.push({
        sentence: pair.source,
        sortPosition: getPosition(pair.source),
        insertionOrder: insertionCounter++,
      });
    } else {
      // Use target position for target resolution
      collected.push({
        sentence: pair.target,
        sortPosition: getPosition(pair.target),
        insertionOrder: insertionCounter++,
      });
    }
  }

  // 3. Collect kept sentences from source-only
  for (const candidate of prepared.onlyInSource) {
    if (candidate.keep) {
      collected.push({
        sentence: candidate.sentence,
        sortPosition: getPosition(candidate.sentence),
        insertionOrder: insertionCounter++,
      });
    }
  }

  // 4. Collect kept sentences from target-only (position + 0.5 offset for interleaving)
  for (const candidate of prepared.onlyInTarget) {
    if (candidate.keep) {
      collected.push({
        sentence: candidate.sentence,
        sortPosition: getPosition(candidate.sentence) + 0.5,
        insertionOrder: insertionCounter++,
      });
    }
  }

  // Sort by position, with stable tie-breaking by insertion order
  collected.sort((a, b) => {
    if (a.sortPosition !== b.sortPosition) {
      return a.sortPosition - b.sortPosition;
    }
    return a.insertionOrder - b.insertionOrder;
  });

  // Convert each DiffableSentence to a Frame (type 'knowledge', text slot)
  // Frame IDs are deterministic: f_ + sha256(sourceHash:targetHash:originalId).slice(0,12)
  const frames: Frame[] = collected.map(({ sentence: s }) => {
    const hashInput = `${sourceCommitHash}:${targetCommitHash}:${s.id}`;
    const newId = `f_${sha256(hashInput).slice(0, 12)}`;
    const frame: Frame = {
      id: newId,
      type: 'knowledge',
      slots: { text: s.text },
    };
    if (s.source_ref) {
      frame.source = s.source_ref.turn_hash;
    }
    return frame;
  });

  return { frames, relations: [] };
}
