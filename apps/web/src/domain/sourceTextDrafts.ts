import type { HumanSource, Source, SourcedYOp } from '@t3x-dev/core';

export type SourceTextAction = 'add' | 'edit' | 'delete';
export type SourceTextTurnRole = 'user' | 'assistant' | 'system' | 'tool';

export interface SourceTextDraftSpan {
  id: string;
  action: SourceTextAction;
  start: number;
  end: number;
  text: string;
  originalText: string;
}

export interface SourceTextDraft {
  revisionId?: string;
  status?: 'saved' | 'patched' | 'no_patch' | 'patch_failed' | 'synced' | 'discarded';
  baseContentHash?: string;
  turnHash: string;
  turnRole: SourceTextTurnRole;
  baseContent: string;
  content: string;
  spans: SourceTextDraftSpan[];
  updatedAt: string;
}

export interface SourceTextDraftInput {
  turnHash: string;
  turnRole?: SourceTextTurnRole;
  action: SourceTextAction;
  start: number;
  end: number;
  selectedText: string;
  replacementText?: string;
}

export interface SourceTextTurn {
  turn_hash: string;
  role: SourceTextTurnRole;
  content: string;
}

export type SourceTextDraftsByTurn = Record<string, SourceTextDraft>;

function clampOffset(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(value)));
}

function adjustedSpans(
  spans: SourceTextDraftSpan[],
  mutationStart: number,
  mutationEnd: number,
  insertedLength: number
): SourceTextDraftSpan[] {
  const removedLength = mutationEnd - mutationStart;
  const delta = insertedLength - removedLength;

  return spans
    .map((span) => {
      if (span.end <= mutationStart) return span;
      if (span.start >= mutationEnd) {
        return { ...span, start: span.start + delta, end: span.end + delta };
      }
      return null;
    })
    .filter((span): span is SourceTextDraftSpan => span !== null);
}

export function applySourceTextDraftEdit(args: {
  baseContent: string;
  existingDraft?: SourceTextDraft | null;
  input: SourceTextDraftInput;
  now?: string;
}): SourceTextDraft {
  const currentContent = args.existingDraft?.content ?? args.baseContent;
  const start = clampOffset(args.input.start, currentContent.length);
  const end = clampOffset(Math.max(args.input.end, start), currentContent.length);
  const selectedText = currentContent.slice(start, end) || args.input.selectedText;
  const replacement = args.input.action === 'delete' ? '' : (args.input.replacementText ?? '');

  const mutationStart = args.input.action === 'add' ? end : start;
  const mutationEnd = end;
  const nextContent =
    currentContent.slice(0, mutationStart) + replacement + currentContent.slice(mutationEnd);
  const spanStart = mutationStart;
  const spanEnd = mutationStart + replacement.length;
  const updatedAt = args.now ?? new Date().toISOString();

  const nextSpan: SourceTextDraftSpan = {
    id: `${updatedAt}:${spanStart}:${spanEnd}:${args.input.action}`,
    action: args.input.action,
    start: spanStart,
    end: spanEnd,
    text: replacement,
    originalText: selectedText,
  };

  return {
    revisionId: args.existingDraft?.revisionId,
    status: args.existingDraft?.status,
    baseContentHash: args.existingDraft?.baseContentHash,
    turnHash: args.input.turnHash,
    turnRole: args.existingDraft?.turnRole ?? args.input.turnRole ?? 'assistant',
    baseContent: args.existingDraft?.baseContent ?? args.baseContent,
    content: nextContent,
    spans: [
      ...adjustedSpans(
        args.existingDraft?.spans ?? [],
        mutationStart,
        mutationEnd,
        replacement.length
      ),
      nextSpan,
    ].sort((a, b) => a.start - b.start || a.end - b.end),
    updatedAt,
  };
}

export function getSourceTextPatchText(draft: SourceTextDraft): string {
  return draft.spans
    .map((span) => span.text)
    .join('\n')
    .trim();
}

export function applySourceTextDraftsToTurns(
  turns: readonly SourceTextTurn[],
  draftsByTurn: SourceTextDraftsByTurn
): SourceTextTurn[] {
  const seenTurnHashes = new Set<string>();
  const effectiveTurns = turns.map((turn) => {
    seenTurnHashes.add(turn.turn_hash);
    const draft = draftsByTurn[turn.turn_hash];
    return draft ? { ...turn, content: draft.content } : turn;
  });

  for (const draft of Object.values(draftsByTurn)) {
    if (seenTurnHashes.has(draft.turnHash)) continue;
    effectiveTurns.push({
      turn_hash: draft.turnHash,
      role: draft.turnRole,
      content: draft.content,
    });
  }

  return effectiveTurns;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  if (aStart === aEnd || bStart === bEnd) return aStart <= bEnd && bStart <= aEnd;
  return aStart < bEnd && bStart < aEnd;
}

export function sourceOverlapsSourceTextDraft(
  source: Source | undefined,
  draftsByTurn: SourceTextDraftsByTurn
): boolean {
  if (!source || source.type !== 'llm') return false;
  const draft = draftsByTurn[source.turn_ref.turn_hash];
  if (!draft) return false;
  if (draft.spans.length === 0) return true;

  const refStart = source.turn_ref.start_char;
  const refEnd = source.turn_ref.end_char;
  if (refStart == null || refEnd == null) return true;

  return draft.spans.some((span) => {
    if (span.action === 'delete') return refStart <= span.start && span.start <= refEnd;
    return rangesOverlap(refStart, refEnd, span.start, span.end);
  });
}

export function markOpsFromSourceTextDrafts(
  ops: readonly SourcedYOp[],
  draftsByTurn: SourceTextDraftsByTurn,
  humanSource: HumanSource
): SourcedYOp[] {
  return ops.map((op) =>
    sourceOverlapsSourceTextDraft(op.source, draftsByTurn)
      ? ({ ...(op as Record<string, unknown>), source: humanSource } as SourcedYOp)
      : op
  );
}
