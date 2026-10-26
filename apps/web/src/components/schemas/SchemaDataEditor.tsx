'use client';

import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { Box, FileText, Plus, Trash2 } from 'lucide-react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { StructureTreeRow, visibleTreeRows } from '@/components/structure/StructureTree';
import tree from '@/components/structure/StructureTree.module.css';
import { Button } from '@/components/ui/button';
import {
  addSchemaField,
  addSchemaRelation,
  changeSchemaField,
  moveSchemaField,
  type SchemaDefinition,
  type SchemaFieldRow,
  schemaFieldRows,
} from '@/domain/schemas/schemaFieldEditing';
import { type SchemaSourcePin, schemaNodeProvenance } from '@/domain/schemas/schemaProvenance';
import type { SchemaSourceIdentity } from '@/hooks/schemas/useSchemaSourceIdentities';
import styles from './SchemaDataEditor.module.css';
import {
  SchemaDefinitionStructure,
  SchemaFieldName,
  SchemaFieldProperties,
  SchemaFieldValidation,
} from './SchemaDefinitionStructure';
import { SchemaSourceBadge } from './SchemaSourceBadge';
import { SchemaVisualEditor } from './SchemaVisualEditor';
import { type SchemaEditorNavigation, useSchemaNavigationGuard } from './useSchemaNavigationGuard';

export function SchemaDataEditor({
  navigationRef,
  view = 'data',
  layoutKey = 'schema',
  sources,
  provenance,
  sourceIdentities = {},
  wholeSchemaSource,
  onComposeSources,
  onValidationChange,
  initialDefinition,
  revisionKey,
  pending = false,
  previewError,
  onPreview,
  onSave,
  onDirtyChange,
  onDiscard,
  disabledReason,
}: {
  navigationRef?: RefObject<SchemaEditorNavigation | null>;
  onValidationChange?: (invalid: boolean) => void;
  view?: 'data' | 'visual';
  layoutKey?: string;
  sources?: StudioCandidate[];
  provenance?: Pick<StudioPreview, 'schema' | 'origins' | 'sources' | 'nodeProvenance'>;
  sourceIdentities?: Record<string, SchemaSourceIdentity>;
  wholeSchemaSource?: SchemaSourcePin;
  onComposeSources?: (sourceId?: string) => void;
  initialDefinition?: SchemaDefinition;
  revisionKey: string;
  pending?: boolean;
  previewError?: string;
  disabledReason?: string;
  onPreview: (definition: SchemaDefinition) => void;
  onSave: (definition: SchemaDefinition, intent: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onDiscard: () => void;
}) {
  const [definition, setDefinition] = useState<SchemaDefinition>();
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'properties' | 'rules'>('properties');
  const [fieldError, setFieldError] = useState<string>();
  const [rulesError, setRulesError] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [intent, setIntent] = useState('Edit Schema fields.');
  const [saving, setSaving] = useState(false);
  const loaded = useRef<string | undefined>(undefined);
  const validationError = fieldError || rulesError;
  const busy = pending || saving;
  const stale = dirty && loaded.current !== revisionKey;

  useEffect(() => {
    if (!initialDefinition || dirty || loaded.current === revisionKey) return;
    loaded.current = revisionKey;
    setDefinition(structuredClone(initialDefinition));
  }, [initialDefinition, revisionKey, dirty]);
  useEffect(() => {
    onValidationChange?.(!!validationError);
  }, [validationError, onValidationChange]);
  useEffect(() => {
    onDirtyChange(dirty || Boolean(validationError));
  }, [dirty, validationError, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !validationError) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, validationError]);

  const rows = useMemo(() => (definition ? schemaFieldRows(definition) : []), [definition]);
  const sourceRows = useMemo(
    () =>
      new Map((provenance ? schemaFieldRows(provenance.schema) : []).map((row) => [row.path, row])),
    [provenance?.schema]
  );
  const renderSource = (row: SchemaFieldRow) => (
    <SchemaSourceBadge
      path={row.semanticPath}
      identities={sourceIdentities}
      provenance={schemaNodeProvenance(
        row,
        sourceRows.get(row.path),
        provenance?.origins,
        provenance?.sources ?? [],
        wholeSchemaSource,
        provenance?.nodeProvenance
      )}
    />
  );
  const visible = useMemo(() => {
    if (!query.trim()) return visibleTreeRows(rows, collapsed);
    const matches = new Set(
      rows
        .filter((row) =>
          `${row.semanticPath} ${row.definition.description ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .map((row) => row.path)
    );
    for (const row of [...rows].reverse())
      if (matches.has(row.path) && row.parentPath) matches.add(row.parentPath);
    return rows.filter((row) => matches.has(row.path));
  }, [rows, collapsed, query]);
  const active = rows.find((row) => row.path === selected);

  function move(path: string, target: SchemaFieldRow) {
    const row = rows.find((item) => item.path === path);
    if (!definition || !row) return;
    try {
      change(moveSchemaField(definition, row, target));
      setSelected(JSON.stringify([...target.location, 'slots', row.name]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move this field.');
    }
  }
  function relate(from: string, to: string) {
    const source = rows.find((item) => item.path === from),
      target = rows.find((item) => item.path === to);
    if (!definition || !source || !target) return;
    try {
      change(addSchemaRelation(definition, source, target));
      setPanel('rules');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this relation.');
    }
  }

  function select(row: SchemaFieldRow) {
    if (validationError) return;
    setSelected(row.path);
    setPanel('properties');
  }

  function change(next: SchemaDefinition) {
    setDefinition(next);
    setDirty(true);
    setError(undefined);
    setNotice('');
    onPreview(next);
  }
  function update(
    row: SchemaFieldRow,
    name: string,
    value: SchemaDefinition | undefined,
    required = row.required
  ) {
    if (!definition) return false;
    try {
      change(changeSchemaField(definition, row, name, value, required));
      if (value === undefined) setSelected(undefined);
      else if (selected === row.path)
        setSelected(JSON.stringify([...row.location.slice(0, -1), name]));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this field.');
      return false;
    }
  }
  function add(parent: SchemaFieldRow | null, kind: 'node' | 'slot') {
    if (!definition) return;
    try {
      const result = addSchemaField(definition, parent, kind);
      change(result.definition);
      setSelected(result.path);
      setQuery('');
      setPanel('properties');
      if (parent) setCollapsed((current) => ({ ...current, [parent.path]: false }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add a field.');
    }
  }
  async function save() {
    if (!definition || busy || validationError || stale || disabledReason) return false;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(definition, intent.trim() || 'Edit Schema fields.');
      setDirty(false);
      setNotice('Schema candidate saved.');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the Schema candidate.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!initialDefinition) return;
    setDirty(false);
    setFieldError(undefined);
    setRulesError(undefined);
    setError(undefined);
    setSelected(undefined);
    loaded.current = undefined;
    setDefinition(undefined);
    setResetKey((value) => value + 1);
    onDiscard();
  }
  const navigation = useSchemaNavigationGuard({
    dirty: dirty || Boolean(validationError),
    canSave: !busy && dirty && !validationError && !stale && !disabledReason,
    save,
    discard,
  });
  useEffect(() => {
    if (!navigationRef) return;
    navigationRef.current = { requestNavigation: navigation.requestNavigation };
    return () => {
      navigationRef.current = null;
    };
  }, [navigationRef, navigation.requestNavigation]);

  if (!definition)
    return (
      <output className={styles.feedback}>{disabledReason ?? 'Loading Schema definition…'}</output>
    );
  return (
    <section aria-label="Schema data editor" className={styles.editor} data-schema-editor>
      <header className={styles.toolbar}>
        {view === 'data' ? (
          <input
            aria-label="Find a Schema field"
            placeholder="Find a field…"
            value={query}
            disabled={Boolean(validationError)}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
        <span>{rows.length} fields</span>
        <output>{dirty ? 'Unsaved changes' : 'Saved definition'}</output>
        <Button
          variant="canvas-outline"
          size="sm"
          disabled={busy || !!disabledReason || !!validationError}
          onClick={() => add(null, 'node')}
        >
          <Plus size={14} />
          Add node
        </Button>
      </header>
      {error || validationError || previewError || stale ? (
        <p role="alert" className={styles.error}>
          {stale
            ? 'The saved candidate changed elsewhere. Your edits are preserved. Discard them to reload the current candidate before saving.'
            : error || validationError || previewError}
        </p>
      ) : null}
      <fieldset className={styles.content} disabled={busy || !!disabledReason}>
        <SchemaFieldValidation key={resetKey} onValidationChange={setFieldError}>
          <div className={styles.list} hidden={view !== 'data'}>
            <div className={styles.columns}>
              <span>Field</span>
              <span>Type · Required</span>
              <span>Actions</span>
            </div>
            <div role="tree" aria-label="Schema fields" className={tree.tree}>
              {visible.map((row) => (
                <StructureTreeRow
                  editable
                  key={row.path}
                  path={row.semanticPath}
                  depth={row.depth}
                  kind={row.kind === 'slot' ? 'scalar' : 'mapping'}
                  expanded={row.expandable ? !collapsed[row.path] : undefined}
                  selected={selected === row.path}
                  onSelect={() => select(row)}
                  onToggle={() => {
                    if (!validationError)
                      setCollapsed((current) => ({ ...current, [row.path]: !current[row.path] }));
                  }}
                  icon={
                    row.kind === 'node' ? (
                      <Box aria-hidden="true" />
                    ) : (
                      <FileText aria-hidden="true" />
                    )
                  }
                  leading={row.kind === 'node' ? renderSource(row) : undefined}
                  iconTitle={row.kind}
                  label={
                    <span
                      onFocus={() => select(row)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      role="presentation"
                    >
                      <SchemaFieldName
                        label={`Name ${row.semanticPath}`}
                        name={row.name}
                        names={rows
                          .filter(
                            (item) =>
                              JSON.stringify(item.location.slice(0, -1)) ===
                              JSON.stringify(row.location.slice(0, -1))
                          )
                          .map((item) => item.name)}
                        onChange={(name) => update(row, name, row.definition)}
                      />
                    </span>
                  }
                  preview={
                    <span
                      className={styles.inline}
                      onFocus={() => select(row)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      role="presentation"
                    >
                      {row.kind === 'slot' ? (
                        <select
                          aria-label={`Type ${row.semanticPath}`}
                          value={String(row.definition.type ?? '')}
                          onChange={(event) => {
                            const next = { ...row.definition };
                            if (event.target.value) next.type = event.target.value;
                            else delete next.type;
                            update(row, row.name, next);
                          }}
                        >
                          <option value="">Any type</option>
                          {[
                            'string',
                            'number',
                            'integer',
                            'boolean',
                            'array',
                            'object',
                            'null',
                          ].map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{row.definition.repeated ? 'Repeated node' : 'Node'}</span>
                      )}
                      <input
                        type="checkbox"
                        aria-label={`Required ${row.semanticPath}`}
                        checked={row.required}
                        onChange={(event) =>
                          update(row, row.name, row.definition, event.target.checked)
                        }
                      />
                    </span>
                  }
                  actions={
                    <span className={tree.actions}>
                      {row.kind === 'node' ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Add field inside ${row.semanticPath}`}
                            disabled={!!validationError}
                            onClick={(event) => {
                              event.stopPropagation();
                              add(row, 'slot');
                            }}
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Add child node inside ${row.semanticPath}`}
                            disabled={
                              !!validationError ||
                              row.definition.repeated === true ||
                              row.definition.children === 'any'
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              add(row, 'node');
                            }}
                          >
                            <Box size={14} />
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Delete ${row.semanticPath}`}
                        data-danger="true"
                        onClick={(event) => {
                          event.stopPropagation();
                          update(row, row.name, undefined);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  }
                />
              ))}
            </div>
            {!visible.length ? (
              <p className={styles.feedback}>
                {rows.length
                  ? 'No fields match this search.'
                  : 'No nodes yet. Add a node to start defining fields.'}
              </p>
            ) : null}
          </div>
          {view === 'visual' ? (
            <SchemaVisualEditor
              definition={definition}
              rows={rows}
              selected={selected}
              layoutKey={layoutKey}
              disabled={busy || !!disabledReason || !!validationError || stale}
              onSelect={select}
              onAdd={(row) => add(row, 'slot')}
              onMove={move}
              onRelation={relate}
              onRules={() => {
                if (!validationError) setPanel('rules');
              }}
              renderSource={renderSource}
              sources={sources}
              onSource={onComposeSources}
            />
          ) : null}
          <aside className={styles.properties} aria-label="Schema properties">
            <div className={styles.tabs}>
              <button
                type="button"
                aria-pressed={panel === 'properties'}
                disabled={!!validationError}
                onClick={() => setPanel('properties')}
              >
                Properties
              </button>
              <button
                type="button"
                aria-pressed={panel === 'rules'}
                disabled={!!validationError}
                onClick={() => setPanel('rules')}
              >
                Relations & rules
              </button>
            </div>
            <div hidden={panel !== 'properties'}>
              {active ? (
                <div key={active.path} className={styles.settings}>
                  <h3>{active.semanticPath}</h3>
                  {view === 'visual' ? (
                    <div className="mb-4 space-y-2">
                      <SchemaFieldName
                        label={`Visual name ${active.semanticPath}`}
                        name={active.name}
                        names={rows
                          .filter(
                            (row) =>
                              JSON.stringify(row.location.slice(0, -1)) ===
                              JSON.stringify(active.location.slice(0, -1))
                          )
                          .map((row) => row.name)}
                        onChange={(name) => update(active, name, active.definition)}
                      />
                      {active.kind === 'slot' ? (
                        <label className="flex items-center gap-2 text-sm">
                          Type
                          <select
                            aria-label={`Visual type ${active.semanticPath}`}
                            value={String(active.definition.type ?? '')}
                            onChange={(event) => {
                              const next = { ...active.definition };
                              if (event.target.value) next.type = event.target.value;
                              else delete next.type;
                              update(active, active.name, next);
                            }}
                          >
                            <option value="">Any type</option>
                            {[
                              'string',
                              'number',
                              'integer',
                              'boolean',
                              'array',
                              'object',
                              'null',
                            ].map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          aria-label={`Visual required ${active.semanticPath}`}
                          checked={active.required}
                          onChange={(event) =>
                            update(active, active.name, active.definition, event.target.checked)
                          }
                        />
                        Required
                      </label>
                    </div>
                  ) : null}
                  <SchemaFieldProperties
                    kind={active.kind}
                    path={active.semanticPath}
                    value={active.definition}
                    onChange={(value) => update(active, active.name, value)}
                  />
                </div>
              ) : (
                <p className={styles.feedback}>
                  Select a field to edit its description, defaults and constraints.
                </p>
              )}
            </div>
            <div hidden={panel !== 'rules'}>
              <SchemaDefinitionStructure
                value={definition}
                onChange={change}
                onValidationChange={setRulesError}
                showNodes={false}
              />
            </div>
          </aside>
        </SchemaFieldValidation>
      </fieldset>
      <footer className={styles.footer}>
        <input
          aria-label="Schema change intent"
          placeholder="Describe this change"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
        />
        <output>{notice}</output>
        <Button variant="ghost" disabled={busy || (!dirty && !validationError)} onClick={discard}>
          Discard changes
        </Button>
        <Button
          variant="commit"
          disabled={busy || !dirty || !!validationError || stale || !!disabledReason}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save candidate'}
        </Button>
      </footer>
      {navigation.dialog}
    </section>
  );
}
