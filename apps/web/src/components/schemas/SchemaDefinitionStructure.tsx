'use client';

import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Definition = Record<string, unknown>;
type Field = {
  key: string;
  kind?: 'text' | 'number' | 'json' | 'array' | 'boolean';
  options?: string[];
};
const contentKind: Field = { key: 'contentKind', options: ['prose', 'structured'] };
const descriptions: Field[] = [
  { key: 'description', kind: 'text' },
  { key: 'contentGuidance', kind: 'text' },
];
const slotFields: Field[] = [
  ...descriptions,
  contentKind,
  { key: 'provenanceRequired', kind: 'boolean' },
  { key: 'enum', kind: 'array' },
  { key: 'const', kind: 'json' },
  { key: 'default', kind: 'json' },
  { key: 'examples', kind: 'array' },
  ...['minimum', 'maximum', 'minLength', 'maxLength', 'maxWords'].map(
    (key): Field => ({ key, kind: 'number' })
  ),
  { key: 'pattern' },
  { key: 'format' },
  { key: 'gapQuestion', kind: 'text' },
];
const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs';
const panelClass =
  'space-y-3 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-xs)]';
const disclosureClass =
  'cursor-pointer select-none rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]';
const reportErrorContext = createContext<(id: string, error?: string) => void>(() => {});

function record(value: unknown): Definition {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Definition) : {};
}

function withField(value: Definition, key: string, next: unknown): Definition {
  const result = { ...value };
  if (next === undefined) delete result[key];
  else result[key] = next;
  return result;
}

function freshKey(value: Definition, prefix: string) {
  let key = prefix;
  for (let i = 2; Object.hasOwn(value, key); i++) key = `${prefix}_${i}`;
  return key;
}

function rename(value: Definition, oldKey: string, key: string, next: unknown) {
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [
      name === oldKey ? key : name,
      name === oldKey ? next : item,
    ])
  );
}

export function SchemaDefinitionStructure({
  value,
  onChange,
  onValidationChange,
}: {
  value: Definition;
  onChange: (value: Definition) => void;
  onValidationChange: (error?: string) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reportError = useCallback((id: string, error?: string) => {
    setErrors((current) =>
      current[id] === error ? current : (withField(current, id, error) as Record<string, string>)
    );
  }, []);
  useEffect(() => {
    onValidationChange(Object.values(errors)[0]);
  }, [errors, onValidationChange]);
  useEffect(() => () => onValidationChange(undefined), [onValidationChange]);
  const relations = record(value.relationTypes);
  // YAML drafts can still contain invalid rule entries while the server preview
  // reports their errors. Keep Structure usable without rewriting those drafts.
  const rules = Array.isArray(value.rules) ? value.rules.map(record) : [];
  return (
    <reportErrorContext.Provider value={reportError}>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {value.yschema !== undefined ? (
          <details className={panelClass}>
            <summary className={disclosureClass}>Schema metadata (read-only)</summary>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Root metadata and constraints belong to the immutable Base.
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
              {['yschema', 'name', 'version', 'description', 'strict'].map((key) => (
                <div className="contents" key={key}>
                  <dt className="font-mono">{key}</dt>
                  <dd className="break-words">{String(value[key] ?? 'Not set')}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
        <NodesEditor
          nodes={record(value.nodes)}
          onChange={(nodes) => onChange({ ...value, nodes })}
        />
        <section aria-label="Relation types" className="space-y-3">
          <SectionHeader
            title="Relation types"
            action="Add relation type"
            onAdd={() => {
              const name = freshKey(relations, 'new_relation');
              const endpoint = Object.keys(record(value.nodes))[0] ?? '';
              onChange({
                ...value,
                relationTypes: { ...relations, [name]: { from: endpoint, to: endpoint } },
              });
            }}
          />
          {Object.entries(relations).map(([name, relation]) => (
            <article aria-label={`Relation ${name}`} className={panelClass} key={name}>
              <div className="flex items-start gap-2">
                <NameField
                  label={`Relation type name ${name}`}
                  name={name}
                  names={Object.keys(relations)}
                  onChange={(next) =>
                    onChange({ ...value, relationTypes: rename(relations, name, next, relation) })
                  }
                />
                <RemoveButton
                  label={`Remove relation type ${name}`}
                  onClick={() =>
                    onChange({ ...value, relationTypes: withField(relations, name, undefined) })
                  }
                />
              </div>
              <Fields
                context={`relation ${name}`}
                value={record(relation)}
                fields={[
                  { key: 'from' },
                  { key: 'to' },
                  ...descriptions,
                  { key: 'acyclic', kind: 'boolean' },
                ]}
                onChange={(next) =>
                  onChange({ ...value, relationTypes: { ...relations, [name]: next } })
                }
              />
            </article>
          ))}
        </section>
        <section aria-label="Schema rules" className="space-y-3">
          <SectionHeader
            title="Rules"
            action="Add rule"
            onAdd={() => {
              const ids = Object.fromEntries(rules.map((rule) => [String(rule.id), true]));
              onChange({ ...value, rules: [...rules, { id: freshKey(ids, 'new_rule') }] });
            }}
          />
          {rules.map((rule, index) => (
            <RuleEditor
              key={String(rule.id)}
              rule={rule}
              rules={rules}
              relations={relations}
              onChange={(next) =>
                onChange({ ...value, rules: rules.map((item, i) => (i === index ? next : item)) })
              }
              onRemove={() => onChange({ ...value, rules: rules.filter((_, i) => i !== index) })}
            />
          ))}
        </section>
      </div>
    </reportErrorContext.Provider>
  );
}

/** Same property controls and input validation in Studio and the Assistant confirmation card. */
export function SchemaChangeSettingsEditor({
  value,
  referenceRelations = {},
  onChange,
  onValidationChange,
  onCancel,
}: {
  value: import('@t3x-dev/api-client').AssistantSchemaSettingsInput;
  referenceRelations?: Definition;
  onChange: (value: import('@t3x-dev/api-client').AssistantSchemaSettingsInput) => void;
  onValidationChange: (error?: string) => void;
  onCancel: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reportError = useCallback((id: string, error?: string) => {
    setErrors((current) =>
      current[id] === error ? current : (withField(current, id, error) as Record<string, string>)
    );
  }, []);
  useEffect(() => {
    onValidationChange(Object.values(errors)[0]);
  }, [errors, onValidationChange]);
  const path = [value.nodePath, value.name].filter(Boolean).join('/');
  const changeDefinition = (name: string, definition: Definition) => {
    const removed = [
      ...new Set([
        ...(value.unsetAttributes ?? []),
        ...Object.keys(value.definition).filter((key) => !Object.hasOwn(definition, key)),
      ]),
    ].filter((key) => !Object.hasOwn(definition, key));
    onChange({
      ...value,
      name: value.action.startsWith('add_') ? name : value.name,
      definition,
      ...(value.action.endsWith('_node') ? { required: undefined } : {}),
      ...(removed.length ? { unsetAttributes: removed } : { unsetAttributes: undefined }),
    });
  };
  if (value.action.endsWith('_relation') || value.action.endsWith('_rule')) {
    const relation = value.action.endsWith('_relation');
    return (
      <reportErrorContext.Provider value={reportError}>
        {relation ? (
          <Fields
            context={`relation ${value.name}`}
            value={value.definition}
            fields={[
              { key: 'from' },
              { key: 'to' },
              ...descriptions,
              { key: 'acyclic', kind: 'boolean' },
            ]}
            onChange={(definition) => changeDefinition(value.name, definition)}
          />
        ) : (
          <RuleEditor
            rule={{ ...value.definition, id: value.name }}
            rules={[{ id: value.name }]}
            lockName
            relations={referenceRelations}
            onChange={(definition) =>
              changeDefinition(value.name, { ...definition, id: value.name })
            }
            onRemove={onCancel}
          />
        )}
      </reportErrorContext.Provider>
    );
  }
  return (
    <reportErrorContext.Provider value={reportError}>
      {value.action.endsWith('_slot') ? (
        <SlotEditor
          name={value.name}
          path={path}
          slot={value.definition}
          names={[value.name]}
          required={value.required ?? false}
          lockName={!value.action.startsWith('add_')}
          initiallyExpanded
          onRequired={(required) => onChange({ ...value, required })}
          onChange={changeDefinition}
          onRemove={onCancel}
        />
      ) : (
        <NodeEditor
          name={value.name}
          attributesOnly={value.action === 'add_node'}
          path={path}
          node={{
            ...value.definition,
            ...(value.required !== undefined ? { required: value.required } : {}),
          }}
          lockName={!value.action.startsWith('add_')}
          names={[value.name]}
          onChange={changeDefinition}
          onRemove={onCancel}
        />
      )}
    </reportErrorContext.Provider>
  );
}

function SectionHeader({
  title,
  action,
  onAdd,
}: {
  title: string;
  action: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {title}
      </h3>
      <Button onClick={onAdd} size="sm" type="button" variant="canvas-outline">
        <Plus className="size-3.5" />
        {action}
      </Button>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon-sm" type="button" variant="ghost">
      <Trash2 className="size-3.5" />
    </Button>
  );
}

function SettingsToggle({
  expanded,
  label,
  controls,
  onToggle,
}: {
  expanded: boolean;
  label: string;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={`${expanded ? 'Collapse' : 'Expand'} settings for ${label}`}
      aria-expanded={expanded}
      aria-controls={controls}
      className="inline-flex size-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
      onClick={onToggle}
      type="button"
    >
      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  );
}

function NodesEditor({
  nodes,
  path = '',
  onChange,
}: {
  nodes: Definition;
  path?: string;
  onChange: (nodes: Definition) => void;
}) {
  return (
    <section aria-label={path ? `Children of ${path}` : 'Schema nodes'} className="space-y-3">
      <SectionHeader
        title={path ? 'Child nodes' : 'Schema nodes'}
        action={path ? 'Add child node' : 'Add node'}
        onAdd={() => onChange({ ...nodes, [freshKey(nodes, 'new_node')]: { slots: {} } })}
      />
      {!path ? (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          Edit nodes, Slots, relationships and rules above the immutable Base. Renames may require
          updating relation endpoints.
        </p>
      ) : null}
      {Object.entries(nodes).map(([name, node]) => (
        <NodeEditor
          key={name}
          name={name}
          path={path ? `${path}/${name}` : name}
          node={record(node)}
          names={Object.keys(nodes)}
          onChange={(nextName, next) => onChange(rename(nodes, name, nextName, next))}
          onRemove={() => onChange(withField(nodes, name, undefined))}
        />
      ))}
      {!Object.keys(nodes).length ? (
        <p className="rounded-lg border border-dashed border-[var(--stroke-strong)] p-6 text-center text-xs text-[var(--text-tertiary)]">
          No {path ? 'child' : 'local'} nodes yet.
        </p>
      ) : null}
    </section>
  );
}

function NodeEditor({
  name,
  path,
  node,
  names,
  lockName = false,
  attributesOnly = false,
  onChange,
  onRemove,
}: {
  name: string;
  path: string;
  node: Definition;
  names: string[];
  lockName?: boolean;
  attributesOnly?: boolean;
  onChange: (name: string, node: Definition) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const settingsId = useId();
  const slots = record(node.slots);
  const required = Array.isArray(node.requiredSlots) ? (node.requiredSlots as string[]) : [];
  const updateSlot = (oldName: string, nextName: string, slot: Definition | undefined) => {
    const nextRequired = required
      .filter((key) => slot !== undefined || key !== oldName)
      .map((key) => (key === oldName ? nextName : key));
    onChange(name, {
      ...withField(node, 'requiredSlots', nextRequired.length ? nextRequired : undefined),
      slots:
        slot === undefined
          ? withField(slots, oldName, undefined)
          : rename(slots, oldName, nextName, slot),
    });
  };
  return (
    <article
      aria-label={`Node ${path}`}
      className="overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]"
    >
      <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(80px,110px)_32px] items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-3 py-2">
        <SettingsToggle
          expanded={expanded}
          label={`node ${path}`}
          controls={settingsId}
          onToggle={() => setExpanded(!expanded)}
        />
        <NameField
          label={`Node name ${path}`}
          readOnly={lockName}
          name={name}
          names={names}
          onChange={(next) => onChange(next, node)}
        />
        <span className="justify-self-start rounded-full bg-[var(--accent-commit-soft)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--accent-commit)]">
          node
        </span>
        <RemoveButton label={`Remove node ${path}`} onClick={onRemove} />
      </div>
      <div id={settingsId} hidden={!expanded} className="space-y-3 p-3">
        <details className="space-y-3 rounded-lg border border-dashed border-[var(--stroke-default)] px-3 py-2 open:border-solid open:bg-[var(--surface-panel)]">
          <summary className={disclosureClass}>Node settings</summary>
          <div className="flex flex-wrap gap-4">
            {['required', 'repeated'].map((key) => (
              <label className="flex h-9 items-center gap-1 text-[11px]" key={key}>
                <input
                  aria-label={`${key} for node ${path}`}
                  type="checkbox"
                  checked={node[key] === true}
                  onChange={(event) => onChange(name, { ...node, [key]: event.target.checked })}
                />
                {key}
              </label>
            ))}
          </div>
          <Fields
            context={`node ${path}`}
            value={node}
            fields={[...descriptions, contentKind]}
            onChange={(next) => onChange(name, next)}
          />
          <fieldset hidden={attributesOnly} disabled={attributesOnly} className="space-y-3">
            <label className="block space-y-1 text-xs">
              Children mode
              <select
                aria-label={`Children mode ${path}`}
                className={inputClass}
                value={
                  node.children === 'any' ? 'any' : node.children !== undefined ? 'defined' : ''
                }
                onChange={(event) =>
                  onChange(
                    name,
                    withField(
                      node,
                      'children',
                      event.target.value === 'any'
                        ? 'any'
                        : event.target.value === 'defined'
                          ? {}
                          : undefined
                    )
                  )
                }
              >
                <option value="">Not specified</option>
                <option value="defined">Defined child nodes</option>
                <option value="any">Any children</option>
              </select>
            </label>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Changing children mode replaces its current definition. A repeated node cannot also
              define children.
            </p>
            {node.children !== undefined && node.children !== 'any' ? (
              <div className="border-l border-[var(--stroke-divider)] pl-3">
                <NodesEditor
                  nodes={record(node.children)}
                  path={path}
                  onChange={(children) => onChange(name, { ...node, children })}
                />
              </div>
            ) : null}
          </fieldset>
        </details>
        <div className="space-y-2" hidden={attributesOnly}>
          {Object.entries(slots).map(([slotName, value]) => (
            <SlotEditor
              key={slotName}
              name={slotName}
              path={`${path}/${slotName}`}
              slot={record(value)}
              names={Object.keys(slots)}
              required={required.includes(slotName)}
              onRequired={(checked) => {
                const next = new Set(required);
                if (checked) next.add(slotName);
                else next.delete(slotName);
                onChange(
                  name,
                  withField(node, 'requiredSlots', next.size ? [...next].sort() : undefined)
                );
              }}
              onChange={(nextName, slot) => updateSlot(slotName, nextName, slot)}
              onRemove={() => updateSlot(slotName, slotName, undefined)}
            />
          ))}
          <Button
            onClick={() =>
              onChange(name, {
                ...node,
                slots: { ...slots, [freshKey(slots, 'new_slot')]: { type: 'string' } },
              })
            }
            className="w-full justify-center border border-dashed border-[var(--stroke-default)] text-[var(--text-secondary)] hover:border-[var(--accent-commit)] hover:text-[var(--accent-commit)]"
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            Add Slot
          </Button>
        </div>
      </div>
    </article>
  );
}

function SlotEditor({
  name,
  path,
  slot,
  names,
  required,
  onRequired,
  onChange,
  onRemove,
  initiallyExpanded = false,
  lockName = false,
}: {
  name: string;
  path: string;
  slot: Definition;
  names: string[];
  required: boolean;
  onRequired: (required: boolean) => void;
  onChange: (name: string, slot: Definition) => void;
  onRemove: () => void;
  initiallyExpanded?: boolean;
  lockName?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const settingsId = useId();
  return (
    <section
      aria-label={`Slot ${path}`}
      className={`rounded-lg border p-2 transition-colors ${expanded ? 'border-[var(--stroke-default)] bg-[var(--surface-panel)]' : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)]'}`}
    >
      <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(80px,110px)_32px] items-center gap-2">
        <SettingsToggle
          expanded={expanded}
          label={`slot ${path}`}
          controls={settingsId}
          onToggle={() => setExpanded(!expanded)}
        />
        <NameField
          label={`Slot name ${name}`}
          readOnly={lockName}
          name={name}
          names={names}
          onChange={(next) => onChange(next, slot)}
        />
        <select
          aria-label={`Slot type ${name}`}
          className={inputClass}
          value={typeof slot.type === 'string' ? slot.type : ''}
          onChange={(event) =>
            onChange(name, withField(slot, 'type', event.target.value || undefined))
          }
        >
          <option value="">Any type</option>
          {['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'].map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <RemoveButton label={`Remove slot ${name}`} onClick={onRemove} />
      </div>
      <div
        id={settingsId}
        hidden={!expanded}
        className="mt-2 space-y-3 border-t border-[var(--stroke-divider)] px-1 pt-3"
      >
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Slot settings
        </h4>
        <label className="flex h-9 items-center gap-1 text-[11px]">
          <input
            aria-label={`required for slot ${path}`}
            type="checkbox"
            checked={required}
            onChange={(event) => onRequired(event.target.checked)}
          />
          required
        </label>
        <Fields
          context={`slot ${path}`}
          value={slot}
          fields={slotFields}
          onChange={(next) => onChange(name, next)}
        />
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">YOps hint</legend>
          <Fields
            context={`YOps hint ${path}`}
            value={record(slot.yopsHint)}
            fields={[
              { key: 'preferredOp', options: ['define', 'set', 'populate', 'append'] },
              { key: 'path' },
              { key: 'slot' },
            ]}
            onChange={(hint) =>
              onChange(
                name,
                withField(slot, 'yopsHint', Object.keys(hint).length ? hint : undefined)
              )
            }
          />
        </fieldset>
      </div>
    </section>
  );
}

function RuleEditor({
  rule,
  rules,
  relations,
  lockName = false,
  onChange,
  onRemove,
}: {
  rule: Definition;
  rules: Definition[];
  relations: Definition;
  lockName?: boolean;
  onChange: (rule: Definition) => void;
  onRemove: () => void;
}) {
  const id = String(rule.id ?? '');
  return (
    <article aria-label={`Rule ${id}`} className={panelClass}>
      <div className="flex items-start gap-2">
        <NameField
          label={`Rule id ${id}`}
          readOnly={lockName}
          name={id}
          names={rules.filter((item) => item !== rule).map((item) => String(item.id))}
          keyPattern={false}
          onChange={(next) => onChange({ ...rule, id: next })}
        />
        <RemoveButton label={`Remove rule ${id}`} onClick={onRemove} />
      </div>
      <label className="block space-y-1 text-xs">
        kind
        <select
          aria-label={`kind for rule ${id}`}
          className={inputClass}
          value={rule.kind === 'required_relation' ? 'required_relation' : ''}
          onChange={(event) => {
            if (event.target.value) {
              const relationType = Object.keys(relations)[0] ?? '';
              const endpoints = record(relations[relationType]);
              onChange({
                ...rule,
                kind: 'required_relation',
                relationType,
                from: endpoints.from ?? '',
                to: endpoints.to ?? '',
              });
            } else {
              const {
                kind: _kind,
                relationType: _relationType,
                from: _from,
                to: _to,
                ...reserved
              } = rule;
              onChange(reserved);
            }
          }}
        >
          <option value="">Reserved rule (description only)</option>
          <option value="required_relation">required_relation</option>
        </select>
      </label>
      <Fields
        context={`rule ${id}`}
        value={rule}
        fields={
          rule.kind === 'required_relation'
            ? [
                { key: 'relationType', options: Object.keys(relations) },
                { key: 'from' },
                { key: 'to' },
                { key: 'description', kind: 'text' },
              ]
            : [{ key: 'description', kind: 'text' }]
        }
        onChange={onChange}
      />
    </article>
  );
}

function Fields({
  context,
  value,
  fields,
  onChange,
}: {
  context: string;
  value: Definition;
  fields: Field[];
  onChange: (value: Definition) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <DefinitionField
          key={field.key}
          context={context}
          field={field}
          value={value[field.key]}
          onChange={(next) => onChange(withField(value, field.key, next))}
        />
      ))}
    </div>
  );
}

function DefinitionField({
  context,
  field,
  value,
  onChange,
}: {
  context: string;
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = `${field.key} for ${context}`;
  const id = useId();
  const reportError = useContext(reportErrorContext);
  const serialized =
    field.kind === 'json' || field.kind === 'array'
      ? value === undefined
        ? ''
        : JSON.stringify(value, null, 2)
      : String(value ?? '');
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setDraft(serialized);
    setError(undefined);
    reportError(id);
  }, [serialized, id, reportError]);
  useEffect(() => () => reportError(id), [id, reportError]);
  const edit = (text: string) => {
    setDraft(text);
    try {
      let next: unknown = text || undefined;
      if (text.trim() && field.kind === 'number') {
        next = Number(text);
        if (!Number.isFinite(next)) throw Error('Enter a finite number.');
        if (
          ['minLength', 'maxLength', 'maxWords'].includes(field.key) &&
          (!Number.isInteger(next) || Number(next) < (field.key === 'maxWords' ? 1 : 0))
        )
          throw Error(
            field.key === 'maxWords' ? 'Enter a positive integer.' : 'Enter a non-negative integer.'
          );
      } else if (field.kind === 'number') next = undefined;
      if (field.kind === 'json' || field.kind === 'array') {
        next = text.trim() ? JSON.parse(text) : undefined;
        if (next !== undefined && field.kind === 'array' && !Array.isArray(next))
          throw Error('Enter a JSON array.');
        if (field.key === 'enum' && Array.isArray(next) && next.length === 0)
          throw Error('Enum must contain at least one value.');
        if (next !== undefined && !finiteJson(next)) throw Error('JSON numbers must be finite.');
      }
      setError(undefined);
      reportError(id);
      onChange(next);
    } catch (cause) {
      const message = `${label}: ${cause instanceof Error ? cause.message : 'Invalid value.'}`;
      setError(message);
      reportError(id, message);
    }
  };
  const multiline = ['text', 'json', 'array'].includes(field.kind ?? '');
  return (
    <div className={`min-w-0 space-y-1 ${multiline ? 'sm:col-span-2' : ''}`}>
      <label className="block text-[11px] font-medium text-[var(--text-secondary)]" htmlFor={id}>
        {field.key}
        {field.kind === 'json' || field.kind === 'array' ? ' (JSON)' : ''}
      </label>
      {field.options || field.kind === 'boolean' ? (
        <select
          id={id}
          aria-label={label}
          className={inputClass}
          value={value === undefined ? '' : String(value)}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? undefined
                : field.kind === 'boolean'
                  ? event.target.value === 'true'
                  : event.target.value
            )
          }
        >
          <option value="">Not specified</option>
          {(field.options ?? ['true', 'false']).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <Textarea
          id={id}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-16 text-xs md:text-xs"
          onChange={(event) => edit(event.target.value)}
          rows={2}
          value={draft}
        />
      ) : (
        <Input
          id={id}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="text-xs"
          inputMode={field.kind === 'number' ? 'decimal' : undefined}
          onChange={(event) => edit(event.target.value)}
          value={draft}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="text-[11px] text-[var(--destructive)]" role="alert">
          {error}
        </p>
      ) : null}
      {field.kind === 'json' || field.kind === 'array' ? (
        <p className="text-[10px] text-[var(--text-tertiary)]">
          Blank removes this setting. Use JSON quotes for strings. null, false and 0 are explicit
          values.
        </p>
      ) : null}
    </div>
  );
}

function finiteJson(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value && typeof value === 'object') return Object.values(value).every(finiteJson);
  return true;
}

function NameField({
  label,
  name,
  names,
  keyPattern = true,
  readOnly = false,
  onChange,
}: {
  label: string;
  name: string;
  names: string[];
  keyPattern?: boolean;
  readOnly?: boolean;
  onChange: (name: string) => void;
}) {
  const id = useId();
  const reportError = useContext(reportErrorContext);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setDraft(name);
  }, [name]);
  useEffect(() => () => reportError(id), [id, reportError]);
  const validate = (text: string) =>
    !text.trim()
      ? 'Name is required.'
      : keyPattern && !/^[a-z][a-z0-9_]*$/.test(text)
        ? 'Use a lowercase letter followed by lowercase letters, numbers or underscores.'
        : text !== name && names.includes(text)
          ? 'This name is already in use.'
          : undefined;
  return (
    <div className="min-w-0 flex-1">
      <Input
        aria-label={label}
        disabled={readOnly}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="font-mono text-xs"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const message = validate(event.target.value);
          setError(message);
          reportError(id, message);
        }}
        onBlur={() => {
          const message = validate(draft);
          setError(message);
          reportError(id, message);
          if (!message && draft !== name) onChange(draft);
        }}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-[var(--destructive)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
