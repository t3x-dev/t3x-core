import type { SlotDiff } from '@t3x-dev/core';
import { lcsIndices } from './diffUtils';

export type ReviewSegment = { type: 'unchanged' | 'added' | 'removed'; text: string };
/** Exact text segments are local presentation data, not the API's word tokens. */
export type ReviewSlotDiff = SlotDiff & { highlight?: ReviewSegment[] };

const MAX_CHARS = 20_000;
const MAX_CELLS = 250_000;

function append(result: ReviewSegment[], type: ReviewSegment['type'], text: string) {
  if (!text) return;
  const last = result.at(-1);
  if (last?.type === type) last.text += text;
  else result.push({ type, text });
}

/** Trim common edges before LCS. All refinement passes share one cell budget. */
function diffTokens(a: string[], b: string[], budget: { cells: number }): ReviewSegment[] {
  let start = 0;
  let endA = a.length;
  let endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const result: ReviewSegment[] = [];
  append(result, 'unchanged', a.slice(0, start).join(''));
  const left = a.slice(start, endA);
  const right = b.slice(start, endB);
  const cells = (left.length + 1) * (right.length + 1);
  if (!left.length || !right.length || cells > budget.cells) {
    append(result, 'removed', left.join(''));
    append(result, 'added', right.join(''));
  } else {
    budget.cells -= cells;
    const { aIndices, bIndices } = lcsIndices(left, right, (x, y) => x === y);
    let ai = 0;
    let bi = 0;
    for (let i = 0; i < aIndices.length; i++) {
      append(result, 'removed', left.slice(ai, aIndices[i]).join(''));
      append(result, 'added', right.slice(bi, bIndices[i]).join(''));
      append(result, 'unchanged', left[aIndices[i]]);
      ai = aIndices[i] + 1;
      bi = bIndices[i] + 1;
    }
    append(result, 'removed', left.slice(ai).join(''));
    append(result, 'added', right.slice(bi).join(''));
  }
  append(result, 'unchanged', a.slice(endA).join(''));
  return result;
}

const lines = (text: string) => text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
const words = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

/** Each side reconstructs its input exactly, including case, tabs and line endings. */
export function reviewHighlight(from: string, to: string): ReviewSegment[] | undefined {
  if (from === to || from.length > MAX_CHARS || to.length > MAX_CHARS) return undefined;
  const budget = { cells: MAX_CELLS };
  const lineDiff = diffTokens(lines(from), lines(to), budget);
  const result: ReviewSegment[] = [];
  for (let i = 0; i < lineDiff.length; i++) {
    const segment = lineDiff[i];
    const next = lineDiff[i + 1];
    if (segment.type === 'removed' && next?.type === 'added') {
      for (const word of diffTokens(words(segment.text), words(next.text), budget)) {
        append(result, word.type, word.text);
      }
      i++;
    } else append(result, segment.type, segment.text);
  }
  return result;
}

/** Validate precomputed segments; legacy whitespace-normalizing tokens are recomputed. */
export function withReviewHighlight(slot: SlotDiff): ReviewSlotDiff {
  if (
    slot.type !== 'changed' ||
    typeof slot.oldValue !== 'string' ||
    typeof slot.newValue !== 'string'
  ) {
    return slot;
  }
  const { oldValue, newValue, wordDiff } = slot;
  if (oldValue === newValue || oldValue.length > MAX_CHARS || newValue.length > MAX_CHARS)
    return slot;
  if (
    wordDiff?.length &&
    wordDiff
      .filter((s) => s.type !== 'added')
      .map((s) => s.text)
      .join('') === oldValue &&
    wordDiff
      .filter((s) => s.type !== 'removed')
      .map((s) => s.text)
      .join('') === newValue
  )
    return { ...slot, highlight: wordDiff };
  return { ...slot, highlight: reviewHighlight(oldValue, newValue) };
}
