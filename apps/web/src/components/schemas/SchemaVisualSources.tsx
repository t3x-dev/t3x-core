'use client';

import { useDraggable } from '@dnd-kit/core';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { Box, Braces, ClipboardList, Layers2, Plus } from 'lucide-react';
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
  studio = false,
}: {
  item: SchemaSourceItem;
  disabled: boolean;
  selected: boolean;
  onSelect: (item: SchemaSourceItem) => void;
  studio?: boolean;
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
      <span className={studio ? styles.sourceItemName : undefined}>
        {studio ? (
          item.row.kind === 'node' ? (
            item.row.definition.repeated ? (
              <Layers2 size={15} aria-hidden="true" />
            ) : (
              <Box size={15} aria-hidden="true" />
            )
          ) : (
            <Braces size={15} aria-hidden="true" />
          )
        ) : null}
        <span>{item.row.semanticPath}</span>
        {studio ? <Plus size={13} aria-hidden="true" /> : null}
      </span>
      <small>{item.row.kind === 'node' ? 'Node and its contents' : 'Object field'}</small>
    </button>
  );
}
export function SchemaVisualSource({
  projectId,
  candidate,
  disabled,
  selected,
  onSelect,
  defaultOpen = false,
  studio = false,
}: {
  projectId: string;
  candidate: StudioCandidate;
  disabled: boolean;
  selected?: SchemaSourceItem;
  onSelect: (item: SchemaSourceItem) => void;
  defaultOpen?: boolean;
  studio?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const preview = useStudioPreview(projectId, { candidateIds: open ? [candidate.id] : [] });
  return (
    <details className={styles.sourceGroup} open={open} data-studio={studio || undefined}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        {studio ? (
          <ClipboardList className={styles.sourceFamilyIcon} size={16} aria-hidden="true" />
        ) : null}
        <span>
          {candidate.title ?? candidate.source?.canonicalName}
          <small>{candidate.source?.version}</small>
        </span>
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
                studio={studio}
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
