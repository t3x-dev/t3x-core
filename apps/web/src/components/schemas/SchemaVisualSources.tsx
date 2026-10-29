'use client';

import { useDraggable } from '@dnd-kit/core';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { Box, Braces, ClipboardList, Layers2, Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  type SchemaDefinition,
  type SchemaFieldRow,
  schemaFieldRows,
} from '@/domain/schemas/schemaFieldEditing';
import {
  isSourceBase,
  relatesToSource,
  type SchemaSourceRelation,
  sourceContainsRelation,
} from '@/domain/schemas/schemaSourceRelations';
import { useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import styles from './SchemaVisualEditor.module.css';

export type SchemaSourceItem = { candidateId: string; row: SchemaFieldRow; preview: StudioPreview };
function SourceItem({
  item,
  disabled,
  selected,
  onSelect,
  studio = false,
  related = false,
}: {
  item: SchemaSourceItem;
  disabled: boolean;
  selected: boolean;
  onSelect: (item: SchemaSourceItem) => void;
  studio?: boolean;
  related?: boolean;
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
      data-related={related || undefined}
      title={related ? 'Source of the selected field' : undefined}
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
      {related ? <span className="sr-only">Source of the selected field</span> : null}
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
  relations = [],
  sourceBase,
}: {
  projectId: string;
  candidate: StudioCandidate;
  disabled: boolean;
  selected?: SchemaSourceItem;
  onSelect: (item: SchemaSourceItem) => void;
  defaultOpen?: boolean;
  studio?: boolean;
  relations?: SchemaSourceRelation[];
  sourceBase?: SchemaDefinition;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const preview = useStudioPreview(projectId, { candidateIds: open ? [candidate.id] : [] });
  const related = relations.filter((relation) => relatesToSource(relation, candidate));
  const items = preview.data
    ? schemaFieldRows(preview.data.schema).filter(
        (row) => row.kind === 'node' || row.definition.type === 'object'
      )
    : [];
  const baseMatchesSource = !!preview.data && isSourceBase(sourceBase, preview.data);
  const relatedItems = new Set(
    related.flatMap((relation) => {
      const matches = items.filter(
        (row) =>
          preview.data &&
          sourceContainsRelation(relation, candidate, row, preview.data, baseMatchesSource)
      );
      // A scalar field points to its nearest source object, not every enclosing node.
      const nearest = matches.sort((a, b) => b.location.length - a.location.length)[0];
      return nearest ? [nearest.path] : [];
    })
  );
  return (
    <details
      className={styles.sourceGroup}
      open={open}
      data-studio={studio || undefined}
      data-related={related.length > 0 || undefined}
    >
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
        {studio ? (
          <span
            className={styles.relatedLabel}
            data-visible={related.length > 0 || undefined}
            title={related.length ? 'Related source' : undefined}
          >
            <Link2 size={13} aria-hidden="true" />
            {related.length ? <span className="sr-only">Related source</span> : null}
          </span>
        ) : null}
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
          items.map((row) => (
            <SourceItem
              studio={studio}
              related={relatedItems.has(row.path)}
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
