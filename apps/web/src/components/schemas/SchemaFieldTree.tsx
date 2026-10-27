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
import { type ReactNode, useState } from 'react';
import tree from '@/components/structure/StructureTree.module.css';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SchemaFieldRow } from '@/domain/schemas/schemaFieldEditing';
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
  disabled,
  projectId,
  sources = [],
  sourceManagement,
  onMove,
  onImport,
  onSelect,
  renderRow,
}: {
  rows: SchemaFieldRow[];
  visible: SchemaFieldRow[];
  selected?: string;
  disabled: boolean;
  projectId?: string;
  sources?: StudioCandidate[];
  sourceManagement?: ReactNode;
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
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const availableSources = sources.filter((item) => item.available);
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
        data-sources={
          Boolean(sourcesOpen && projectId && (availableSources.length || sourceManagement)) ||
          undefined
        }
      >
        {sourcesOpen && projectId && (availableSources.length > 0 || sourceManagement) ? (
          <aside className={styles.importSources} aria-label="Available Schema sources">
            <div className={styles.sourceHeading}>
              <strong>Sources</strong>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Hide sources"
                onClick={() => setSourcesOpen(false)}
              >
                Hide
              </Button>
            </div>
            {sourceManagement}
            <p>Drag nodes or objects into the draft.</p>
            {!availableSources.length ? (
              <p>Add a source through Manage sources to get started.</p>
            ) : null}
            {availableSources.map((candidate) => (
              <SchemaVisualSource
                key={candidate.id}
                projectId={projectId}
                candidate={candidate}
                selected={source}
                disabled={disabled}
                defaultOpen
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
          <div className={styles.columns}>
            <span className="flex items-center gap-2">
              {!sourcesOpen && projectId ? (
                <Button variant="ghost" size="sm" onClick={() => setSourcesOpen(true)}>
                  Sources
                </Button>
              ) : null}
              Field
            </span>
            <span>Type · Required</span>
            <span className="sr-only">Actions</span>
          </div>
          {active ? (
            <div className={styles.moveToolbar}>
              <span>{active.row.semanticPath}</span>
              <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                <PopoverTrigger asChild>
                  <Button variant="canvas-outline" size="sm" disabled={disabled}>
                    {source ? 'Import to…' : 'Move to…'}
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
                      {active.row.kind === 'node' ? <option value="root">Root</option> : null}
                      {targets.map((row) => (
                        <option key={row.path} value={row.path}>
                          {row.semanticPath}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    disabled={disabled || !canMove}
                    onClick={() => {
                      if (canMove) transfer(active, target ?? null);
                    }}
                  >
                    {source ? 'Import here' : 'Move here'}
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className={styles.moveToolbar}>
              <span className={styles.selectionHint}>Select a field to edit</span>
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
            <p className={styles.feedback}>
              {rows.length
                ? 'No fields match this search.'
                : 'No nodes yet. Add a node or drag one from Sources.'}
            </p>
          ) : null}
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
  render,
}: {
  row: SchemaFieldRow;
  disabled: boolean;
  dropDisabled: boolean;
  render: (handle: ReactNode) => ReactNode;
}) {
  const drag = useDraggable({ id: `field:${row.path}`, data: { item: { row } }, disabled });
  const drop = useDroppable({ id: row.path, data: { row }, disabled: dropDisabled });
  return (
    <div
      ref={drop.setNodeRef}
      className={styles.dragRow}
      data-drop-target={drop.isOver || undefined}
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
      {importing ? 'Drop a node here to add it at the root' : 'Move to root'}
    </div>
  );
}
