import type { StructuredDiffChange, StructuredDiffKind } from '@/domain/diff/structuredStateDiff';

export interface ChangePreviewField {
  after: string;
  before: string;
  id: string;
  key: string;
  kind: StructuredDiffKind;
}

export interface InlineDiffPart {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

const INLINE_DIFF_LIMIT = 250_000;

/** Character diff for a changed field. Long values stay plain so the preview stays cheap. */
export function inlineTextDiff(before: string, after: string): InlineDiffPart[] | null {
  if (before.length * after.length > INLINE_DIFF_LIMIT) return null;
  if (before === after) return [{ kind: 'same', text: before }];
  const scores = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0)
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      scores[i][j] =
        before[i] === after[j]
          ? scores[i + 1][j + 1] + 1
          : Math.max(scores[i + 1][j], scores[i][j + 1]);
    }
  }
  const parts: InlineDiffPart[] = [];
  const push = (kind: InlineDiffPart['kind'], text: string) => {
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      push('same', before[i]);
      i += 1;
      j += 1;
    } else if (scores[i + 1][j] >= scores[i][j + 1]) {
      push('removed', before[i]);
      i += 1;
    } else {
      push('added', after[j]);
      j += 1;
    }
  }
  if (i < before.length) push('removed', before.slice(i));
  if (j < after.length) push('added', after.slice(j));
  return parts;
}

export interface ChangePreviewNode {
  fields: ChangePreviewField[];
  kind: StructuredDiffKind | 'changed';
  path: string;
}

/** Group a flat field diff by its parent node so the preview can show one card per node. */
export function groupChangePreview(changes: readonly StructuredDiffChange[]): ChangePreviewNode[] {
  const groups = new Map<string, ChangePreviewField[]>();
  for (const change of changes) {
    const parts = change.path.split('/').filter(Boolean);
    const fieldKey = parts.length > 1 ? (parts.at(-1) ?? change.path) : change.path;
    const nodePath = parts.length > 1 ? parts.slice(0, -1).join('/') : change.path;
    const fields = groups.get(nodePath) ?? [];
    fields.push({
      after: change.afterValue,
      before: change.beforeValue,
      id: change.id,
      key: fieldKey === '-' ? 'list item' : fieldKey,
      kind: change.kind,
    });
    groups.set(nodePath, fields);
  }
  return [...groups.entries()].map(([path, fields]) => {
    const kinds = new Set(fields.map((field) => field.kind));
    const only = kinds.size === 1 ? [...kinds][0] : undefined;
    return { fields, kind: only ?? 'changed', path };
  });
}
