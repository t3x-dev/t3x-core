'use client';

import {
  Box,
  ChevronRight,
  CircleSlash,
  Hash,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  availableDraftOps,
  buildDraftOp,
  createDraftChildOp,
  type DraftStructureNode,
  type DraftYOp,
  type DraftYOpName,
  deleteDraftOp,
  draftOpReason,
  editDraftOp,
  formatDraftValue,
  isSemanticEnvelope,
  parseDraftValue,
  walkDraftStructure,
} from '@/domain/workspaces/draftStructure';
import styles from './DraftStructureEditor.module.css';

type Intent =
  | { kind: 'add'; node: DraftStructureNode }
  | { kind: 'edit'; node: DraftStructureNode }
  | { kind: 'rename'; node: DraftStructureNode }
  | { kind: 'populate'; node: DraftStructureNode }
  | { kind: 'append'; node: DraftStructureNode }
  | { kind: 'assert'; node: DraftStructureNode }
  | { kind: 'sort'; node: DraftStructureNode }
  | { kind: 'unique'; node: DraftStructureNode }
  | { kind: 'pick-destination'; op: 'move' | 'clone'; node: DraftStructureNode }
  | {
      kind: 'select-keys';
      op: 'nest' | 'merge' | 'pick' | 'omit' | 'split';
      node: DraftStructureNode;
    };

const OP_LABELS: Record<DraftYOpName, string> = {
  define: 'Add empty mapping',
  drop: 'Delete',
  rename: 'Rename',
  set: 'Edit value',
  unset: 'Remove field',
  populate: 'Add fields',
  append: 'Append item',
  move: 'Move to…',
  clone: 'Clone to…',
  nest: 'Nest keys',
  split: 'Split keys',
  fold: 'Fold',
  merge: 'Merge keys',
  sort: 'Sort',
  unique: 'Deduplicate',
  pick: 'Keep keys',
  omit: 'Omit keys',
  assert: 'Assert',
};

export function DraftStructureEditor({
  current,
  error,
  onEditField,
  onEditingChange,
  onPublish,
  pending = false,
}: {
  current: unknown;
  error?: string | null;
  onEditField: (node: DraftStructureNode) => void;
  onEditingChange: (editing: boolean) => void;
  onPublish: (operations: DraftYOp[], reason: string) => Promise<boolean | void> | boolean | void;
  pending?: boolean;
}) {
  const semantic = isSemanticEnvelope(current);
  const nodes = useMemo(() => {
    const structure = walkDraftStructure(current);
    if (isSemanticEnvelope(current)) {
      if (!Array.isArray(current.content.relations) || !current.content.relations.length)
        return structure;
      const relations = walkDraftStructure({ relations: current.content.relations }).map(
        (node) => ({
          ...node,
          path: `content/${node.path}`,
          parentPath: node.parentPath ? `content/${node.parentPath}` : 'content',
        })
      );
      return [...structure, ...relations];
    }
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      const root: DraftStructureNode = {
        path: '',
        key: 'root',
        kind: 'mapping',
        value: current,
        preview: '',
        depth: 0,
        parentPath: null,
        childKeys: Object.keys(current),
        expandable: structure.length > 0,
      };
      return [root, ...structure.map((node) => ({ ...node, depth: node.depth + 1 }))];
    }
    return structure;
  }, [current]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [intent, updateIntent] = useState<Intent | null>(null);
  const setIntent = (next: Intent | null) => {
    updateIntent(next);
    setLocalError(null);
    onEditingChange(next !== null);
  };
  const [localError, setLocalError] = useState<string | null>(null);
  const visible = useMemo(() => {
    const hidden = new Set<string>();
    for (const node of nodes) {
      if (node.parentPath === null) continue;
      if (collapsed[node.parentPath] || hidden.has(node.parentPath)) hidden.add(node.path);
    }
    return nodes.filter((node) => !hidden.has(node.path));
  }, [collapsed, nodes]);

  const publish = async (operations: DraftYOp[]) => {
    setLocalError(null);
    try {
      const ok = await onPublish(operations, draftOpReason(operations[0]!));
      if (ok !== false) setIntent(null);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Could not apply this change.');
    }
  };

  const run = async (name: DraftYOpName, node: DraftStructureNode) => {
    if (name === 'set') return setIntent({ kind: 'edit', node });
    if (name === 'rename') return setIntent({ kind: 'rename', node });
    if (name === 'define') return setIntent({ kind: 'add', node });
    if (name === 'populate') return setIntent({ kind: 'populate', node });
    if (name === 'append') return setIntent({ kind: 'append', node });
    if (name === 'assert') return setIntent({ kind: 'assert', node });
    if (name === 'sort') return setIntent({ kind: 'sort', node });
    if (name === 'unique') return setIntent({ kind: 'unique', node });
    if (name === 'move' || name === 'clone')
      return setIntent({ kind: 'pick-destination', op: name, node });
    if (
      name === 'nest' ||
      name === 'merge' ||
      name === 'pick' ||
      name === 'omit' ||
      name === 'split'
    )
      return setIntent({ kind: 'select-keys', op: name, node });
    await publish([buildDraftOp(name, { path: node.path })]);
  };

  const selectDestination = async (destination: DraftStructureNode) => {
    if (intent?.kind !== 'pick-destination') return;
    const to =
      destination.kind === 'sequence' ||
      destination.kind === 'mapping' ||
      destination.kind === 'tree'
        ? destination.path
        : destination.path;
    await publish([
      buildDraftOp(intent.op, { path: intent.node.path, from: intent.node.path, to }),
    ]);
  };

  return (
    <div className={styles.content}>
      {error || localError ? (
        <p className={styles.status} data-tone="error" role="alert">
          {localError ?? error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <div className={styles.empty}>This draft has no structure yet.</div>
      ) : (
        <div className={styles.tree} role="tree" aria-label="Current draft structure">
          {visible.map((node) => (
            <StructureRow
              collapsed={Boolean(collapsed[node.path])}
              intent={intent}
              key={node.path}
              node={node}
              pending={pending || intent !== null}
              readOnly={semantic && node.path.startsWith('content/relations')}
              selected={selectedPath === node.path}
              onAdd={() => setIntent({ kind: 'add', node })}
              onDelete={() => void publish([deleteDraftOp(node.path)])}
              onEdit={() =>
                node.kind === 'scalar' ? onEditField(node) : setIntent({ kind: 'edit', node })
              }
              onRun={(name) => void run(name, node)}
              onSelect={() => {
                setSelectedPath(node.path);
                if (intent?.kind === 'pick-destination') void selectDestination(node);
                else if (node.expandable)
                  setCollapsed((current) => ({ ...current, [node.path]: !current[node.path] }));
              }}
            />
          ))}
        </div>
      )}
      {intent ? (
        <IntentEditor
          intent={intent}
          key={`${intent.kind}:${intent.node.path}:${'op' in intent ? intent.op : ''}`}
          pending={pending}
          onCancel={() => setIntent(null)}
          onPublish={(operations) => void publish(operations)}
        />
      ) : null}
    </div>
  );
}

function StructureRow({
  collapsed,
  intent,
  node,
  onAdd,
  onDelete,
  onEdit,
  onRun,
  onSelect,
  pending,
  readOnly,
  selected,
}: {
  collapsed: boolean;
  intent: Intent | null;
  node: DraftStructureNode;
  onAdd: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onRun: (name: DraftYOpName) => void;
  onSelect: () => void;
  pending: boolean;
  readOnly: boolean;
  selected: boolean;
}) {
  const ops = availableDraftOps(node);
  const { Icon, type } = structureType(node);
  const label = /\[\d+\]$/.test(node.path) ? `[${node.key}]` : node.key || 'root';
  return (
    <div
      aria-expanded={node.expandable ? !collapsed : undefined}
      aria-selected={selected}
      aria-level={node.depth + 1}
      className={styles.row}
      data-kind={node.kind}
      data-picking={intent?.kind === 'pick-destination' || undefined}
      data-selected={selected || undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      role="treeitem"
      style={{ paddingLeft: 8 + Math.min(node.depth, 8) * 16 }}
      tabIndex={0}
    >
      <span className={styles.identity} title={node.path || 'root'}>
        <ChevronRight
          className={styles.chevron}
          data-visible={node.expandable}
          aria-hidden="true"
        />
        <span className={styles.typeIcon} title={type}>
          <Icon aria-hidden="true" />
        </span>
        <span className={styles.label}>{label}</span>
      </span>
      <span className={styles.preview} title={node.kind === 'scalar' ? node.preview : type}>
        {node.kind === 'scalar' ? node.preview : type}
      </span>
      {readOnly ? (
        <span className={styles.readOnly}>Read only</span>
      ) : (
        <span className={styles.actions}>
          {node.kind !== 'scalar' ? (
            <button
              aria-label={`Add inside ${node.key}`}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
              type="button"
            >
              <Plus size={14} />
            </button>
          ) : null}
          <button
            aria-label={`Edit ${node.key}`}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            type="button"
          >
            <Pencil size={14} />
          </button>
          <button
            aria-label={`Delete ${node.key}`}
            data-danger="true"
            disabled={pending || !node.path}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            type="button"
          >
            <Trash2 size={14} />
          </button>
          {ops.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`More operations for ${node.key}`}
                  disabled={pending}
                  onClick={(event) => event.stopPropagation()}
                  type="button"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                {ops.map((name) => (
                  <DropdownMenuItem key={name} onSelect={() => onRun(name)}>
                    {OP_LABELS[name]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      )}
    </div>
  );
}

function structureType(node: DraftStructureNode) {
  if (node.kind === 'sequence') return { Icon: List, type: 'array' };
  if (node.kind !== 'scalar') return { Icon: Box, type: 'object' };
  if (node.value === null) return { Icon: CircleSlash, type: 'null' };
  if (typeof node.value === 'number') return { Icon: Hash, type: 'number' };
  if (typeof node.value === 'boolean') return { Icon: ToggleLeft, type: 'boolean' };
  return { Icon: Type, type: 'string' };
}

function IntentEditor({
  intent,
  onCancel,
  onPublish,
  pending,
}: {
  intent: Intent;
  onCancel: () => void;
  onPublish: (operations: DraftYOp[]) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(intent.kind === 'rename' ? intent.node.key : '');
  const [kind, setKind] = useState<'field' | 'node' | 'item'>(
    intent.node.kind === 'sequence' ? 'item' : 'field'
  );
  const [value, setValue] = useState(
    intent.kind === 'edit' ? formatDraftValue(intent.node.value) : ''
  );
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const parse = () => {
    try {
      return parseDraftValue(value);
    } catch {
      throw new TypeError('Enter a string, number, boolean, or JSON value.');
    }
  };

  const submit = () => {
    if (intent.kind === 'add') {
      onPublish([createDraftChildOp(intent.node, name, kind, value ? parse() : '')]);
      return;
    }
    if (intent.kind === 'edit') {
      onPublish([editDraftOp(intent.node.path, parse())]);
      return;
    }
    if (intent.kind === 'rename') {
      onPublish([buildDraftOp('rename', { path: intent.node.path, to: name })]);
      return;
    }
    if (intent.kind === 'append') {
      onPublish([buildDraftOp('append', { path: intent.node.path, value: parse() })]);
      return;
    }
    if (intent.kind === 'populate') {
      onPublish([
        buildDraftOp('populate', { path: intent.node.path, values: { [name]: parse() } }),
      ]);
      return;
    }
    if (intent.kind === 'assert') {
      onPublish([
        buildDraftOp('assert', {
          path: intent.node.path,
          exists: true,
          type:
            second === 'sequence' || second === 'scalar' || second === 'mapping'
              ? second
              : undefined,
        }),
      ]);
      return;
    }
    if (intent.kind === 'sort') {
      onPublish([
        buildDraftOp('sort', {
          path: intent.node.path,
          by: name || undefined,
          order: second === 'desc' ? 'desc' : 'asc',
        }),
      ]);
      return;
    }
    if (intent.kind === 'unique') {
      onPublish([buildDraftOp('unique', { path: intent.node.path, by: name || undefined })]);
      return;
    }
    if (intent.kind === 'select-keys') {
      if (intent.op === 'split') {
        onPublish([
          buildDraftOp('split', { path: intent.node.path, into: { [name || 'group']: keys } }),
        ]);
        return;
      }
      if (intent.op === 'nest') {
        onPublish([buildDraftOp('nest', { path: intent.node.path, keys, under: name })]);
        return;
      }
      if (intent.op === 'merge') {
        onPublish([buildDraftOp('merge', { path: intent.node.path, keys, into: name })]);
        return;
      }
      onPublish([buildDraftOp(intent.op, { path: intent.node.path, keys })]);
    }
  };

  if (intent.kind === 'pick-destination') {
    return (
      <div className={styles.picker}>
        <span>Click the destination for {intent.op}.</span>
        <button data-quiet="true" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        try {
          submit();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Invalid value');
        }
      }}
    >
      <header className={styles.editorHeading}>
        <strong>
          {intent.kind === 'edit' ? 'Edit value' : intent.kind === 'add' ? 'Add inside' : 'Update'}{' '}
          {intent.node.key}
        </strong>
        <code>{intent.node.path || 'root'}</code>
      </header>
      {error ? (
        <p className={styles.status} data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
      {intent.kind === 'add' ? (
        <>
          <input
            aria-label="New name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            value={name}
          />
          <select
            aria-label="What to add"
            onChange={(event) => setKind(event.target.value as typeof kind)}
            value={kind}
          >
            {intent.node.kind === 'sequence' ? <option value="item">Item</option> : null}
            <option value="field">Field</option>
            <option value="node">Node</option>
          </select>
          {kind !== 'node' ? (
            <input
              aria-label="New value"
              onChange={(event) => setValue(event.target.value)}
              placeholder="Value"
              value={value}
            />
          ) : null}
        </>
      ) : null}
      {intent.kind === 'edit' || intent.kind === 'append' ? (
        <textarea
          rows={5}
          aria-label="Value"
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
      ) : null}
      {intent.kind === 'rename' || intent.kind === 'populate' ? (
        <input
          aria-label={intent.kind === 'rename' ? 'New key' : 'Field name'}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      ) : null}
      {intent.kind === 'populate' ? (
        <input
          aria-label="Field value"
          onChange={(event) => setValue(event.target.value)}
          placeholder="Value"
          value={value}
        />
      ) : null}
      {intent.kind === 'assert' ? (
        <select
          aria-label="Assert type"
          onChange={(event) => setSecond(event.target.value)}
          value={second}
        >
          <option value="">Exists</option>
          <option value="mapping">Mapping</option>
          <option value="sequence">Sequence</option>
          <option value="scalar">Scalar</option>
        </select>
      ) : null}
      {intent.kind === 'sort' ? (
        <>
          <input
            aria-label="Sort by"
            onChange={(event) => setName(event.target.value)}
            placeholder="Sort by key"
            value={name}
          />
          <select
            aria-label="Sort order"
            onChange={(event) => setSecond(event.target.value)}
            value={second || 'asc'}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </>
      ) : null}
      {intent.kind === 'unique' ? (
        <input
          aria-label="Unique by"
          onChange={(event) => setName(event.target.value)}
          placeholder="Unique by key"
          value={name}
        />
      ) : null}
      {intent.kind === 'select-keys' ? (
        <>
          <div className={styles.keys}>
            {intent.node.childKeys.map((key) => (
              <label key={key}>
                <input
                  checked={keys.includes(key)}
                  onChange={() =>
                    setKeys((current) =>
                      current.includes(key)
                        ? current.filter((item) => item !== key)
                        : [...current, key]
                    )
                  }
                  type="checkbox"
                />
                {key}
              </label>
            ))}
          </div>
          {intent.op === 'nest' || intent.op === 'merge' || intent.op === 'split' ? (
            <input
              aria-label={intent.op === 'split' ? 'Group name' : 'Target name'}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                intent.op === 'nest'
                  ? 'Wrapper key'
                  : intent.op === 'merge'
                    ? 'Into key'
                    : 'Group name'
              }
              value={name}
            />
          ) : null}
        </>
      ) : null}
      <button disabled={pending} type="submit">
        Apply
      </button>
      <button data-quiet="true" onClick={onCancel} type="button">
        Cancel
      </button>
    </form>
  );
}
