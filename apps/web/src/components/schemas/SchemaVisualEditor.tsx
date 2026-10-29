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
import { ChevronDown, GripVertical } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  type SchemaDefinition,
  type SchemaFieldRow,
  schemaRecord,
} from '@/domain/schemas/schemaFieldEditing';
import overlay from './SchemaEditorOverlay.module.css';
import { SchemaEditorSelect } from './SchemaEditorSelect';
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
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={styles.anchor}
      />
      <header>
        <div className={styles.nodeHeading}>
          {source}
          <DragButton
            kind="node"
            value={row.path}
            label={row.semanticPath}
            disabled={disabled}
            className={`${styles.nodeTitle} nodrag nopan`}
            aria-label={`Move node ${row.semanticPath}`}
            aria-pressed={selected === row.path}
            title="Drag into a node to move it, or onto empty canvas to move it to the root"
            onClick={() => select(row)}
          >
            <GripVertical aria-hidden="true" size={16} />
            <span>{row.name}</span>
          </DragButton>
        </div>
        <span>
          {row.definition.repeated ? 'Repeatable node' : 'Node'} · Parent:{' '}
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
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={styles.anchor}
      />
    </section>
  );
}
const nodeTypes = { schema: SchemaCard };
export type ParentLineMode = 'focus' | 'off' | 'all';
const schemaCollision: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const nodes = hits.filter((hit) => hit.id !== 'schema-canvas');
  return nodes.length ? nodes : hits;
};
export function SchemaVisualEditor({
  definition,
  rows,
  selected,
  disabled,
  onSelect,
  onAdd,
  onMove,
  onRules,
  sources = [],
  onSource,
  renderSource,
  projectId,
  onImport,
  onClearSelection,
  parentLineMode,
  onParentLineModeChange,
}: {
  definition: SchemaDefinition;
  rows: SchemaFieldRow[];
  selected?: string;
  disabled: boolean;
  onSelect: (row: SchemaFieldRow) => void;
  onAdd: (row: SchemaFieldRow) => void;
  onMove: (path: string, target: SchemaFieldRow | null) => void;
  onRules: () => void;
  sources?: StudioCandidate[];
  onSource?: (id: string) => void;
  renderSource?: (row: SchemaFieldRow) => ReactNode;
  projectId?: string;
  onImport?: (item: SchemaSourceItem, target: SchemaFieldRow | null) => void;
  onClearSelection?: () => void;
  parentLineMode: ParentLineMode;
  onParentLineModeChange: (mode: ParentLineMode) => void;
}) {
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>(
    {}
  );
  const destinationId = useId();
  const [destination, setDestination] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [dragLabel, setDragLabel] = useState('');
  const [dragPath, setDragPath] = useState<string>();
  const [overPath, setOverPath] = useState<string>();
  const [sourceItem, setSourceItem] = useState<SchemaSourceItem>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const nodeRows = rows.filter((row) => row.kind === 'node');
  const selectedRow = rows.find((row) => row.path === selected);
  const selectedNode = selectedRow?.kind === 'slot' ? selectedRow.parentPath : selectedRow?.path;
  const active = sourceItem?.row ?? selectedRow;
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
  const fieldsFor = (row: SchemaFieldRow) =>
    rows.filter((field) => field.kind === 'slot' && field.parentPath === row.path);
  const heightOf = (row: SchemaFieldRow) =>
    dimensions[row.path]?.height ?? 120 + fieldsFor(row).length * 42;
  const rowTops = [0];
  for (let index = 2; index < nodeRows.length; index += 2) {
    rowTops.push(
      rowTops.at(-1)! +
        Math.max(heightOf(nodeRows[index - 2]!), heightOf(nodeRows[index - 1]!)) +
        40
    );
  }
  const nodes = nodeRows.map(
    (row, index): Node<CardData> => ({
      id: row.path,
      type: 'schema',
      selected: row.path === selectedNode,
      position: { x: (index % 2) * 310, y: rowTops[Math.floor(index / 2)]! },
      measured: dimensions[row.path],
      data: {
        row,
        fields: fieldsFor(row),
        selected,
        disabled,
        select: (item) => {
          setSourceItem(undefined);
          setDestination('');
          setMoveOpen(false);
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
          parentLineMode !== 'off' &&
          (parentLineMode === 'all' || focused.has(row.path) || focused.has(row.parentPath))
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
  }, [rows, definition.relationTypes, selected, parentLineMode, dragPath, overPath]);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={schemaCollision}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Drag a node title into another node or onto empty canvas to change its parent. Fields and objects can be dragged into nodes. You can also select an item and use Move to or Import to.',
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
          onMove(String(drag.value), target);
        }
      }}
    >
      <section className={styles.editor} aria-label="Schema visual editor">
        <div className={styles.tools}>
          <span className={styles.selection}>
            {active ? active.semanticPath : 'Drag nodes or objects into a node to combine.'}
          </span>
          {active ? (
            <Popover open={moveOpen} onOpenChange={setMoveOpen}>
              <PopoverTrigger asChild>
                <Button variant="canvas-outline" size="sm" disabled={disabled}>
                  {sourceItem ? 'Add to draft…' : 'Move to…'}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className={overlay.popover}
                aria-label="Choose destination"
              >
                <label className={overlay.field} htmlFor={destinationId}>
                  {sourceItem ? 'Import' : 'Move'} {active.semanticPath} to
                  <SchemaEditorSelect
                    id={destinationId}
                    aria-label={`Move ${movableKind} to ${active.kind === 'node' ? 'parent' : 'node'}`}
                    value={destination}
                    disabled={disabled}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <option value="">Choose a node</option>
                    {active.kind === 'node' ? <option value="root">Root</option> : null}
                    {destinations.map((row) => (
                      <option key={row.path} value={row.path}>
                        {row.semanticPath}
                      </option>
                    ))}
                  </SchemaEditorSelect>
                </label>
                <div className={overlay.actions}>
                  <Button size="sm" variant="ghost" onClick={() => setMoveOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="commit"
                    disabled={disabled || !canMove}
                    onClick={() => {
                      if (!canMove) return;
                      setMoveOpen(false);
                      if (sourceItem) onImport?.(sourceItem, destinationRow ?? null);
                      else onMove(active.path, destinationRow ?? null);
                    }}
                  >
                    {sourceItem ? 'Import' : 'Move'} {movableKind}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="canvas-outline" size="sm" aria-label="Canvas options">
                Canvas <ChevronDown size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Parent lines</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={parentLineMode}
                onValueChange={(value) => {
                  if (value === 'focus' || value === 'off' || value === 'all')
                    onParentLineModeChange(value);
                }}
              >
                <DropdownMenuRadioItem value="focus">On selection</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="off">Hidden</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onRules}>Relationships &amp; rules</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                      setMoveOpen(false);
                      onClearSelection?.();
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
              nodesDraggable={false}
              nodesConnectable={false}
              zoomOnScroll={false}
              preventScrolling={false}
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
              }}
              onPaneClick={() => {
                setSourceItem(undefined);
                setMoveOpen(false);
                onClearSelection?.();
              }}
              onNodeClick={(event, node) => {
                // Buttons already select the exact field/object or open its source.
                if ((event.target as Element).closest('button, a, input, select, textarea')) return;
                node.data.select(node.data.row);
              }}
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
      </section>
      <DragOverlay>
        {dragLabel ? <div className={styles.dragPreview}>{dragLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
