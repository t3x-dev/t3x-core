'use client';

import { useState } from 'react';
import type { StructuredDiffChange } from '@/domain/diff/structuredStateDiff';
import {
  type ChangePreviewField,
  groupChangePreview,
  type InlineDiffPart,
  inlineTextDiff,
} from '@/domain/project/pullRequestChangePreview';
import styles from './ProjectReviewsCreate.module.css';

const COLLAPSE_AFTER = 180;

export function PullRequestChangePreview({
  baseBranch,
  changes,
  sourceBranch,
}: {
  baseBranch: string;
  changes: readonly StructuredDiffChange[];
  sourceBranch: string;
}) {
  const nodes = groupChangePreview(changes);
  if (nodes.length === 0) {
    return <p className={styles.previewEmpty}>No field changes between these revisions.</p>;
  }
  const counts = { added: 0, modified: 0, removed: 0 };
  for (const node of nodes) {
    for (const field of node.fields) counts[field.kind] += 1;
  }

  return (
    <div className={styles.diffPreview}>
      <div className={styles.diffSummary}>
        <span>
          {nodes.length} node{nodes.length === 1 ? '' : 's'}
        </span>
        {counts.modified > 0 ? <span data-kind="modified">{counts.modified} updated</span> : null}
        {counts.added > 0 ? <span data-kind="added">{counts.added} added</span> : null}
        {counts.removed > 0 ? <span data-kind="removed">{counts.removed} removed</span> : null}
      </div>
      {nodes.map((node) => (
        <article className={styles.diffNode} key={node.path}>
          <header>
            <code title={node.path.replaceAll('/', '.')}>{node.path.replaceAll('/', '.')}</code>
            <span data-kind={node.kind}>{nodeKindLabel(node.kind)}</span>
          </header>
          {node.fields.map((field) => (
            <div className={styles.diffField} key={field.id}>
              <b>{field.key}</b>
              <FieldValues baseBranch={baseBranch} field={field} sourceBranch={sourceBranch} />
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function nodeKindLabel(kind: ChangePreviewField['kind'] | 'changed') {
  if (kind === 'added') return 'Added';
  if (kind === 'removed') return 'Removed';
  return 'Updated';
}

function FieldValues({
  baseBranch,
  field,
  sourceBranch,
}: {
  baseBranch: string;
  field: ChangePreviewField;
  sourceBranch: string;
}) {
  if (field.kind === 'modified') {
    const parts = inlineTextDiff(field.before, field.after);
    return (
      <div className={styles.diffPair}>
        <PreviewValue label={baseBranch} parts={parts} side="base" text={field.before} />
        <PreviewValue label={sourceBranch} parts={parts} side="source" text={field.after} />
      </div>
    );
  }
  const removed = field.kind === 'removed';
  return (
    <PreviewValue
      label={removed ? `Removed from ${baseBranch}` : `Added in ${sourceBranch}`}
      side={removed ? 'base' : 'source'}
      text={removed ? field.before : field.after}
    />
  );
}

function DiffText({ parts }: { parts: InlineDiffPart[] }) {
  let offset = 0;
  return parts.map((part) => {
    const key = `${part.kind}:${offset}`;
    offset += part.text.length;
    return part.kind === 'same' ? (
      <span key={key}>{part.text}</span>
    ) : (
      <mark data-kind={part.kind} key={key}>
        {part.text}
      </mark>
    );
  });
}

function PreviewValue({
  label,
  parts,
  side,
  text,
}: {
  label: string;
  parts?: InlineDiffPart[] | null;
  side: 'base' | 'source';
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > COLLAPSE_AFTER;
  const visible = parts?.filter((part) =>
    side === 'base' ? part.kind !== 'added' : part.kind !== 'removed'
  );
  return (
    <div className={styles.diffValue} data-open={open || undefined} data-side={side}>
      <span>{label}</span>
      <p data-clamped={long && !open ? true : undefined}>
        {visible ? <DiffText parts={visible} /> : text}
      </p>
      {long ? (
        <button onClick={() => setOpen((current) => !current)} type="button">
          {open ? 'Show less' : 'Show full value'}
        </button>
      ) : null}
    </div>
  );
}
