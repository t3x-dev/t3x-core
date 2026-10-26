'use client';

import { useDraggable } from '@dnd-kit/core';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { useState } from 'react';
import { type SchemaFieldRow, schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import { useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import styles from './SchemaVisualEditor.module.css';

export type SchemaSourceItem = { candidateId: string; row: SchemaFieldRow; preview: StudioPreview };
function SourceItem({
  item,
  disabled,
  selected,
  onSelect,
}: {
  item: SchemaSourceItem;
  disabled: boolean;
  selected: boolean;
  onSelect: (item: SchemaSourceItem) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `import:${item.candidateId}:${item.row.path}`,
    data: { kind: 'import', item, label: item.row.semanticPath },
    disabled,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      className={styles.sourceItem}
      aria-label={`Select source ${item.row.kind === 'node' ? 'node' : 'object'} ${item.row.semanticPath}`}
      aria-pressed={selected}
      onClick={() => onSelect(item)}
      style={{ touchAction: 'none', opacity: isDragging ? 0.45 : undefined }}
    >
      <span>{item.row.semanticPath}</span>
      <small>{item.row.kind === 'node' ? 'Node · subtree' : 'Object'}</small>
    </button>
  );
}
export function SchemaVisualSource({
  projectId,
  candidate,
  disabled,
  selected,
  onSelect,
}: {
  projectId: string;
  candidate: StudioCandidate;
  disabled: boolean;
  selected?: SchemaSourceItem;
  onSelect: (item: SchemaSourceItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const preview = useStudioPreview(projectId, { candidateIds: open ? [candidate.id] : [] });
  return (
    <details className={styles.sourceGroup} open={open}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        {candidate.title ?? candidate.source?.canonicalName}
        <small>{candidate.source?.version}</small>
      </summary>
      {open ? (
        preview.error ? (
          <div role="alert">
            {preview.error}
            <button type="button" onClick={preview.refresh}>
              Retry source
            </button>
          </div>
        ) : !preview.data ? (
          <output>Loading source…</output>
        ) : !preview.data.adoption.allowed ? (
          <p>{preview.data.adoption.reason ?? 'This source cannot be imported.'}</p>
        ) : !preview.data.report.valid ? (
          <p>Resolve this source's definition checks before importing.</p>
        ) : (
          schemaFieldRows(preview.data.schema)
            .filter((row) => row.kind === 'node' || row.definition.type === 'object')
            .map((row) => (
              <SourceItem
                key={row.path}
                item={{ candidateId: candidate.id, row, preview: preview.data! }}
                disabled={disabled || !preview.data!.adoption.allowed}
                selected={selected?.candidateId === candidate.id && selected.row.path === row.path}
                onSelect={onSelect}
              />
            ))
        )
      ) : null}
    </details>
  );
}
