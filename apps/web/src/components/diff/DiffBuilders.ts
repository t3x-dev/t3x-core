import type { CommitV4Sentence } from '@/lib/api';
import type { WordDiffSegment } from '@/types/merge';

// ============================================================================
// Types
// ============================================================================

/** Unified line for Git-like display */
export interface UnifiedLine {
  type: 'context' | 'modified' | 'removed' | 'added' | 'collapsed' | 'group-header';
  baseIndex?: number;
  targetIndex?: number;
  baseSentence?: CommitV4Sentence;
  targetSentence?: CommitV4Sentence;
  wordDiff?: WordDiffSegment[];
  collapsedCount?: number;
  /** The actual lines hidden by this collapsed section (for expand) */
  collapsedLines?: UnifiedLine[];
  /** Collapse range for hunk header display */
  collapseBaseStart?: number;
  collapseBaseEnd?: number;
  collapseTargetStart?: number;
  collapseTargetEnd?: number;
  /** Source group header data */
  groupHeader?: {
    conversationId: string;
    title: string | null;
    sentenceCount: number;
    avgConfidence: number;
    isNewSource: boolean;
    type: 'conversation' | 'leaf';
  };
}

/** Per-segment inline context state (for multiple simultaneous panels) */
export interface InlineContextState {
  data: import('@/lib/api').TurnContextData | null;
  loading: boolean;
  turnHash?: string;
  highlightStart?: number;
  highlightEnd?: number;
  wordDiff?: WordDiffSegment[];
}

export interface SegmentDiffItem {
  segmentId: string;
  text: string;
  diffType: 'same' | 'added' | 'removed' | 'modified';
  matchedSegmentId?: string;
  matchedText?: string;
  similarity?: number;
  wordDiff?: WordDiffSegment[];
}

// ============================================================================
// Helpers
// ============================================================================

const CONTEXT_LINES = 3;

/**
 * Build unified lines in position order with context folding.
 * Added sentences are inserted at their correct target position,
 * not appended at the end (3.4 fix).
 */
export function buildUnifiedLines(
  baseSentences: CommitV4Sentence[],
  targetSentences: CommitV4Sentence[],
  segmentDiffs: SegmentDiffItem[]
): UnifiedLine[] {
  const diffByBaseId = new Map<string, SegmentDiffItem>();
  const addedItems: SegmentDiffItem[] = [];

  for (const diff of segmentDiffs) {
    if (diff.diffType === 'added') {
      addedItems.push(diff);
    } else {
      diffByBaseId.set(diff.segmentId, diff);
    }
  }

  const targetMap = new Map(targetSentences.map((s) => [s.id, s]));

  // Build target position map: sentenceId -> index in targetSentences
  const targetPositionMap = new Map<string, number>();
  for (let i = 0; i < targetSentences.length; i++) {
    targetPositionMap.set(targetSentences[i].id, i);
  }

  const rawLines: UnifiedLine[] = [];

  for (let i = 0; i < baseSentences.length; i++) {
    const baseSentence = baseSentences[i];
    const diff = diffByBaseId.get(baseSentence.id);

    if (!diff || diff.diffType === 'same') {
      rawLines.push({
        type: 'context',
        baseIndex: i,
        targetIndex: targetPositionMap.get(baseSentence.id),
        baseSentence,
        targetSentence: baseSentence,
      });
    } else if (diff.diffType === 'modified') {
      rawLines.push({
        type: 'modified',
        baseIndex: i,
        targetIndex: diff.matchedSegmentId
          ? targetPositionMap.get(diff.matchedSegmentId)
          : undefined,
        baseSentence,
        targetSentence: diff.matchedSegmentId ? targetMap.get(diff.matchedSegmentId) : undefined,
        wordDiff: diff.wordDiff,
      });
    } else if (diff.diffType === 'removed') {
      rawLines.push({
        type: 'removed',
        baseIndex: i,
        baseSentence,
      });
    }
  }

  // --- 3.4 Fix: Insert added items at correct target position ---
  // Build added lines sorted by target position
  const sortedAddedLines: UnifiedLine[] = [];
  for (const added of addedItems) {
    const targetSentence = targetMap.get(added.segmentId);
    if (targetSentence) {
      sortedAddedLines.push({
        type: 'added',
        targetIndex: targetPositionMap.get(added.segmentId),
        targetSentence,
      });
    }
  }
  sortedAddedLines.sort((a, b) => (a.targetIndex ?? 0) - (b.targetIndex ?? 0));

  // Insert each added line at the position where the next line's targetIndex >= added targetIndex
  for (const addedLine of sortedAddedLines) {
    const addedTargetIdx = addedLine.targetIndex ?? 0;
    let insertPos = rawLines.length; // default: append at end
    for (let i = 0; i < rawLines.length; i++) {
      const lineTargetIdx = rawLines[i].targetIndex;
      if (lineTargetIdx !== undefined && lineTargetIdx >= addedTargetIdx) {
        insertPos = i;
        break;
      }
    }
    rawLines.splice(insertPos, 0, addedLine);
  }

  // Context folding
  const showLine = new Array(rawLines.length).fill(false);
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].type !== 'context') {
      showLine[i] = true;
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(rawLines.length - 1, i + CONTEXT_LINES);
        j++
      ) {
        showLine[j] = true;
      }
    }
  }

  const finalLines: UnifiedLine[] = [];
  let collapseStart = -1;

  for (let i = 0; i < rawLines.length; i++) {
    if (showLine[i]) {
      if (collapseStart >= 0) {
        const collapseEnd = i - 1;
        const count = collapseEnd - collapseStart + 1;
        finalLines.push({
          type: 'collapsed',
          collapsedCount: count,
          collapsedLines: rawLines.slice(collapseStart, collapseEnd + 1),
          collapseBaseStart: rawLines[collapseStart].baseIndex,
          collapseBaseEnd: rawLines[collapseEnd].baseIndex,
          collapseTargetStart: rawLines[collapseStart].targetIndex,
          collapseTargetEnd: rawLines[collapseEnd].targetIndex,
        });
        collapseStart = -1;
      }
      finalLines.push(rawLines[i]);
    } else {
      if (collapseStart < 0) collapseStart = i;
    }
  }

  if (collapseStart >= 0) {
    const collapseEnd = rawLines.length - 1;
    const count = collapseEnd - collapseStart + 1;
    finalLines.push({
      type: 'collapsed',
      collapsedCount: count,
      collapsedLines: rawLines.slice(collapseStart, collapseEnd + 1),
      collapseBaseStart: rawLines[collapseStart].baseIndex,
      collapseBaseEnd: rawLines[collapseEnd].baseIndex,
      collapseTargetStart: rawLines[collapseStart].targetIndex,
      collapseTargetEnd: rawLines[collapseEnd].targetIndex,
    });
  }

  return finalLines;
}

/**
 * Build document lines: target document order with change annotations.
 * Shows the resulting document as a continuous readable text.
 * No context folding -- all sentences are shown.
 */
export function buildDocumentLines(
  baseSentences: CommitV4Sentence[],
  targetSentences: CommitV4Sentence[],
  segmentDiffs: SegmentDiffItem[]
): UnifiedLine[] {
  // Map: base sentence ID -> { sentence, index }
  const baseMap = new Map(baseSentences.map((s, i) => [s.id, { sentence: s, index: i }]));

  // Map: target sentence ID -> diff info
  const targetToDiff = new Map<
    string,
    {
      diffType: 'same' | 'modified';
      baseSentence: CommitV4Sentence;
      baseIdx: number;
      wordDiff?: WordDiffSegment[];
    }
  >();
  const removedDiffs: { baseSentence: CommitV4Sentence; baseIndex: number }[] = [];

  for (const diff of segmentDiffs) {
    if (diff.diffType === 'same') {
      const baseInfo = baseMap.get(diff.segmentId);
      if (baseInfo) {
        targetToDiff.set(diff.segmentId, {
          diffType: 'same',
          baseSentence: baseInfo.sentence,
          baseIdx: baseInfo.index,
        });
      }
    } else if (diff.diffType === 'modified' && diff.matchedSegmentId) {
      const baseInfo = baseMap.get(diff.segmentId);
      if (baseInfo) {
        targetToDiff.set(diff.matchedSegmentId, {
          diffType: 'modified',
          baseSentence: baseInfo.sentence,
          baseIdx: baseInfo.index,
          wordDiff: diff.wordDiff,
        });
      }
    } else if (diff.diffType === 'removed') {
      const baseInfo = baseMap.get(diff.segmentId);
      if (baseInfo) {
        removedDiffs.push({ baseSentence: baseInfo.sentence, baseIndex: baseInfo.index });
      }
    }
    // 'added' items will be detected as target sentences without a match
  }

  const lines: UnifiedLine[] = [];

  // Build lines from target sentences (document order)
  for (let i = 0; i < targetSentences.length; i++) {
    const sentence = targetSentences[i];
    const diffInfo = targetToDiff.get(sentence.id);

    if (diffInfo?.diffType === 'same') {
      lines.push({
        type: 'context',
        targetIndex: i,
        baseIndex: diffInfo.baseIdx,
        baseSentence: diffInfo.baseSentence,
        targetSentence: sentence,
      });
    } else if (diffInfo?.diffType === 'modified') {
      lines.push({
        type: 'modified',
        targetIndex: i,
        baseIndex: diffInfo.baseIdx,
        baseSentence: diffInfo.baseSentence,
        targetSentence: sentence,
        wordDiff: diffInfo.wordDiff,
      });
    } else {
      // Added sentence (no match in base)
      lines.push({
        type: 'added',
        targetIndex: i,
        targetSentence: sentence,
      });
    }
  }

  // Append removed sentences at end
  for (const { baseSentence, baseIndex } of removedDiffs) {
    lines.push({
      type: 'removed',
      baseIndex,
      baseSentence,
    });
  }

  return lines;
}

/** Get the effective conversation ID for a line */
export function getConversationId(line: UnifiedLine): string | null {
  const sentence = line.targetSentence ?? line.baseSentence;
  return sentence?.source_ref?.conversation_id ?? null;
}

/**
 * Insert source group headers between groups of sentences from different conversations.
 */
export function insertGroupHeaders(
  lines: UnifiedLine[],
  baseSentences: CommitV4Sentence[],
  sourceRefTitles?: Map<string, string>
): UnifiedLine[] {
  // Build a set of base conversation IDs to determine "new" sources
  const baseConvIds = new Set<string>();
  for (const s of baseSentences) {
    if (s.source_ref?.conversation_id) {
      baseConvIds.add(s.source_ref.conversation_id);
    }
  }

  // First pass: identify consecutive group segments and count per-segment
  interface GroupSegment {
    convId: string;
    startIdx: number;
    count: number;
    totalConf: number;
  }
  const segments: GroupSegment[] = [];
  let currentSegment: GroupSegment | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type === 'collapsed') {
      currentSegment = null;
      continue;
    }
    const convId = getConversationId(line);
    if (!convId) {
      currentSegment = null;
      continue;
    }
    if (currentSegment && currentSegment.convId === convId) {
      currentSegment.count++;
      currentSegment.totalConf +=
        line.targetSentence?.confidence ?? line.baseSentence?.confidence ?? 0;
    } else {
      currentSegment = {
        convId,
        startIdx: i,
        count: 1,
        totalConf: line.targetSentence?.confidence ?? line.baseSentence?.confidence ?? 0,
      };
      segments.push(currentSegment);
    }
  }

  // Build lookup: line index -> segment info
  const segmentAtLine = new Map<number, GroupSegment>();
  for (const seg of segments) {
    segmentAtLine.set(seg.startIdx, seg);
  }

  // Second pass: build result with headers
  const result: UnifiedLine[] = [];
  let currentConvId: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type === 'collapsed') {
      result.push(line);
      currentConvId = null;
      continue;
    }

    const convId = getConversationId(line);

    if (convId && convId !== currentConvId) {
      const seg = segmentAtLine.get(i);
      const title = sourceRefTitles?.get(convId) ?? null;
      result.push({
        type: 'group-header',
        groupHeader: {
          conversationId: convId,
          title,
          sentenceCount: seg?.count ?? 1,
          avgConfidence: seg && seg.count > 0 ? seg.totalConf / seg.count : 0,
          isNewSource: !baseConvIds.has(convId),
          type: 'conversation',
        },
      });
      currentConvId = convId;
    } else if (!convId) {
      currentConvId = null;
    }

    result.push(line);
  }

  return result;
}

// ============================================================================
// Helpers -- hunk range formatting
// ============================================================================

/** Format a hunk range string like "3,5" (1-based start, count) */
export function formatHunkRange(
  startIdx: number | undefined,
  endIdx: number | undefined
): string | undefined {
  if (startIdx == null || endIdx == null) return undefined;
  const start = startIdx + 1; // 1-based
  const count = endIdx - startIdx + 1;
  return `${start},${count}`;
}
