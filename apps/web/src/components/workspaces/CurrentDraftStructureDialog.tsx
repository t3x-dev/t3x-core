'use client';

import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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
  parseDraftValue,
  walkDraftStructure,
} from '@/domain/workspaces/draftStructure';
import styles from './CurrentDraftStructureDialog.module.css';

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

export function CurrentDraftStructureDialog({
  current,
  error,
  onClose,
  onPublish,
  open,
  pending = false,
}: {
  current: unknown;
  error?: string | null;
  onClose: () => void;
  onPublish: (operations: DraftYOp[], reason: string) => Promise<boolean | void> | boolean | void;
  open: boolean;
  pending?: boolean;
}) {
  const nodes = useMemo(() => walkDraftStructure(current), [current]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const visible = useMemo(() => {
    const hidden = new Set<string>();
    for (const node of nodes) {
      if (!node.parentPath) continue;
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
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setIntent(null);
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className={styles.content} showCloseButton>
        <DialogTitle className={styles.title}>Current structure</DialogTitle>
        <DialogDescription className={styles.hint}>
          Add with +, edit or delete on a row. The other YOps stay on the row menu.
        </DialogDescription>
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
                key={node.path || node.key}
                node={node}
                pending={pending}
                selected={selectedPath === node.path}
                onAdd={() => setIntent({ kind: 'add', node })}
                onDelete={() => void publish([deleteDraftOp(node.path)])}
                onEdit={() => setIntent({ kind: 'edit', node })}
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
        ) : (
          <div className={styles.footer}>
            <span>
              {selectedPath
                ? visible.find((node) => node.path === selectedPath)?.key
                : 'Select a node to inspect'}
            </span>
            <button data-quiet="true" onClick={onClose} type="button">
              Close
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  selected: boolean;
}) {
  const ops = availableDraftOps(node);
  return (
    <div
      aria-expanded={node.expandable ? !collapsed : undefined}
      aria-selected={selected}
      className={styles.row}
      data-kind={node.kind}
      data-picking={intent?.kind === 'pick-destination' || undefined}
      data-selected={selected || undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      role="treeitem"
      style={{ paddingLeft: 8 + node.depth * 16 }}
      tabIndex={0}
    >
      <span className={styles.identity}>
        <span className={styles.dot} />
        <span className={styles.label}>{node.key || 'root'}</span>
      </span>
      <span className={styles.preview}>{node.kind === 'scalar' ? node.preview : ''}</span>
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
    </div>
  );
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
        try {
          submit();
        } catch (cause) {
          event.currentTarget.setAttribute(
            'data-error',
            cause instanceof Error ? cause.message : 'Invalid value'
          );
        }
      }}
    >
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
        <input
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
