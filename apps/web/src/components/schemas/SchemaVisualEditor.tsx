'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
import { type ButtonHTMLAttributes, type ReactNode, useMemo, useState } from 'react';
import {
  type SchemaDefinition,
  type SchemaFieldRow,
  schemaRecord,
} from '@/domain/schemas/schemaFieldEditing';
import styles from './SchemaVisualEditor.module.css';

function DragButton({
  kind,
  value,
  label,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: 'field' | 'source';
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
  const { setNodeRef } = useDroppable({ id: 'schema-canvas', disabled });
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
};
function SchemaCard({ data }: NodeProps<Node<CardData>>) {
  const { row, fields, selected, disabled, select, add, source } = data;
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
          <button type="button" onClick={() => select(row)} aria-pressed={selected === row.path}>
            {row.semanticPath}
          </button>
        </div>
        <span>{row.definition.repeated ? 'Repeated node' : 'Node'}</span>
      </header>
      <div className="nodrag nopan">
        {fields.map((field) => (
          <DragButton
            key={field.path}
            kind="field"
            value={field.path}
            label={field.semanticPath}
            disabled={disabled}
            className={styles.field}
            aria-pressed={selected === field.path}
            aria-label={`Select field ${field.semanticPath}`}
            onClick={() => select(field)}
          >
            <span>{field.name}</span>
            <span>
              {String(field.definition.type ?? 'any')}
              {field.required ? ' · required' : ''}
            </span>
          </DragButton>
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
}: {
  definition: SchemaDefinition;
  rows: SchemaFieldRow[];
  selected?: string;
  layoutKey: string;
  disabled: boolean;
  onSelect: (row: SchemaFieldRow) => void;
  onAdd: (row: SchemaFieldRow) => void;
  onMove: (path: string, target: SchemaFieldRow) => void;
  onRelation: (from: string, to: string) => void;
  onRules: () => void;
  sources?: StudioCandidate[];
  onSource?: (id: string) => void;
  renderSource?: (row: SchemaFieldRow) => ReactNode;
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const nodeRows = rows.filter((row) => row.kind === 'node');
  const active = rows.find((row) => row.path === selected);
  const nodes = nodeRows.map(
    (row, index): Node<CardData> => ({
      id: row.path,
      type: 'schema',
      dragHandle: '.schema-drag-handle',
      position: positions[row.path] ?? { x: (index % 3) * 330, y: Math.floor(index / 3) * 300 },
      measured: dimensions[row.path],
      data: {
        row,
        fields: rows.filter((field) => field.kind === 'slot' && field.parentPath === row.path),
        selected,
        disabled,
        select: onSelect,
        add: onAdd,
        source: renderSource?.(row),
      },
    })
  );
  const edges = useMemo(() => {
    const result: Edge[] = rows
      .filter((row) => row.kind === 'node' && row.parentPath)
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
  }, [rows, definition.relationTypes]);
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
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press Enter to use this item, or drag it into the canvas. Fields can also be moved using the destination controls.',
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
      onDragStart={({ active }) => setDragLabel(String(active.data.current?.label ?? ''))}
      onDragCancel={() => setDragLabel('')}
      onDragEnd={({ active, over }) => {
        setDragLabel('');
        if (!over || disabled) return;
        const drag = active.data.current;
        if (drag?.kind === 'source') onSource?.(String(drag.value));
        else if (drag?.kind === 'field' && over.data.current?.row) {
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
            aria-label="Move field to node"
            value={destination}
            disabled={disabled || active?.kind !== 'slot'}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value="">Destination node</option>
            {nodeRows.map((row) => (
              <option key={row.path} value={row.path}>
                {row.semanticPath}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || active?.kind !== 'slot' || !destination}
            onClick={() => {
              const target = rows.find((row) => row.path === destination);
              if (active && target) onMove(active.path, target);
            }}
          >
            Move field
          </button>
          <button type="button" onClick={() => persist({})}>
            Reset layout
          </button>
        </div>
        <section className={styles.sources} aria-label="Available Schema sources">
          {sources
            .filter((source) => source.available)
            .map((source) => (
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
            ))}
        </section>
        <DropCanvas disabled={disabled}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
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
            onEdgeClick={onRules}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--stroke-divider)" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </DropCanvas>
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
          <span>Card positions are saved in this browser.</span>
        </div>
      </section>
      <DragOverlay>
        {dragLabel ? <div className={styles.dragPreview}>{dragLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
