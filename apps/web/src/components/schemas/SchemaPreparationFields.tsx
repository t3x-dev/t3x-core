'use client';

import type { SchemaContentMigrationCommand, TransitionProtocolValue } from '@t3x-dev/api-client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isSemanticEnvelope } from '@/domain/workspaces/draftStructure';

type ValueType = 'text' | 'number' | 'boolean' | 'null' | 'object' | 'array';
export interface PreparationValue {
  type: ValueType;
  text: string;
  children: Array<{ id: string; name: string; value: PreparationValue }>;
}
export interface PreparationChange {
  id: string;
  kind: SchemaContentMigrationCommand['kind'];
  path: string;
  destination: string;
  value: PreparationValue;
}
export const migrationLabels = {
  move: 'Move content',
  rename_node: 'Rename node',
  set: 'Set value',
  append: 'Append item',
  remove: 'Remove content',
};
const selectClass = 'h-9 w-full min-w-0 rounded-md border bg-[var(--surface-card)] px-2 text-sm';
const emptyValue = (type: ValueType = 'text'): PreparationValue => ({
  type,
  text: '',
  children: [],
});
export const newPreparationChange = (): PreparationChange => ({
  id: crypto.randomUUID(),
  kind: 'set',
  path: '',
  destination: '',
  value: emptyValue(),
});

export function preparationCommands(changes: PreparationChange[]): SchemaContentMigrationCommand[] {
  return changes.map((change, index) => {
    if (!change.path.trim()) throw new Error(`Change ${index + 1}: choose a content path.`);
    const path = change.path.trim();
    if (change.kind === 'move' || change.kind === 'rename_node') {
      if (!change.destination.trim()) throw new Error(`Change ${index + 1}: enter a destination.`);
      return change.kind === 'move'
        ? { kind: 'move', from: path, to: change.destination.trim() }
        : { kind: 'rename_node', path, toKey: change.destination.trim() };
    }
    if (change.kind === 'remove') return { kind: 'remove', path };
    return { kind: change.kind, path, value: readValue(change.value, `Change ${index + 1}`) };
  });
}
function readValue(value: PreparationValue, label: string): TransitionProtocolValue {
  switch (value.type) {
    case 'text':
      return value.text;
    case 'number': {
      const number = Number(value.text);
      if (!value.text.trim() || !Number.isFinite(number))
        throw new Error(`${label}: enter a valid number.`);
      return number;
    }
    case 'boolean':
      return value.text === 'true';
    case 'null':
      return null;
    case 'array':
      return value.children.map((child, i) => readValue(child.value, `${label}, item ${i + 1}`));
    case 'object': {
      const names = value.children.map((child) => child.name);
      if (names.some((name) => !name.trim()))
        throw new Error(`${label}: every field needs a name.`);
      if (new Set(names).size !== names.length)
        throw new Error(`${label}: field names must be unique.`);
      return Object.fromEntries(
        value.children.map((child) => [
          child.name,
          readValue(child.value, `${label}, ${child.name}`),
        ])
      );
    }
  }
}

export function PreparationChangeForm({
  change,
  index,
  pathsId,
  onChange,
  onRemove,
}: {
  change: PreparationChange;
  index: number;
  pathsId: string;
  onChange: (change: PreparationChange) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-lg border p-4"
      aria-label={`Change ${index + 1}`}
    >
      <legend className="px-1 text-xs font-semibold">Change {index + 1}</legend>
      <div className="flex items-end gap-3">
        <label className="min-w-0 flex-1 space-y-1 text-xs">
          Action
          <select
            aria-label={`Action for change ${index + 1}`}
            className={selectClass}
            value={change.kind}
            onChange={(event) =>
              onChange({ ...change, kind: event.target.value as PreparationChange['kind'] })
            }
          >
            {Object.entries(migrationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove change ${index + 1}`}
        >
          Remove
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-path`} className="min-w-0 space-y-1 text-xs">
          {change.kind === 'move' ? 'From path' : 'Content path'}
          <Input
            id={`${id}-path`}
            aria-label={`Content path for change ${index + 1}`}
            list={pathsId}
            value={change.path}
            placeholder="Choose an existing path or enter a new one"
            onChange={(event) => onChange({ ...change, path: event.target.value })}
          />
        </label>
        {change.kind === 'move' || change.kind === 'rename_node' ? (
          <label htmlFor={`${id}-destination`} className="min-w-0 space-y-1 text-xs">
            {change.kind === 'move' ? 'To path' : 'New node key'}
            <Input
              id={`${id}-destination`}
              aria-label={`Destination for change ${index + 1}`}
              value={change.destination}
              placeholder={
                change.kind === 'rename_node' ? 'e.g. features' : 'Destination content path'
              }
              onChange={(event) => onChange({ ...change, destination: event.target.value })}
            />
          </label>
        ) : null}
      </div>
      {change.kind === 'set' || change.kind === 'append' ? (
        <PreparationValueEditor
          label={`Value for change ${index + 1}`}
          value={change.value}
          onChange={(value) => onChange({ ...change, value })}
        />
      ) : change.kind === 'remove' ? (
        <p className="text-xs text-[var(--status-error)]">
          This content will be removed from the prepared Draft. Review the preview before saving.
        </p>
      ) : change.kind === 'rename_node' ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Use a lowercase node key. If relations reference this node, add explicit changes for their
          endpoints too.
        </p>
      ) : null}
    </fieldset>
  );
}

function PreparationValueEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PreparationValue;
  onChange: (value: PreparationValue) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2 rounded border bg-[var(--surface-panel)] p-3">
      <label className="flex items-center justify-between gap-3 text-xs" htmlFor={id}>
        Type of {label}
        <select
          id={id}
          aria-label={`Type of ${label}`}
          className={`${selectClass} max-w-40`}
          value={value.type}
          onChange={(event) => onChange(emptyValue(event.target.value as ValueType))}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="boolean">True / false</option>
          <option value="null">Empty value</option>
          <option value="object">Object / fields</option>
          <option value="array">List</option>
        </select>
      </label>
      {value.type === 'object' || value.type === 'array' ? (
        <div className="space-y-2">
          {value.children.map((child, index) => (
            <div key={child.id} className="space-y-2 border-l-2 pl-3">
              <div className="flex items-center gap-2">
                {value.type === 'object' ? (
                  <Input
                    aria-label={`Field name ${index + 1} of ${label}`}
                    value={child.name}
                    placeholder="Field name"
                    onChange={(event) =>
                      onChange({
                        ...value,
                        children: value.children.map((item) =>
                          item.id === child.id ? { ...item, name: event.target.value } : item
                        ),
                      })
                    }
                  />
                ) : (
                  <span className="text-xs">Item {index + 1}</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove item ${index + 1} of ${label}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      children: value.children.filter((item) => item.id !== child.id),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
              <PreparationValueEditor
                label={`${label}, item ${index + 1}`}
                value={child.value}
                onChange={(next) =>
                  onChange({
                    ...value,
                    children: value.children.map((item) =>
                      item.id === child.id ? { ...item, value: next } : item
                    ),
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                children: [
                  ...value.children,
                  { id: crypto.randomUUID(), name: '', value: emptyValue() },
                ],
              })
            }
          >
            {value.type === 'object' ? 'Add field' : 'Add list item'}
          </Button>
        </div>
      ) : value.type === 'null' ? (
        <p className="text-xs text-[var(--text-secondary)]">
          An explicit empty value will be saved. This does not remove the field.
        </p>
      ) : value.type === 'boolean' ? (
        <select
          className={selectClass}
          aria-label={label}
          value={value.text || 'false'}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        >
          <option value="false">False</option>
          <option value="true">True</option>
        </select>
      ) : value.type === 'number' ? (
        <Input
          aria-label={label}
          type="number"
          step="any"
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
      ) : (
        <Textarea
          aria-label={label}
          rows={2}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
      )}
    </div>
  );
}

/** Content and operation parameters are shown as fields, never serialized source. */
export function PreparationValueTree({
  value,
  label = 'Content',
  depth = 0,
}: {
  value: unknown;
  label?: string;
  depth?: number;
}) {
  if (isSemanticEnvelope(value))
    return (
      <div className="space-y-2">
        <PreparationValueTree value={value.content.trees} label="Content nodes" depth={depth} />
        <PreparationValueTree value={value.content.relations} label="Relations" depth={depth} />
        <details className="text-xs">
          <summary className="cursor-pointer py-1">Document details</summary>
          {Object.entries(value)
            .filter(([key]) => key !== 'content')
            .map(([key, item]) => (
              <PreparationValueTree key={key} label={key} value={item} depth={depth + 1} />
            ))}
        </details>
      </div>
    );
  if (value === null || value === undefined || typeof value !== 'object')
    return (
      <div className="grid min-w-0 grid-cols-[minmax(5rem,1fr)_minmax(0,3fr)] gap-3 border-b border-[var(--stroke-divider)] py-2 text-xs last:border-0">
        <span className="break-words font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="whitespace-pre-wrap break-words">
          {value == null ? 'Empty value' : value === '' ? 'Empty text' : String(value)}
        </span>
      </div>
    );
  const record = value as Record<string, unknown>;
  const isNode =
    !Array.isArray(value) &&
    typeof record.key === 'string' &&
    record.slots &&
    typeof record.slots === 'object' &&
    !Array.isArray(record.slots);
  if (isNode) {
    const slots = Object.entries(record.slots as Record<string, unknown>);
    const nodes = Array.isArray(record.children) ? record.children : [];
    return (
      <details
        open={depth < 2}
        aria-label={`Node ${record.key}`}
        className="min-w-0 rounded border border-[var(--stroke-divider)] px-3 text-xs"
      >
        <summary className="cursor-pointer break-words py-2 font-medium">
          Node {String(record.key)}
          <span className="ml-2 font-normal text-[var(--text-tertiary)]">
            {slots.length} {slots.length === 1 ? 'Slot' : 'Slots'} · {nodes.length}{' '}
            {nodes.length === 1 ? 'Node' : 'Nodes'}
          </span>
        </summary>
        <div className="space-y-1 pb-2">
          {slots.map(([name, item]) => (
            <PreparationValueTree
              key={`slot:${name}`}
              label={`Slot ${name}`}
              value={item}
              depth={depth + 1}
            />
          ))}
          {nodes.map((node, index) => (
            <PreparationValueTree
              key={
                node && typeof node === 'object' && 'key' in node
                  ? String(node.key)
                  : `value:${String(node)}`
              }
              label={`Node ${index + 1}`}
              value={node}
              depth={depth + 1}
            />
          ))}
          {!slots.length && !nodes.length ? (
            <p className="py-2 text-[var(--text-secondary)]">No Slots or Nodes</p>
          ) : null}
        </div>
      </details>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(record);
  return (
    <details
      open={depth < 2}
      className="min-w-0 rounded border border-[var(--stroke-divider)] px-3 text-xs"
    >
      <summary className="cursor-pointer break-words py-2 font-medium">
        {label}
        <span className="ml-2 font-normal text-[var(--text-tertiary)]">
          {entries.length} {Array.isArray(value) ? 'items' : 'fields'}
        </span>
      </summary>
      <div className="space-y-1 pb-2">
        {entries.length ? (
          entries.map(([key, item]) => (
            <PreparationValueTree
              key={key}
              label={Array.isArray(value) ? `Item ${Number(key) + 1}` : key}
              value={item}
              depth={depth + 1}
            />
          ))
        ) : (
          <p className="py-2 text-[var(--text-secondary)]">
            {Array.isArray(value) ? 'No items' : 'No fields'}
          </p>
        )}
      </div>
    </details>
  );
}

export function readablePreparationPath(path: string) {
  return path
    .replace(/^content\/trees\//, '')
    .replace(/\/children\//g, '/')
    .replace(/\/slots\//g, '/')
    .replace(/\[key=([^\]]+)\]/g, '$1')
    .replace(/^nodes\./, '')
    .replace(/\//g, ' › ');
}
