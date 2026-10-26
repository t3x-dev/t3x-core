'use client';

import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { StudioCandidate } from '@t3x-dev/api-client';
import { GripVertical } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useMemo, useState } from 'react';
import {
  type SchemaDefinition,
  type SchemaFieldRow,
  schemaRecord,
} from '@/domain/schemas/schemaFieldEditing';
import styles from './SchemaVisualEditor.module.css';
import { type SchemaSourceItem, SchemaVisualSource } from './SchemaVisualSources';

function DragButton({
  kind,
  value,
  label,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: 'node' | 'field' | 'source';
  value: string;
  label: string;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `${kind}:${value}`,
    data: { kind, value, label },
    disabled,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...props}
      disabled={disabled}
      style={{ touchAction: 'none', opacity: isDragging ? 0.45 : undefined }}
    />
  );
}
function DropCanvas({ children, disabled }: { children: ReactNode; disabled: boolean }) {
  const { setNodeRef } = useDroppable({ id: 'schema-canvas', data: { kind: 'root' }, disabled });
  return (
    <div ref={setNodeRef} className={styles.canvas}>
      {children}
    </div>
  );
}
type PositionMap = Record<string, { x: number; y: number }>;
type CardData = {
  row: SchemaFieldRow;
  fields: SchemaFieldRow[];
  selected?: string;
  disabled: boolean;
  select: (row: SchemaFieldRow) => void;
  add: (row: SchemaFieldRow) => void;
  source?: ReactNode;
  renderSource?: (row: SchemaFieldRow) => ReactNode;
};
function SchemaCard({ data }: NodeProps<Node<CardData>>) {
  const { row, fields, selected, disabled, select, add, source, renderSource } = data;
  const { setNodeRef, isOver } = useDroppable({ id: row.path, data: { row }, disabled });
  return (
    <section
      ref={setNodeRef}
      className={styles.card}
      data-drop-target={isOver || undefined}
      aria-label={`Node ${row.semanticPath}`}
    >
      <Handle type="target" position={Position.Left} />
      <header className="schema-drag-handle">
        <div className={styles.nodeHeading}>
          {source}
          <DragButton
            kind="node"
            value={row.path}
            label={row.semanticPath}
            disabled={disabled}
            className={`${styles.moveHandle} nodrag nopan`}
            aria-label={`Move node ${row.semanticPath}`}
            title="Move this node into another node or to the root on empty canvas"
            onClick={() => select(row)}
          >
            <GripVertical aria-hidden="true" size={16} />
          </DragButton>
          <button type="button" onClick={() => select(row)} aria-pressed={selected === row.path}>
            {row.name}
          </button>
        </div>
        <span>
          {row.definition.repeated ? 'Repeated node' : 'Node'} · Parent:{' '}
          {row.semanticPath.split('/').slice(0, -1).join('/') || 'Root'}
        </span>
      </header>
      <div className="nodrag nopan">
        {fields.map((field) => (
          <div key={field.path} className={styles.fieldRow}>
            {field.definition.type === 'object' ? renderSource?.(field) : null}
            <DragButton
              kind="field"
              value={field.path}
              label={field.semanticPath}
              disabled={disabled}
              className={styles.field}
              aria-pressed={selected === field.path}
              aria-label={`Select ${field.definition.type === 'object' ? 'object' : 'field'} ${field.semanticPath}`}
              onClick={() => select(field)}
            >
              <span>{field.name}</span>
              <span>
                {String(field.definition.type ?? 'any')}
                {field.required ? ' · required' : ''}
              </span>
            </DragButton>
          </div>
        ))}
        <button type="button" className={styles.add} disabled={disabled} onClick={() => add(row)}>
          + Add field
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </section>
  );
}
const nodeTypes = { schema: SchemaCard };
const schemaCollision: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const nodes = hits.filter((hit) => hit.id !== 'schema-canvas');
  return nodes.length ? nodes : hits;
};
function readPositions(key: string): PositionMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
    return Object.fromEntries(
      Object.entries(schemaRecord(parsed)).filter(([, value]) => {
        const point = schemaRecord(value);
        return Number.isFinite(point.x) && Number.isFinite(point.y);
      })
    ) as PositionMap;
  } catch {
    return {};
  }
}
export function SchemaVisualEditor({
  definition,
  rows,
  selected,
  layoutKey,
  disabled,
  onSelect,
  onAdd,
  onMove,
  onRelation,
  onRules,
  sources = [],
  onSource,
  renderSource,
  projectId,
  onImport,
  onClearSelection,
}: {
  definition: SchemaDefinition;
  rows: SchemaFieldRow[];
  selected?: string;
  layoutKey: string;
  disabled: boolean;
  onSelect: (row: SchemaFieldRow) => void;
  onAdd: (row: SchemaFieldRow) => void;
  onMove: (path: string, target: SchemaFieldRow | null) => void;
  onRelation: (from: string, to: string) => void;
  onRules: () => void;
  sources?: StudioCandidate[];
  onSource?: (id: string) => void;
  renderSource?: (row: SchemaFieldRow) => ReactNode;
  projectId?: string;
  onImport?: (item: SchemaSourceItem, target: SchemaFieldRow | null) => void;
  onClearSelection?: () => void;
}) {
  const storageKey = `t3x-schema-layout:${layoutKey}`;
  const [positions, setPositions] = useState<PositionMap>(() => readPositions(storageKey));
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>(
    {}
  );
  const [destination, setDestination] = useState('');
  const [relationFrom, setRelationFrom] = useState('');
  const [relationTo, setRelationTo] = useState('');
  const [dragLabel, setDragLabel] = useState('');
  const [lineMode, setLineMode] = useState('focus');
  const [dragPath, setDragPath] = useState<string>();
  const [overPath, setOverPath] = useState<string>();
  const [sourceItem, setSourceItem] = useState<SchemaSourceItem>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const nodeRows = rows.filter((row) => row.kind === 'node');
  const active = sourceItem?.row ?? rows.find((row) => row.path === selected);
  const movableKind =
    active?.kind === 'node' ? 'node' : active?.definition.type === 'object' ? 'object' : 'field';
  const destinations = nodeRows.filter(
    (row) =>
      active?.kind !== 'node' ||
      (sourceItem && !row.definition.repeated && row.definition.children !== 'any') ||
      (!active.location.every((key, index) => row.location[index] === key) &&
        !row.definition.repeated &&
        row.definition.children !== 'any')
  );
  const destinationRow = destinations.find((row) => row.path === destination);
  const canMove =
    !!active && (destinationRow || (active.kind === 'node' && destination === 'root'));
  const nodes = nodeRows.map(
    (row, index): Node<CardData> => ({
      id: row.path,
      type: 'schema',
      dragHandle: '.schema-drag-handle',
      position: positions[row.path] ?? { x: (index % 2) * 310, y: Math.floor(index / 2) * 300 },
      measured: dimensions[row.path],
      data: {
        row,
        fields: rows.filter((field) => field.kind === 'slot' && field.parentPath === row.path),
        selected,
        disabled,
        select: (item) => {
          setSourceItem(undefined);
          onSelect(item);
        },
        add: onAdd,
        source: renderSource?.(row),
        renderSource,
      },
    })
  );
  const edges = useMemo(() => {
    const selectedRow = rows.find((row) => row.path === (dragPath ?? selected));
    const focused = new Set([
      selectedRow?.kind === 'slot' ? selectedRow.parentPath : selectedRow?.path,
      overPath,
    ]);
    const result: Edge[] = rows
      .filter(
        (row) =>
          row.kind === 'node' &&
          row.parentPath &&
          lineMode !== 'off' &&
          (lineMode === 'all' || focused.has(row.path) || focused.has(row.parentPath))
      )
      .map((row) => ({
        id: `parent:${row.path}`,
        source: row.parentPath!,
        target: row.path,
        label: 'child',
        style: { stroke: 'var(--stroke-default)' },
      }));
    for (const [name, raw] of Object.entries(schemaRecord(definition.relationTypes))) {
      const relation = schemaRecord(raw);
      const find = (pattern: unknown) =>
        rows.find(
          (row) =>
            row.kind === 'node' &&
            (row.semanticPath === pattern || `${row.semanticPath}/*` === pattern)
        );
      const from = find(relation.from),
        to = find(relation.to);
      if (from && to)
        result.push({
          id: `relation:${name}`,
          source: from.path,
          target: to.path,
          label: name,
          style: { stroke: 'var(--accent-commit)' },
        });
    }
    return result;
  }, [rows, definition.relationTypes, selected, lineMode, dragPath, overPath]);
  function persist(next: PositionMap) {
    setPositions(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Layout still works for this session. */
    }
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={schemaCollision}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Drag a node by its move handle into another node or onto empty canvas. Fields and objects can be dragged into nodes. You can also select an item and use the destination controls.',
        },
        announcements: {
          onDragStart: ({ active }) => `Dragging ${active.data.current?.label ?? 'item'}.`,
          onDragOver: ({ over }) =>
            over
              ? `Over ${over.data.current?.row?.semanticPath ?? 'canvas'}.`
              : 'Outside the canvas.',
          onDragEnd: ({ active, over }) =>
            over
              ? `Dropped ${active.data.current?.label ?? 'item'} on ${over.data.current?.row?.semanticPath ?? 'canvas'}.`
              : 'Drag cancelled.',
          onDragCancel: () => 'Drag cancelled.',
        },
      }}
      onDragStart={({ active }) => {
        setDragLabel(String(active.data.current?.label ?? ''));
        setDragPath(active.data.current?.value);
      }}
      onDragOver={({ over }) => setOverPath(over?.data.current?.row?.path)}
      onDragCancel={() => {
        setDragLabel('');
        setDragPath(undefined);
        setOverPath(undefined);
      }}
      onDragEnd={({ active, over }) => {
        setDragLabel('');
        setDragPath(undefined);
        setOverPath(undefined);
        if (!over || disabled) return;
        const drag = active.data.current;
        if (drag?.kind === 'import') onImport?.(drag.item, over.data.current?.row ?? null);
        else if (drag?.kind === 'source') onSource?.(String(drag.value));
        else if (drag?.kind === 'node') {
          const target = over.data.current?.row as SchemaFieldRow | undefined;
          if (target && target.path !== drag.value) onMove(String(drag.value), target);
          else if (over.id === 'schema-canvas') onMove(String(drag.value), null);
        } else if (drag?.kind === 'field' && over.data.current?.row) {
          const target = over.data.current.row as SchemaFieldRow;
          if (drag.value === 'new') onAdd(target);
          else onMove(String(drag.value), target);
        }
      }}
    >
      <section className={styles.editor} aria-label="Schema visual editor">
        <div className={styles.tools}>
          <DragButton
            kind="field"
            value="new"
            label="New field"
            disabled={disabled || !nodeRows.length}
            onClick={() => {
              const target = active?.kind === 'node' ? active : nodeRows[0];
              if (target) onAdd(target);
            }}
          >
            + Field · drag to a node
          </DragButton>
          <select
            aria-label={`Move ${movableKind} to ${active?.kind === 'node' ? 'parent' : 'node'}`}
            value={destination}
            disabled={disabled || !active}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value="">Destination node</option>
            {active?.kind === 'node' ? <option value="root">Root</option> : null}
            {destinations.map((row) => (
              <option key={row.path} value={row.path}>
                {row.semanticPath}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !canMove}
            onClick={() => {
              if (active && canMove) {
                if (sourceItem) onImport?.(sourceItem, destinationRow ?? null);
                else onMove(active.path, destinationRow ?? null);
              }
            }}
          >
            {sourceItem ? 'Import' : 'Move'} {movableKind}
          </button>
          <button type="button" onClick={() => persist({})}>
            Reset layout
          </button>
          <label>
            Parent lines{' '}
            <select
              aria-label="Parent lines"
              value={lineMode}
              onChange={(event) => setLineMode(event.target.value)}
            >
              <option value="focus">On selection</option>
              <option value="off">Hidden</option>
              <option value="all">All</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setSourceItem(undefined);
              onClearSelection?.();
            }}
          >
            Clear selection
          </button>
        </div>
        <div className={styles.workarea}>
          <section className={styles.sources} aria-label="Available Schema sources">
            {projectId ? (
              <>
                <strong>Sources</strong>
                <span>Drag to copy into the draft</span>
              </>
            ) : null}
            {sources
              .filter((source) => source.available)
              .map((source) =>
                projectId ? (
                  <SchemaVisualSource
                    key={source.id}
                    projectId={projectId}
                    candidate={source}
                    disabled={disabled}
                    selected={sourceItem}
                    onSelect={(item) => {
                      setSourceItem(item);
                      setDestination('');
                    }}
                  />
                ) : (
                  <DragButton
                    key={source.id}
                    kind="source"
                    value={source.id}
                    label={source.title ?? source.source?.canonicalName ?? 'Schema source'}
                    disabled={disabled}
                    onClick={() => onSource?.(source.id)}
                  >
                    + {source.title ?? source.source?.canonicalName} · {source.source?.version}{' '}
                    <small>{source.kind}</small>
                  </DragButton>
                )
              )}
          </section>
          <DropCanvas disabled={disabled}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 24, y: 24, zoom: 0.9 }}
              fitViewOptions={{ maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.8}
              nodesDraggable={!disabled}
              nodesConnectable={!disabled}
              deleteKeyCode={null}
              onNodesChange={(changes) => {
                setDimensions((current) => {
                  let next = current;
                  for (const change of changes)
                    if (
                      change.type === 'dimensions' &&
                      change.dimensions &&
                      (current[change.id]?.width !== change.dimensions.width ||
                        current[change.id]?.height !== change.dimensions.height)
                    )
                      next = { ...next, [change.id]: change.dimensions };
                  return next;
                });
                setPositions((current) => {
                  let next = current;
                  for (const change of changes)
                    if (change.type === 'position' && change.position)
                      next = { ...next, [change.id]: change.position };
                  return next;
                });
              }}
              onNodeDragStop={(_, node) => persist({ ...positions, [node.id]: node.position })}
              onConnect={({ source, target }) => {
                if (source && target && !disabled) onRelation(source, target);
              }}
              onPaneClick={() => {
                setSourceItem(undefined);
                onClearSelection?.();
              }}
              onNodeClick={() => setSourceItem(undefined)}
              onEdgeClick={(_, edge) => {
                if (edge.id.startsWith('relation:')) onRules();
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--stroke-divider)" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </DropCanvas>
        </div>
        <div className={styles.tools}>
          <select
            aria-label="Relation from node"
            value={relationFrom}
            onChange={(event) => setRelationFrom(event.target.value)}
            disabled={disabled}
          >
            <option value="">From node</option>
            {nodeRows.map((row) => (
              <option key={row.path} value={row.path}>
                {row.semanticPath}
              </option>
            ))}
          </select>
          <select
            aria-label="Relation to node"
            value={relationTo}
            onChange={(event) => setRelationTo(event.target.value)}
            disabled={disabled}
          >
            <option value="">To node</option>
            {nodeRows.map((row) => (
              <option key={row.path} value={row.path}>
                {row.semanticPath}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !relationFrom || !relationTo}
            onClick={() => onRelation(relationFrom, relationTo)}
          >
            Add relation
          </button>
          <span>
            Drag headers to arrange cards. Drag the move handle to change a node's parent.
          </span>
        </div>
      </section>
      <DragOverlay>
        {dragLabel ? <div className={styles.dragPreview}>{dragLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
