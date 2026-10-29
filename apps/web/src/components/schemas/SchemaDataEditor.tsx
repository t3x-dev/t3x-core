'use client';

import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { canonicalJson, type YValue } from '@t3x-dev/yops';
import {
  Box,
  Braces,
  Check,
  ChevronDown,
  FileText,
  Hash,
  Layers2,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Shapes,
  ToggleRight,
  Trash2,
  Type,
} from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { StructureTreeRow, visibleTreeRows } from '@/components/structure/StructureTree';
import tree from '@/components/structure/StructureTree.module.css';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  addSchemaField,
  changeSchemaField,
  importSchemaField,
  moveSchemaField,
  type SchemaDefinition,
  type SchemaFieldRow,
  SchemaNameConflict,
  schemaFieldRows,
} from '@/domain/schemas/schemaFieldEditing';
import { type SchemaSourcePin, schemaNodeProvenance } from '@/domain/schemas/schemaProvenance';
import {
  pruneSchemaMappings,
  type SchemaSourceMappings,
  transferSchemaMappings,
} from '@/domain/schemas/schemaSourceMappings';
import { schemaSourceRelations } from '@/domain/schemas/schemaSourceRelations';
import type { SchemaSourceIdentity } from '@/hooks/schemas/useSchemaSourceIdentities';
import styles from './SchemaDataEditor.module.css';
import {
  SchemaDefinitionStructure,
  SchemaFieldName,
  SchemaFieldProperties,
  SchemaFieldValidation,
  schemaFieldTypeLabels,
} from './SchemaDefinitionStructure';
import { SchemaDetailsPanel } from './SchemaDetailsPanel';
import { SchemaFieldTree } from './SchemaFieldTree';
import { SchemaSourceBadge } from './SchemaSourceBadge';
import { type ParentLineMode, SchemaVisualEditor } from './SchemaVisualEditor';
import type { SchemaSourceItem } from './SchemaVisualSources';
import { type SchemaEditorNavigation, useSchemaNavigationGuard } from './useSchemaNavigationGuard';

/** Field types are visual identities; editing and validation still use the definition. */
function SchemaFieldTypeIcon({ row }: { row: SchemaFieldRow }) {
  const type = row.kind === 'node' ? 'node' : String(row.definition.type ?? 'any');
  const icons: Record<string, typeof Type> = {
    string: Type,
    boolean: ToggleRight,
    number: Hash,
    integer: Hash,
    array: List,
    object: Braces,
  };
  const Icon =
    row.kind === 'node' ? (row.definition.repeated ? Layers2 : Box) : (icons[type] ?? FileText);
  return (
    <span className={styles.fieldTypeIcon} data-field-type={type}>
      <Icon aria-hidden="true" />
    </span>
  );
}

function schemaEditorValueKey(definition: SchemaDefinition, mappings: SchemaSourceMappings) {
  const origins = mappings
    .filter(
      (entry) =>
        entry.source ||
        entry.path.length !== entry.from.length ||
        entry.path.some((key, index) => key !== entry.from[index])
    )
    .map((entry) => canonicalJson(entry as YValue))
    .sort();
  // Mapping order and a local move back to its original path do not change the saved value.
  return canonicalJson({ definition, origins } as YValue);
}

export function SchemaDataEditor({
  navigationRef,
  focusSemanticPath,
  showSaveAction = true,
  externalActions = false,
  workbenchFooter = false,
  onActionsAvailabilityChange,
  onSaveAvailabilityChange,
  view = 'data',
  layoutKey = 'schema',
  sources,
  sourceManagement,
  provenance,
  sourceIdentities = {},
  wholeSchemaSource,
  onComposeSources,
  onValidationChange,
  initialDefinition,
  initiallyDirty = false,
  onCreateBlank,
  onChooseSources,
  revisionKey,
  pending = false,
  loading = true,
  previewError,
  onRetry,
  onPreview,
  onSave,
  onDirtyChange,
  onDiscard,
  disabledReason,
  projectId,
  baseDefinition,
  initialSourceMappings = [],
}: {
  navigationRef?: RefObject<SchemaEditorNavigation | null>;
  focusSemanticPath?: string;
  showSaveAction?: boolean;
  externalActions?: boolean;
  workbenchFooter?: boolean;
  onActionsAvailabilityChange?: (availability: {
    undo: boolean;
    rules: boolean;
    discard: boolean;
  }) => void;
  onSaveAvailabilityChange?: (available: boolean) => void;
  onValidationChange?: (invalid: boolean) => void;
  view?: 'data' | 'visual';
  layoutKey?: string;
  sources?: StudioCandidate[];
  sourceManagement?: ReactNode;
  provenance?: Pick<StudioPreview, 'schema' | 'origins' | 'sources' | 'nodeProvenance'>;
  sourceIdentities?: Record<string, SchemaSourceIdentity>;
  wholeSchemaSource?: SchemaSourcePin;
  onComposeSources?: (sourceId?: string) => void;
  initialDefinition?: SchemaDefinition;
  initiallyDirty?: boolean;
  onCreateBlank?: () => void;
  onChooseSources?: () => void;
  revisionKey: string;
  pending?: boolean;
  loading?: boolean;
  previewError?: string;
  onRetry?: () => void;
  disabledReason?: string;
  projectId?: string;
  baseDefinition?: SchemaDefinition;
  initialSourceMappings?: SchemaSourceMappings;
  onPreview: (definition: SchemaDefinition, mappings?: SchemaSourceMappings) => void;
  onSave: (
    definition: SchemaDefinition,
    intent: string,
    mappings?: SchemaSourceMappings
  ) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onDiscard: () => void;
}) {
  const [definition, setDefinition] = useState<SchemaDefinition>();
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [parentLineMode, setParentLineMode] = useState<ParentLineMode>('focus');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'properties' | 'rules'>('properties');
  const [fieldError, setFieldError] = useState<string>();
  const [rulesError, setRulesError] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [intent, setIntent] = useState('Edit Schema fields.');
  const [intentOpen, setIntentOpen] = useState(false);
  const intentInput = useRef<HTMLTextAreaElement>(null);
  const [addKind, setAddKind] = useState<'node' | 'slot'>();
  const [addParent, setAddParent] = useState('');
  const [saving, setSaving] = useState(false);
  const [sourceMappings, setSourceMappings] = useState<SchemaSourceMappings>([]);
  const [history, setHistory] = useState<
    Array<{ definition: SchemaDefinition; mappings: SchemaSourceMappings; selected?: string }>
  >([]);
  const [conflict, setConflict] = useState<{
    row: SchemaFieldRow;
    target: SchemaFieldRow | null;
    item?: SchemaSourceItem;
  }>();
  const [conflictName, setConflictName] = useState('');
  const [conflictError, setConflictError] = useState('');
  const loaded = useRef<string | undefined>(undefined);
  const savedValue = useRef<{ key: string; needsInitialSave: boolean } | undefined>(undefined);
  const validationError = fieldError || rulesError;
  const busy = pending || saving || !definition;
  const stale = dirty && loaded.current !== revisionKey;

  useEffect(() => {
    if (!initialDefinition || dirty || loaded.current === revisionKey) return;
    loaded.current = revisionKey;
    savedValue.current = {
      key: schemaEditorValueKey(initialDefinition, initialSourceMappings),
      needsInitialSave: initiallyDirty,
    };
    setDefinition(structuredClone(initialDefinition));
    setDirty(initiallyDirty);
    setSourceMappings(structuredClone(initialSourceMappings));
    setHistory([]);
  }, [initialDefinition, revisionKey, dirty, initialSourceMappings, initiallyDirty]);
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
  const nodeCount = rows.filter((row) => row.kind === 'node').length;
  const fieldCount = rows.length - nodeCount;
  const sourceRows = useMemo(
    () =>
      new Map((provenance ? schemaFieldRows(provenance.schema) : []).map((row) => [row.path, row])),
    [provenance?.schema]
  );
  const sourceRelations = useMemo(
    () =>
      workbenchFooter
        ? schemaSourceRelations(rows, sourceMappings, provenance, baseDefinition, wholeSchemaSource)
        : undefined,
    [workbenchFooter, rows, sourceMappings, provenance, baseDefinition, wholeSchemaSource]
  );
  const renderSource = (row: SchemaFieldRow) => (
    <SchemaSourceBadge
      variant={workbenchFooter ? 'label' : 'icon'}
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
  const lastFocus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focusSemanticPath || lastFocus.current === focusSemanticPath) return;
    const row = rows.find((item) => item.semanticPath === focusSemanticPath);
    if (!row) return;
    lastFocus.current = focusSemanticPath;
    setSelected(row.path);
    setPanel('properties');
    setQuery('');
    setCollapsed({});
  }, [focusSemanticPath, rows]);
  const active = rows.find((row) => row.path === selected);

  function transfer(
    row: SchemaFieldRow,
    target: SchemaFieldRow | null,
    item?: SchemaSourceItem,
    name = row.name
  ) {
    if (!definition || !row) return;
    try {
      const location = target
        ? [...target.location, row.kind === 'slot' ? 'slots' : 'children', name]
        : ['nodes', name];
      const next = item
        ? importSchemaField(definition, item.preview.schema, row, target, name).definition
        : moveSchemaField(definition, row, target, name);
      if (next === definition) return;
      const mappings = transferSchemaMappings(
        sourceMappings,
        item?.preview.schema ?? definition,
        row,
        location,
        item ? { candidateId: item.candidateId, schemaHash: item.preview.schemaHash } : undefined,
        baseDefinition ?? initialDefinition
      );
      change(next, mappings);
      setSelected(JSON.stringify(location));
      setConflict(undefined);
      if (target) setCollapsed((current) => ({ ...current, [target.path]: false }));
      setNotice(
        `${item ? 'Imported' : 'Moved'} ${row.semanticPath} to ${target?.semanticPath ?? 'the root'}.`
      );
    } catch (cause) {
      if (cause instanceof SchemaNameConflict) {
        setConflict({ row, target, item });
        if (!conflict) setConflictName(`${row.name}_copy`);
        setConflictError(cause.message);
      } else if (conflict)
        setConflictError(cause instanceof Error ? cause.message : 'Could not move this item.');
      else setError(cause instanceof Error ? cause.message : 'Could not move this item.');
    }
  }
  function move(path: string, target: SchemaFieldRow | null) {
    const row = rows.find((item) => item.path === path);
    if (row) transfer(row, target);
  }
  function select(row: SchemaFieldRow) {
    if (validationError) return;
    setSelected(row.path);
    setPanel('properties');
  }

  function change(next: SchemaDefinition, mappings = sourceMappings) {
    if (definition)
      setHistory((current) => [
        ...current.slice(-29),
        { definition, mappings: sourceMappings, selected },
      ]);
    const retained = pruneSchemaMappings(mappings, next);
    setSourceMappings(retained);
    setDefinition(next);
    setDirty(hasUnsavedChanges(next, retained));
    setError(undefined);
    setNotice('');
    onPreview(next, retained);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setDefinition(previous.definition);
    setSourceMappings(previous.mappings);
    setSelected(previous.selected);
    setDirty(hasUnsavedChanges(previous.definition, previous.mappings));
    setError(undefined);
    setNotice('Undid the last definition change.');
    setResetKey((value) => value + 1);
    onPreview(previous.definition, previous.mappings);
  }
  function hasUnsavedChanges(next: SchemaDefinition, mappings: SchemaSourceMappings) {
    return (
      savedValue.current?.needsInitialSave === true ||
      schemaEditorValueKey(next, mappings) !== savedValue.current?.key
    );
  }
  function update(
    row: SchemaFieldRow,
    name: string,
    value: SchemaDefinition | undefined,
    required = row.required
  ) {
    if (!definition) return false;
    try {
      const next = changeSchemaField(definition, row, name, value, required);
      change(
        next,
        value !== undefined && name !== row.name
          ? transferSchemaMappings(
              sourceMappings,
              definition,
              row,
              [...row.location.slice(0, -1), name],
              undefined,
              baseDefinition ?? initialDefinition
            )
          : sourceMappings
      );
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
      await onSave(definition, intent.trim() || 'Edit Schema fields.', sourceMappings);
      savedValue.current = {
        key: schemaEditorValueKey(definition, sourceMappings),
        needsInitialSave: false,
      };
      setDirty(false);
      setHistory([]);
      setNotice('Schema changes saved. Not committed.');
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
    setNotice('');
    setHistory([]);
    setConflict(undefined);
    setSelected(undefined);
    loaded.current = undefined;
    setDefinition(undefined);
    setResetKey((value) => value + 1);
    onDiscard();
  }
  const canSave = !!definition && !busy && dirty && !validationError && !stale && !disabledReason;
  useEffect(() => {
    onSaveAvailabilityChange?.(canSave);
  }, [canSave, onSaveAvailabilityChange]);
  const canUndo = !busy && !!history.length && !validationError && !stale;
  const canOpenRules = !busy && !validationError;
  const canDiscard = !busy && (dirty || !!validationError);
  useEffect(() => {
    onActionsAvailabilityChange?.({ undo: canUndo, rules: canOpenRules, discard: canDiscard });
  }, [canUndo, canOpenRules, canDiscard, onActionsAvailabilityChange]);
  const navigation = useSchemaNavigationGuard({
    dirty: dirty || Boolean(validationError),
    canSave,
    save,
    discard,
  });
  useEffect(() => {
    if (!navigationRef) return;
    navigationRef.current = {
      requestNavigation: navigation.requestNavigation,
      save,
      undo: () => {
        if (canUndo) undo();
      },
      openRules: () => {
        if (canOpenRules) setPanel('rules');
      },
      describeChanges: () => {
        if (workbenchFooter) intentInput.current?.focus();
        else setIntentOpen(true);
      },
      discard: () => {
        if (canDiscard) discard();
      },
    };
    return () => {
      navigationRef.current = null;
    };
  });

  const schemaUnavailable = workbenchFooter && !definition;
  const schemaEmpty =
    workbenchFooter && !!definition && !rows.length && view === 'data' && panel === 'properties';
  const emptyContent = !definition ? (
    <div className={styles.emptyState}>
      {workbenchFooter ? (
        <span className={styles.emptyIcon}>
          <Shapes size={22} aria-hidden="true" />
        </span>
      ) : null}
      {previewError ? (
        <>
          <strong>Could not load Schema</strong>
          <p role="alert">{previewError}</p>
          {onRetry ? (
            <Button size="sm" variant="canvas-outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </>
      ) : loading ? (
        <output>Loading Schema definition…</output>
      ) : disabledReason ? (
        <output>{disabledReason}</output>
      ) : onCreateBlank ? (
        <>
          <strong>This workspace has no schema</strong>
          <p>Create a schema, or reuse an existing schema from Schema sources.</p>
          <div className={styles.emptyActions}>
            <Button size="sm" variant="commit" onClick={onCreateBlank}>
              Create schema
            </Button>
            {onChooseSources ? (
              <Button size="sm" variant="canvas-outline" onClick={onChooseSources}>
                Use an existing schema…
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p>Schema definition unavailable.</p>
          {onRetry ? (
            <Button size="sm" variant="canvas-outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </>
      )}
    </div>
  ) : schemaEmpty ? (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <Shapes size={22} aria-hidden="true" />
      </span>
      <strong>No nodes yet</strong>
      <p>Add a node, or reuse one from Schema sources.</p>
      <div className={styles.emptyActions}>
        <Button
          size="sm"
          variant="commit"
          disabled={busy || !!disabledReason || !!validationError || stale}
          onClick={() => add(null, 'node')}
        >
          Add node
        </Button>
      </div>
    </div>
  ) : undefined;
  return (
    <section
      aria-label="Schema data editor"
      className={styles.editor}
      data-schema-editor
      data-view={view}
      data-workbench-footer={workbenchFooter || undefined}
      data-schema-unavailable={schemaUnavailable || undefined}
      data-schema-empty={schemaEmpty || undefined}
    >
      {schemaUnavailable && sourceManagement ? (
        <div className={styles.emptyToolbar}>{sourceManagement}</div>
      ) : null}
      <header className={styles.toolbar} hidden={schemaUnavailable}>
        {view === 'data' ? (
          <label className={styles.search}>
            {workbenchFooter ? <Search size={15} aria-hidden="true" /> : null}
            <input
              aria-label="Find a node or field"
              placeholder="Find a node or field…"
              value={query}
              disabled={busy || Boolean(validationError)}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {!workbenchFooter ? (
          <span>
            {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} · {fieldCount}{' '}
            {fieldCount === 1 ? 'field' : 'fields'}
          </span>
        ) : null}
        {!externalActions ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={!canOpenRules}
            onClick={() => setPanel('rules')}
          >
            Relationships & rules
          </Button>
        ) : null}
        <span className={styles.toolbarSpacer} />
        {showSaveAction ? (
          <Button
            size="sm"
            variant="canvas-outline"
            disabled={busy || !dirty || !!validationError || stale || !!disabledReason}
            onClick={() => void save()}
          >
            Save draft
          </Button>
        ) : null}
        {!externalActions ? (
          <Button variant="canvas-outline" size="sm" disabled={!canUndo} onClick={undo}>
            Undo
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="canvas-outline"
              size="sm"
              disabled={busy || !!disabledReason || !!validationError || stale}
            >
              <Plus size={14} aria-hidden="true" /> Add <ChevronDown size={14} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => add(null, 'node')}>Top-level node</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setAddParent(active?.kind === 'node' ? active.path : (active?.parentPath ?? ''));
                setAddKind('node');
              }}
            >
              Child node…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setAddParent(active?.kind === 'node' ? active.path : (active?.parentPath ?? ''));
                setAddKind('slot');
              }}
            >
              Field…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!externalActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Editing actions">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!workbenchFooter ? (
                <DropdownMenuItem onSelect={() => setIntentOpen(true)}>
                  Edit change description…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem disabled={busy || (!dirty && !validationError)} onSelect={discard}>
                Discard all unsaved changes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      {error || validationError || (definition && previewError) || stale ? (
        <p role="alert" className={styles.error}>
          {stale
            ? 'The saved candidate changed elsewhere. Your edits are preserved. Discard them to reload the current candidate before saving.'
            : error || validationError || previewError}
        </p>
      ) : null}
      <fieldset className={styles.content} disabled={pending || saving}>
        <SchemaFieldValidation key={resetKey} onValidationChange={setFieldError}>
          <div className={styles.list} hidden={view !== 'data'}>
            <SchemaFieldTree
              studio={workbenchFooter}
              unavailable={schemaUnavailable}
              footer={
                workbenchFooter && definition ? (
                  <label className={styles.changeDescription}>
                    <span>Change description</span>
                    <textarea
                      ref={intentInput}
                      aria-label="Schema change intent"
                      rows={1}
                      value={intent}
                      disabled={busy || !!disabledReason}
                      onChange={(event) => setIntent(event.target.value)}
                    />
                  </label>
                ) : undefined
              }
              emptyContent={emptyContent}
              rows={rows}
              visible={visible}
              selected={selected}
              relations={sourceRelations}
              sourceBase={baseDefinition}
              onReveal={(row) => {
                setQuery('');
                setCollapsed((current) => {
                  const next = { ...current };
                  let parent = row.parentPath;
                  while (parent) {
                    next[parent] = false;
                    parent = rows.find((item) => item.path === parent)?.parentPath ?? null;
                  }
                  return next;
                });
              }}
              disabled={busy || !!disabledReason || !!validationError || stale}
              projectId={projectId}
              sources={view === 'data' ? sources : undefined}
              sourceManagement={view === 'data' ? sourceManagement : undefined}
              onMove={move}
              onImport={(item, target) => transfer(item.row, target, item)}
              onSelect={select}
              renderRow={(row, handle, selectRow) => (
                <StructureTreeRow
                  editable
                  key={row.path}
                  path={row.semanticPath}
                  depth={row.depth}
                  kind={row.kind === 'slot' ? 'scalar' : 'mapping'}
                  expanded={row.expandable ? !collapsed[row.path] : undefined}
                  selected={selected === row.path}
                  onSelect={selectRow}
                  onToggle={() => {
                    if (!validationError)
                      setCollapsed((current) => ({ ...current, [row.path]: !current[row.path] }));
                  }}
                  icon={
                    workbenchFooter ? (
                      <SchemaFieldTypeIcon row={row} />
                    ) : row.kind === 'node' ? (
                      <Box aria-hidden="true" />
                    ) : (
                      <FileText aria-hidden="true" />
                    )
                  }
                  leading={
                    <>
                      {handle}
                      {!workbenchFooter && (row.kind === 'node' || row.definition.type === 'object')
                        ? renderSource(row)
                        : null}
                    </>
                  }
                  iconTitle={row.kind}
                  label={
                    <span className={styles.fieldIdentity}>
                      <span
                        className={styles.fieldName}
                        onFocus={selectRow}
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
                      {workbenchFooter && (row.kind === 'node' || row.definition.type === 'object')
                        ? renderSource(row)
                        : null}
                    </span>
                  }
                  preview={
                    <span
                      className={styles.inline}
                      onFocus={selectRow}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectRow();
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      role="presentation"
                    >
                      <span className={styles.fieldSummary}>
                        <span>
                          {row.kind === 'slot'
                            ? workbenchFooter
                              ? String(row.definition.type || 'Any type')
                              : (schemaFieldTypeLabels[String(row.definition.type)] ??
                                String(row.definition.type || 'Any type'))
                            : row.definition.repeated
                              ? 'Repeatable node'
                              : 'Node'}
                        </span>
                        <span className={styles.requiredColumn}>
                          {workbenchFooter ? (
                            <>
                              <span
                                className={styles.requiredMark}
                                data-required={row.required}
                                aria-hidden="true"
                              >
                                {row.required ? <Check size={11} /> : null}
                              </span>
                              <span className="sr-only">
                                {row.required ? 'Required' : 'Optional'}
                              </span>
                            </>
                          ) : row.required ? (
                            'Required'
                          ) : (
                            'Optional'
                          )}
                        </span>
                      </span>
                      <span className={styles.fieldControls}>
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
                              <option key={type} value={type}>
                                {schemaFieldTypeLabels[type] ?? type}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{row.definition.repeated ? 'Repeatable node' : 'Node'}</span>
                        )}
                        <span className={styles.requiredColumn}>
                          <input
                            type="checkbox"
                            aria-label={`Required ${row.semanticPath}`}
                            checked={row.required}
                            onChange={(event) =>
                              update(row, row.name, row.definition, event.target.checked)
                            }
                          />
                        </span>
                      </span>
                    </span>
                  }
                  actions={
                    <span className={`${tree.actions} ${styles.fieldActions}`}>
                      {row.kind === 'node' ? (
                        <button
                          type="button"
                          aria-label={`Add to ${row.semanticPath}`}
                          title="Add field"
                          disabled={busy || !!disabledReason || !!validationError || stale}
                          onClick={(event) => {
                            event.stopPropagation();
                            add(row, 'slot');
                          }}
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions for ${row.semanticPath}`}
                            disabled={busy || !!disabledReason || !!validationError || stale}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.kind === 'node' ? (
                            <>
                              <DropdownMenuItem onSelect={() => add(row, 'slot')}>
                                <Plus size={14} /> Add field
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={
                                  row.definition.repeated === true ||
                                  row.definition.children === 'any'
                                }
                                onSelect={() => add(row, 'node')}
                              >
                                <Box size={14} /> Add child node
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          <DropdownMenuItem
                            className="text-[var(--status-error)]"
                            onSelect={() => update(row, row.name, undefined)}
                          >
                            <Trash2 size={14} />{' '}
                            {row.kind === 'node' ? 'Delete node' : 'Delete field'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  }
                />
              )}
            />
          </div>
          {view === 'visual' && definition ? (
            <SchemaVisualEditor
              parentLineMode={parentLineMode}
              onParentLineModeChange={setParentLineMode}
              definition={definition}
              rows={rows}
              selected={selected}
              key={layoutKey}
              disabled={busy || !!disabledReason || !!validationError || stale}
              onSelect={select}
              onAdd={(row) => add(row, 'slot')}
              onMove={move}
              projectId={projectId}
              onImport={(item, target) => transfer(item.row, target, item)}
              onClearSelection={() => {
                if (!validationError) setSelected(undefined);
              }}
              onRules={() => {
                if (!validationError) setPanel('rules');
              }}
              renderSource={renderSource}
              sources={sources}
              onSource={onComposeSources}
            />
          ) : null}
          <SchemaDetailsPanel
            hidden={schemaUnavailable || schemaEmpty}
            identity={workbenchFooter && panel === 'properties' ? active?.name : undefined}
            icon={
              workbenchFooter && panel === 'properties' && active ? (
                <SchemaFieldTypeIcon row={active} />
              ) : undefined
            }
            ariaLabel={panel === 'rules' ? 'Schema relations and rules' : 'Schema properties'}
            title={
              panel === 'rules'
                ? 'Relationships & rules'
                : active?.kind === 'node'
                  ? 'Node settings'
                  : active
                    ? 'Field settings'
                    : 'Details'
            }
            context={
              panel === 'rules'
                ? 'These settings apply to the entire schema.'
                : (active?.semanticPath ?? 'No selection')
            }
            contentKey={panel === 'rules' ? 'rules' : (active?.path ?? 'empty')}
            clearDisabled={busy || !!validationError}
            onClear={
              active || panel === 'rules'
                ? () => {
                    setSelected(undefined);
                    setPanel('properties');
                  }
                : undefined
            }
          >
            <div hidden={panel !== 'properties'}>
              {active ? (
                <div key={active.path}>
                  {view === 'visual' && definition ? (
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
                              <option key={type} value={type}>
                                {schemaFieldTypeLabels[type] ?? type}
                              </option>
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
                <p className="text-xs text-[var(--text-secondary)]">
                  Select a node or field to edit its settings.
                </p>
              )}
            </div>
            <div hidden={panel !== 'rules'}>
              {definition ? (
                <SchemaDefinitionStructure
                  value={definition}
                  onChange={change}
                  onValidationChange={setRulesError}
                  showNodes={false}
                  embedded
                  progressive
                />
              ) : null}
            </div>
          </SchemaDetailsPanel>
        </SchemaFieldValidation>
      </fieldset>
      {workbenchFooter && !schemaUnavailable ? (
        <footer className={styles.workbenchFooter}>
          <span>
            {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} · {fieldCount}{' '}
            {fieldCount === 1 ? 'field' : 'fields'}
          </span>
        </footer>
      ) : null}
      {notice ? (
        <output className="sr-only" aria-live="polite">
          {notice}
        </output>
      ) : null}
      <Dialog
        open={!!addKind}
        onOpenChange={(open) => {
          if (!open) setAddKind(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{addKind === 'slot' ? 'Add field' : 'Add child node'}</DialogTitle>
            <DialogDescription>
              Choose the node that will contain the new {addKind === 'slot' ? 'field' : 'node'}.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.moveMenu}>
            Parent node
            <select
              aria-label="Parent node"
              value={addParent}
              onChange={(event) => setAddParent(event.target.value)}
            >
              <option value="">Choose a node</option>
              {rows
                .filter((row) => row.kind === 'node')
                .map((row) => (
                  <option
                    key={row.path}
                    value={row.path}
                    disabled={
                      addKind === 'node' &&
                      (row.definition.repeated === true || row.definition.children === 'any')
                    }
                  >
                    {row.semanticPath}
                    {addKind === 'node' &&
                    (row.definition.repeated === true || row.definition.children === 'any')
                      ? ' — child nodes unavailable'
                      : ''}
                  </option>
                ))}
            </select>
          </label>
          {!rows.some((row) => row.kind === 'node') ? (
            <p className="text-sm">Add a top-level node first. Fields belong to nodes.</p>
          ) : null}
          <Button
            disabled={!addParent || busy || !!validationError || stale}
            variant="commit"
            onClick={() => {
              const parent = rows.find((row) => row.path === addParent);
              if (parent && addKind) {
                add(parent, addKind);
                setAddKind(undefined);
              }
            }}
          >
            Add {addKind === 'slot' ? 'field' : 'child node'}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={intentOpen} onOpenChange={setIntentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change description</DialogTitle>
            <DialogDescription>
              This description is saved with your edits when you save or continue to Review.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            Change description
            <textarea
              aria-label="Schema change intent"
              className="min-h-24 w-full rounded-md border bg-[var(--surface-card)] p-3"
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
            />
          </label>
          <Button variant="commit" onClick={() => setIntentOpen(false)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
      {navigation.dialog}
      <Dialog
        open={!!conflict}
        onOpenChange={(open) => {
          if (!open) setConflict(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name already exists</DialogTitle>
            <DialogDescription>
              Choose a new name to keep both definitions, or cancel this operation.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (conflict) transfer(conflict.row, conflict.target, conflict.item, conflictName);
            }}
          >
            <label className="flex flex-col gap-2">
              New name
              <input
                aria-label="New name"
                value={conflictName}
                onChange={(event) => setConflictName(event.target.value)}
                className="rounded border p-2"
                autoFocus
              />
            </label>
            {conflictError ? (
              <p role="alert" className={styles.error}>
                {conflictError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConflict(undefined)}>
                Cancel
              </Button>
              <Button type="submit" variant="commit">
                Rename and continue
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
