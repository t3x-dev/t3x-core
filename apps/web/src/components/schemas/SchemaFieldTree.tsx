'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { StudioCandidate } from '@t3x-dev/api-client';
import { GripVertical } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import tree from '@/components/structure/StructureTree.module.css';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SchemaDefinition, SchemaFieldRow } from '@/domain/schemas/schemaFieldEditing';
import {
  isSourceBase,
  type SchemaSourceRelation,
  sourceContainsRelation,
} from '@/domain/schemas/schemaSourceRelations';
import styles from './SchemaDataEditor.module.css';
import { type SchemaSourceItem, SchemaVisualSource } from './SchemaVisualSources';

type TransferItem = { row: SchemaFieldRow; source?: SchemaSourceItem };

function canReceive(item: TransferItem, target: SchemaFieldRow | null) {
  if (!target) return item.row.kind === 'node';
  if (target.kind !== 'node') return false;
  if (!item.source && item.row.parentPath === target.path) return false;
  if (item.row.kind === 'slot') return true;
  return (
    !target.definition.repeated &&
    target.definition.children !== 'any' &&
    (Boolean(item.source) ||
      !item.row.location.every((key, index) => target.location[index] === key))
  );
}

export function SchemaFieldTree({
  rows,
  visible,
  selected,
  relations,
  sourceBase,
  onReveal,
  disabled,
  projectId,
  sources = [],
  sourceManagement,
  footer,
  emptyContent,
  studio = false,
  unavailable = false,
  onMove,
  onImport,
  onSelect,
  renderRow,
}: {
  rows: SchemaFieldRow[];
  visible: SchemaFieldRow[];
  selected?: string;
  relations?: Map<string, SchemaSourceRelation[]>;
  sourceBase?: SchemaDefinition;
  onReveal?: (row: SchemaFieldRow) => void;
  disabled: boolean;
  projectId?: string;
  sources?: StudioCandidate[];
  sourceManagement?: ReactNode;
  footer?: ReactNode;
  emptyContent?: ReactNode;
  studio?: boolean;
  unavailable?: boolean;
  onMove: (path: string, target: SchemaFieldRow | null) => void;
  onImport: (item: SchemaSourceItem, target: SchemaFieldRow | null) => void;
  onSelect: (row: SchemaFieldRow) => void;
  renderRow: (row: SchemaFieldRow, handle: ReactNode, select: () => void) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<TransferItem>();
  const [source, setSource] = useState<SchemaSourceItem>();
  const [destination, setDestination] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [locating, setLocating] = useState<string>();
  const fieldScroll = useRef<HTMLDivElement>(null);
  const availableSources = sources.filter((item) => item.available);
  const sourceCandidate = source && availableSources.find((item) => item.id === source.candidateId);
  const baseMatchesSource = !!source && isSourceBase(sourceBase, source.preview);
  const relatedRows =
    source && sourceCandidate && relations
      ? rows.filter((row) =>
          relations
            .get(row.path)
            ?.some((relation) =>
              sourceContainsRelation(
                relation,
                sourceCandidate,
                source.row,
                source.preview,
                baseMatchesSource
              )
            )
        )
      : [];
  const relatedPaths = new Set(relatedRows.map((row) => row.path));
  const visiblePaths = new Set(visible.map((row) => row.path));
  const containingPaths = new Set<string>();
  for (const row of relatedRows) {
    if (visiblePaths.has(row.path)) continue;
    let parent = row.parentPath;
    while (parent) {
      if (visiblePaths.has(parent)) {
        containingPaths.add(parent);
        break;
      }
      parent = rows.find((item) => item.path === parent)?.parentPath ?? null;
    }
  }
  useEffect(() => {
    if (!locating) return;
    const element = Array.from(
      fieldScroll.current?.querySelectorAll<HTMLElement>('[data-schema-path]') ?? []
    ).find((item) => item.dataset.schemaPath === locating);
    if (element) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setLocating(undefined);
    }
  }, [locating, visible]);
  const selectedRow = rows.find((row) => row.path === selected);
  const active: TransferItem | undefined = source
    ? { row: source.row, source }
    : selectedRow
      ? { row: selectedRow }
      : undefined;
  const targets = active ? rows.filter((row) => canReceive(active, row)) : [];
  const target = targets.find((row) => row.path === destination);
  const canMove = active && (target || (destination === 'root' && canReceive(active, null)));
  function transfer(item: TransferItem, parent: SchemaFieldRow | null) {
    if (disabled || !canReceive(item, parent)) return;
    if (item.source) onImport(item.source, parent);
    else onMove(item.row.path, parent);
    setSource(undefined);
    setMoveOpen(false);
    setDestination('');
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Drag a field or node to a node. Alternatively, select it and use Move to.',
        },
      }}
      onDragStart={({ active }) => {
        const data = active.data.current;
        setDragging(
          data?.kind === 'import' ? { row: data.item.row, source: data.item } : data?.item
        );
      }}
      onDragCancel={() => setDragging(undefined)}
      onDragEnd={({ over }) => {
        if (dragging && over) transfer(dragging, over.data.current?.row ?? null);
        setDragging(undefined);
      }}
    >
      <div
        className={styles.fieldWorkarea}
        data-sources={Boolean(projectId && !unavailable) || undefined}
      >
        {projectId && !unavailable ? (
          <aside className={styles.importSources} aria-label="Available Schema sources">
            <div className={styles.sourceHeading}>
              <strong>Schema sources</strong>
              {studio ? sourceManagement : null}
            </div>
            {!studio ? sourceManagement : null}
            <p className={styles.sourceHelp} hidden={!availableSources.length}>
              Drag a node or object field into your schema, or select one to choose where to add it.
            </p>
            {!availableSources.length ? (
              <p>
                {sourceManagement
                  ? 'No sources added. Use Manage to browse reusable definitions.'
                  : 'No sources added.'}
              </p>
            ) : null}
            {availableSources.map((candidate) => (
              <SchemaVisualSource
                key={candidate.id}
                projectId={projectId}
                candidate={candidate}
                selected={source}
                disabled={disabled}
                defaultOpen
                studio={studio}
                relations={!source && selected ? relations?.get(selected) : undefined}
                sourceBase={sourceBase}
                onSelect={(item) => {
                  setSource(item);
                  setDestination('');
                  setMoveOpen(true);
                }}
              />
            ))}
          </aside>
        ) : null}
        <div className={styles.fieldMain}>
          <div ref={fieldScroll} className={styles.fieldScroll}>
            <div className={styles.columns} hidden={unavailable || !rows.length}>
              <span>Name</span>
              <span>Type</span>
              <span className={styles.requiredColumn}>Required</span>
              <span className="sr-only">Actions</span>
            </div>
            {active ? (
              <div className={styles.moveToolbar}>
                <span>{active.row.semanticPath}</span>
                <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="canvas-outline" size="sm" disabled={disabled}>
                      {source ? 'Add to draft…' : 'Move to…'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className={styles.moveMenu}>
                    <label>
                      Destination
                      <select
                        aria-label="Destination node"
                        value={destination}
                        disabled={disabled}
                        onChange={(event) => setDestination(event.target.value)}
                      >
                        <option value="">Choose a node</option>
                        {active.row.kind === 'node' ? (
                          <option value="root">Top level</option>
                        ) : null}
                        {targets.map((row) => (
                          <option key={row.path} value={row.path}>
                            {row.semanticPath}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      size="sm"
                      variant="commit"
                      disabled={disabled || !canMove}
                      onClick={() => {
                        if (canMove) transfer(active, target ?? null);
                      }}
                    >
                      {source ? 'Add here' : 'Move here'}
                    </Button>
                  </PopoverContent>
                </Popover>
                {studio && source ? (
                  <span className={styles.relationSummary}>
                    <output>
                      {relatedRows.length
                        ? `${relatedRows.length} related items`
                        : 'No exact matches'}
                    </output>
                    {relatedRows.length && onReveal ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const first =
                            relatedRows.find((row) => !visiblePaths.has(row.path)) ??
                            relatedRows[0];
                          onReveal(first);
                          setLocating(first.path);
                        }}
                      >
                        Locate
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className={styles.moveToolbar} hidden={unavailable || !rows.length}>
                <span className={styles.selectionHint}>
                  {rows.length ? 'Select a node or field to edit' : 'Schema structure'}
                </span>
              </div>
            )}
            <div
              role="tree"
              aria-label="Schema fields"
              className={`${tree.tree} ${styles.fieldTree}`}
            >
              {visible.map((row) => (
                <DraggableRow
                  key={row.path}
                  row={row}
                  disabled={disabled}
                  related={
                    relatedPaths.has(row.path)
                      ? 'direct'
                      : containingPaths.has(row.path)
                        ? 'contains'
                        : undefined
                  }
                  dropDisabled={disabled || !dragging || !canReceive(dragging, row)}
                  render={(handle) =>
                    renderRow(row, handle, () => {
                      setSource(undefined);
                      setDestination('');
                      setMoveOpen(false);
                      onSelect(row);
                    })
                  }
                />
              ))}
            </div>
            <RootDropTarget
              disabled={disabled || !dragging || !canReceive(dragging, null)}
              importing={Boolean(dragging?.source)}
            />
            {!visible.length ? (
              <div className={styles.feedback}>
                {emptyContent ??
                  (rows.length
                    ? 'No fields match this search.'
                    : 'No nodes yet. Add a node or drag one from Schema sources.')}
              </div>
            ) : null}
          </div>
          {footer}
        </div>
      </div>
      <DragOverlay>
        {dragging ? <div className={styles.dragPreview}>{dragging.row.semanticPath}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function DraggableRow({
  row,
  disabled,
  dropDisabled,
  related,
  render,
}: {
  row: SchemaFieldRow;
  disabled: boolean;
  dropDisabled: boolean;
  related?: 'direct' | 'contains';
  render: (handle: ReactNode) => ReactNode;
}) {
  const drag = useDraggable({ id: `field:${row.path}`, data: { item: { row } }, disabled });
  const drop = useDroppable({ id: row.path, data: { row }, disabled: dropDisabled });
  return (
    <div
      ref={drop.setNodeRef}
      className={styles.dragRow}
      data-node={row.kind === 'node' || undefined}
      data-depth={row.depth}
      data-drop-target={drop.isOver || undefined}
      data-schema-path={row.path}
      data-related={related}
      title={
        related === 'contains'
          ? 'Contains fields related to the selected source'
          : related
            ? 'Related to the selected source'
            : undefined
      }
    >
      <span className={styles.treeGuides} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6, 7].slice(0, row.depth).map((level) => (
          <span
            key={level}
            className={styles.treeGuide}
            style={{ left: 14 + level * 16 }}
            data-branch={level === Math.min(row.depth, 8) - 1 || undefined}
          />
        ))}
      </span>
      {render(
        <button
          type="button"
          ref={drag.setNodeRef}
          {...drag.attributes}
          {...drag.listeners}
          disabled={disabled}
          className={styles.dragHandle}
          aria-label={`Drag ${row.semanticPath}`}
          title="Drag into a node to move"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function RootDropTarget({ disabled, importing }: { disabled: boolean; importing: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'schema-root', disabled });
  return (
    <div
      ref={setNodeRef}
      hidden={disabled}
      className={styles.rootDrop}
      data-drop-target={isOver || undefined}
    >
      {importing ? 'Drop a node here to add it at the top level' : 'Move to top level'}
    </div>
  );
}
