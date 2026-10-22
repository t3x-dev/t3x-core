'use client';

import type {
  AssistantSchemaSettingsInput,
  AssistantSchemaSettingsView,
  TransitionProtocolValue,
} from '@t3x-dev/api-client';
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Database,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SchemaChangeSettingsEditor } from '@/components/schemas/SchemaDefinitionStructure';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { humanizeComposeIdentifier } from '@/domain/composePresentation';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useAssistantSchemaSettings } from '@/hooks/schemas/useAssistantSchemaSettings';
import styles from './AssistantSchemaSettingsCard.module.css';
import detailsStyles from './ComposeFieldDetails.module.css';
import { ComposeDetailValue, ComposeObjectDelta } from './ComposeNodeHistoryPanel';

function changeLabel(action: string) {
  const [verb, kind] = action.split('_');
  return `${verb[0].toUpperCase() + verb.slice(1)} ${kind === 'slot' ? 'Slot' : kind === 'node' ? 'Node' : kind === 'relation' ? 'relation type' : 'rule'}`;
}

function settingText(value: unknown): string {
  if (Array.isArray(value)) return value.map(settingText).join(', ') || 'None';
  if (value && typeof value === 'object')
    return `${Object.keys(value).length} nested settings (expand attributes to inspect)`;
  return value === undefined ? 'Not set' : value === null ? 'null' : String(value);
}

type SchemaSummaryRow = { name: string; value: string; before?: string };

function schemaAttributes(record: AssistantSchemaSettingsView) {
  const { action, name, definition, required, unsetAttributes } = record.settings;
  const kind = action.split('_')[1];
  const relocating = action.startsWith('rename_') || action.startsWith('move_');
  const before = record.currentDefinition ?? {};
  const attributes: Record<string, unknown> = {
    ...(record.settings.definitionMode === 'replace' && !relocating ? {} : before),
    ...(!relocating ? definition : {}),
    ...(!relocating && required !== undefined ? { required } : {}),
  };
  if (kind === 'node') {
    attributes.required ??= false;
    attributes.repeated ??= false;
  } else if (kind === 'slot') {
    attributes.type ??= 'any';
    if (action === 'add_slot') attributes.required ??= false;
  }
  if (kind === 'rule') attributes.id = name;
  if (!relocating) {
    for (const key of Object.keys(before))
      if (!Object.hasOwn(attributes, key)) attributes[key] = undefined;
    for (const key of unsetAttributes ?? []) attributes[key] = undefined;
  }
  return attributes;
}

function schemaSummary(record: AssistantSchemaSettingsView): SchemaSummaryRow[] {
  const { action, nodePath, name, newName, targetNodePath } = record.settings;
  const kind = action.split('_')[1];
  const kindLabel =
    kind === 'node'
      ? 'Node'
      : kind === 'slot'
        ? 'Slot'
        : kind === 'relation'
          ? 'Relation type'
          : 'Rule';
  if (action.startsWith('remove_'))
    return [{ name: 'definition', before: kindLabel, value: 'Removed' }];
  const rows: SchemaSummaryRow[] = [];
  const relocating = action.startsWith('rename_') || action.startsWith('move_');
  if (relocating)
    rows.push({
      name: 'path',
      before: [nodePath, name].filter(Boolean).join('/'),
      value: [targetNodePath ?? nodePath, newName ?? name].filter(Boolean).join('/'),
    });
  if (kind !== 'slot')
    rows.push({
      name: 'definition',
      before: action.startsWith('add_') ? 'Absent' : undefined,
      value: kindLabel,
    });
  const before = record.currentDefinition ?? {};
  const attributes = schemaAttributes(record);
  const order = [
    'type',
    'required',
    'repeated',
    'maxWords',
    'maxLength',
    'minLength',
    'description',
  ];
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  for (const [key, value] of Object.entries(attributes).sort(([a], [b]) => rank(a) - rank(b)))
    rows.push({
      name: key,
      value: settingText(value),
      before: action.startsWith('add_')
        ? 'Absent'
        : before[key] !== undefined && JSON.stringify(before[key]) !== JSON.stringify(value)
          ? settingText(before[key])
          : undefined,
    });
  return rows;
}

function SchemaAttributeRows({ rows, label }: { rows: SchemaSummaryRow[]; label: string }) {
  return (
    <ul className={styles.attributeRows} aria-label={label}>
      {rows.map((row) => (
        <li
          key={row.name}
          data-added={row.before === 'Absent'}
          title={`${row.name}: ${row.before !== undefined ? `${row.before} → ` : ''}${row.value}`}
        >
          <span className={styles.attributeName}>{row.name}</span>
          <span className={styles.attributeValue}>
            {row.before !== undefined ? (
              <>
                <span className={styles.beforeValue} title={row.before}>
                  {row.before}
                </span>
                <ArrowRight size={10} aria-hidden="true" />
              </>
            ) : null}
            <span className={styles.afterValue} title={row.value}>
              {row.value}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AssistantSchemaSettingsCard({
  projectId,
  workspaceId,
  conversationId,
  refreshKey,
  disabled,
  onChanged,
}: {
  projectId: string;
  workspaceId: string;
  conversationId?: string;
  refreshKey: string;
  disabled: boolean;
  onChanged?: () => void;
}) {
  const state = useAssistantSchemaSettings(projectId, workspaceId, conversationId, refreshKey);
  return (
    <AssistantSchemaSettingsTimeline
      projectId={projectId}
      workspaceId={workspaceId}
      disabled={disabled}
      onChanged={onChanged}
      state={state}
    />
  );
}

export function AssistantSchemaSettingsTimeline(
  props: Parameters<typeof AssistantSchemaSettingsContent>[0]
) {
  const { state } = props;
  const record = state.record;
  if (!record) return state.error ? <p role="alert">{state.error}</p> : null;
  const cards = record.cards ?? [record];
  const ready = (card: AssistantSchemaSettingsView) =>
    card.status !== 'queued' ||
    (record.status === 'applied' &&
      !cards.some((parent) => {
        const path = [parent.settings.nodePath, parent.settings.name].filter(Boolean).join('/');
        return (
          parent.settings.action === 'add_node' &&
          parent.status !== 'applied' &&
          (card.settings.nodePath === path || card.settings.nodePath.startsWith(path + '/'))
        );
      }));
  const activeId = state.operationId ?? record.settingsId;
  return (
    <fieldset className={styles.timeline} aria-label="Schema confirmation cards">
      {cards.map((card) => (
        <div key={card.settingsId}>
          {card.status === 'queued' && !ready(card) ? (
            <p className={styles.waiting}>Waiting for the parent Node to be confirmed.</p>
          ) : null}
          <AssistantSchemaSettingsContent
            {...props}
            disabled={props.disabled || state.generating || !ready(card)}
            state={{
              ...state,
              record: card,
              error: card.settingsId === activeId ? state.error : undefined,
              generating: card.settingsId === activeId && state.generating,
              generate: (settings, discard) => state.generate(settings, discard, card),
              save: (settings) => state.save(settings, card),
            }}
          />
        </div>
      ))}
    </fieldset>
  );
}

/** Shared card presentation; the Compose owner places this record on its timeline. */
export function AssistantSchemaSettingsContent({
  projectId,
  workspaceId,
  disabled,
  onChanged,
  state,
  onInspect,
  selectedId,
}: {
  projectId: string;
  workspaceId: string;
  disabled: boolean;
  onChanged?: () => void;
  state: ReturnType<typeof useAssistantSchemaSettings>;
  onInspect?: (record: AssistantSchemaSettingsView) => void;
  selectedId?: string;
}) {
  const { record, error, save, generate, generating } = state;
  if (!record || record.status === 'cancelled') return error ? <p role="alert">{error}</p> : null;
  const studioHref =
    getProjectIdRepoPath(projectId) +
    '?' +
    new URLSearchParams({ tab: 'schemas', schemaView: 'studio', workspace: workspaceId });
  const summary = schemaSummary(record);
  if (record.status === 'generated' || record.status === 'applied')
    return (
      <section
        className={`${styles.card} ${styles.resultCard}`}
        data-applied={record.status === 'applied'}
        data-selected={selectedId === record.settingsId}
        aria-label={
          record.status === 'applied' ? 'Schema saved to Draft' : 'Schema candidate saved'
        }
      >
        {onInspect ? (
          <button
            type="button"
            className={styles.resultInspect}
            aria-label={`Inspect Schema change: ${[record.settings.targetNodePath ?? record.settings.nodePath, record.settings.newName ?? record.settings.name].filter(Boolean).join('/')}`}
            aria-pressed={selectedId === record.settingsId}
            onClick={() => onInspect(record)}
          />
        ) : null}
        <header className={`${styles.header} ${styles.resultHeader}`}>
          <Braces aria-hidden="true" />
          <span>{changeLabel(record.settings.action)} ·</span>
          <h3>{humanizeComposeIdentifier(record.settings.newName ?? record.settings.name)}</h3>
          <span className={styles.resultStatus} data-applied={record.status === 'applied'}>
            {record.status === 'applied' ? <Check aria-hidden="true" /> : null}
            {record.status === 'applied' ? 'Saved to Draft' : 'Candidate saved'}
          </span>
        </header>
        <div className={styles.resultBody}>
          <div className={styles.resultOverview}>
            <code
              className={styles.resultPath}
              title={[
                record.settings.targetNodePath ?? record.settings.nodePath,
                record.settings.newName ?? record.settings.name,
              ]
                .filter(Boolean)
                .join('/')}
            >
              {[
                record.settings.targetNodePath ?? record.settings.nodePath,
                record.settings.newName ?? record.settings.name,
              ]
                .filter(Boolean)
                .join('/')}
            </code>
            <div className={styles.resultProperties}>
              <SchemaAttributeRows rows={summary.slice(0, 3)} label="Schema change summary" />
            </div>
          </div>
          {record.status === 'generated' ? (
            <p className={styles.resultDescription}>
              Saved in Studio. This candidate has not been applied to the Draft.
            </p>
          ) : null}
          {record.status === 'generated' && record.impact && !record.impact.canAdopt ? (
            <p className={styles.warning}>
              Content migration is required before saving this Schema. Open Studio to prepare the
              mapping; existing YAML content has not been changed.
            </p>
          ) : null}
          <div className={styles.resultActions}>
            <details className={styles.technicalDetails}>
              <summary>
                <ChevronRight aria-hidden="true" />
                Technical details
              </summary>
              <p className={styles.resultDescription}>
                {record.settings.action.startsWith('add_')
                  ? record.settings.action.endsWith('_slot')
                    ? 'Added field'
                    : 'Added Node'
                  : changeLabel(record.settings.action)}
                {record.settings.nodePath
                  ? ` in ${record.settings.nodePath.split('/').map(humanizeComposeIdentifier).join(' / ')}`
                  : ''}
              </p>
              <p className={styles.resultScope}>YAML content is unchanged · No Commit created</p>
              {record.status === 'applied' ? (
                <p className={styles.resultDescription}>
                  Schema saved to the current Draft and synced to Studio.
                </p>
              ) : null}
              <SchemaAttributeRows rows={summary} label="Confirmed attributes" />
              {record.changes?.length ? (
                <ul aria-label="Schema changes" className={styles.validationDetails}>
                  {record.changes.map((change) => (
                    <li key={`${change.kind}:${change.path}`}>
                      <span>{change.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl>
                <div>
                  <dt>Definition path</dt>
                  <dd>
                    <code>
                      {[record.settings.nodePath, record.settings.name].filter(Boolean).join(' / ')}
                    </code>
                  </dd>
                </div>
                {record.candidateRevision !== undefined ? (
                  <div>
                    <dt>Studio revision</dt>
                    <dd>r{record.candidateRevision}</dd>
                  </div>
                ) : null}
                {record.snapshot ? (
                  <div>
                    <dt>Schema snapshot</dt>
                    <dd>
                      <code>{record.snapshot.schemaHash}</code>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {record.application?.issues.length ? (
                <ul aria-label="Validation details" className={styles.validationDetails}>
                  {record.application.issues.map((issue, index) => (
                    <li key={`${issue.code}:${issue.path}:${index}`}>
                      <code>{issue.path}</code>
                      <span>{issue.message}</span>
                      <small>{issue.code}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
            {record.application && !record.application.ready ? (
              <SchemaContentGaps issues={record.application.issues} />
            ) : null}
            <footer className={`${styles.footer} ${styles.resultFooter}`}>
              {record.status === 'generated' && record.snapshot ? (
                <SaveGeneratedCandidate
                  disabled={disabled || record.impact?.canAdopt === false}
                  onSave={async () => {
                    const saved = await generate(record.settings);
                    if (saved) onChanged?.();
                  }}
                />
              ) : null}
              <Link href={studioHref} aria-label="Open Schema Studio">
                Studio <ArrowUpRight aria-hidden="true" size={12} />
              </Link>
            </footer>
          </div>
          {error ? (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          ) : null}
        </div>
      </section>
    );
  return (
    <SettingsForm
      key={record.settingsId + ':' + record.revision}
      record={record}
      generating={generating}
      externalError={error}
      disabled={disabled}
      onSave={async (settings, discard) => {
        const saved = settings ? await generate(settings, discard) : await save(null);
        if (saved) onChanged?.();
      }}
      onResume={async () => {
        const saved = await generate(record.settings);
        if (saved) onChanged?.();
      }}
    />
  );
}

type ContentIssue = NonNullable<AssistantSchemaSettingsView['application']>['issues'][number];

/** A Schema definition is not YAML content; share the read-only Details presentation, not its mutations. */
export function AssistantSchemaSettingsDetails({
  record,
  projectId,
  workspaceId,
  onDiscuss,
}: {
  record: AssistantSchemaSettingsView;
  projectId: string;
  workspaceId: string;
  onDiscuss: () => void;
}) {
  const { settings } = record;
  const beforePath = [settings.nodePath, settings.name].filter(Boolean).join('/');
  const afterPath = [
    settings.targetNodePath ?? settings.nodePath,
    settings.newName ?? settings.name,
  ]
    .filter(Boolean)
    .join('/');
  const before = settings.action.startsWith('add_')
    ? undefined
    : (record.currentDefinition as TransitionProtocolValue | undefined);
  const after = settings.action.startsWith('remove_')
    ? undefined
    : (JSON.parse(JSON.stringify(schemaAttributes(record))) as TransitionProtocolValue);
  const applied = record.status === 'applied';
  return (
    <section
      className={`${detailsStyles.panel} ${styles.schemaDetails}`}
      aria-label="Selected Schema change details"
    >
      <div className={detailsStyles.context}>
        <div className={detailsStyles.revision}>
          {applied ? 'Saved to Draft' : 'Candidate · Not applied'}
        </div>
        <h2>{humanizeComposeIdentifier(settings.newName ?? settings.name)}</h2>
        <div className={detailsStyles.path}>
          <code title={afterPath}>{afterPath}</code>
        </div>
        <ComposeDetailValue
          key={record.settingsId + ':' + record.revision}
          value={after}
          unknown={false}
          label={applied ? 'Definition after selected change' : 'Proposed Schema definition'}
        />
        <div className={detailsStyles.selectedDelta}>
          <span>{changeLabel(settings.action)} · Schema definition</span>
          {!settings.action.startsWith('add_') && !record.currentDefinition ? (
            <p className={detailsStyles.helper}>
              The definition before this change is unavailable.
            </p>
          ) : (
            <ComposeObjectDelta
              before={before}
              after={after}
              beforePath={beforePath}
              afterPath={afterPath}
            />
          )}
        </div>
        <fieldset className={styles.detailActions} aria-label="Schema change actions">
          <Button
            type="button"
            variant="canvas-outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={onDiscuss}
          >
            <Sparkles aria-hidden="true" /> Ask AI
          </Button>
          <Button asChild variant="canvas-outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
            <Link
              href={
                getProjectIdRepoPath(projectId) +
                '?' +
                new URLSearchParams({
                  tab: 'schemas',
                  schemaView: 'studio',
                  workspace: workspaceId,
                })
              }
            >
              Open Schema Studio <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Button>
        </fieldset>
      </div>
      <div className={detailsStyles.body}>
        <section className={detailsStyles.reason}>
          <h3>Reason for this action</h3>
          <p>{settings.intent}</p>
          <span>
            {applied
              ? 'Schema saved to Draft and synced to Studio.'
              : 'This candidate has not been applied to the Draft.'}
          </span>
        </section>
        {record.application && !record.application.ready ? (
          <SchemaContentGaps issues={record.application.issues} />
        ) : null}
        {record.status === 'generated' && record.impact?.canAdopt === false ? (
          <p className={styles.warning}>
            Content migration is required before applying this candidate.
          </p>
        ) : null}
        <section className={detailsStyles.reason}>
          <h3>Schema snapshot</h3>
          <p>
            Base Schema: <code>{record.schemaHash}</code>
          </p>
          {record.snapshot ? (
            <p>
              Result Schema: <code>{record.snapshot.schemaHash}</code>
            </p>
          ) : null}
          {record.candidateRevision !== undefined ? (
            <p>Studio revision: r{record.candidateRevision}</p>
          ) : null}
          <p>YAML content is unchanged · No Commit created by this change</p>
        </section>
      </div>
    </section>
  );
}

function SchemaContentGaps({ issues }: { issues: ContentIssue[] }) {
  const requiredOnly = issues.length > 0 && issues.every(isRequiredGap);
  return (
    <section className={styles.contentGaps} aria-label="Content needs attention">
      <details className={styles.affectedItems}>
        <summary aria-label={`View affected items (${issues.length})`}>
          <CircleAlert aria-hidden="true" size={12} />
          <span>
            {requiredOnly
              ? `${issues.length} required ${issues.length === 1 ? 'value' : 'values'} to fill`
              : 'Content needs attention'}
          </span>
        </summary>
        <p className={styles.gapDescription}>
          The Schema is saved. Complete the content before Review can pass.
        </p>
        <ul>
          {issues.map((issue, index) => {
            const parts = issue.path.split('/').filter(Boolean);
            const field = humanizeComposeIdentifier(parts.at(-1) ?? 'Content');
            const context = parts.slice(0, -1).map(humanizeComposeIdentifier).join(' / ');
            return (
              <li key={`${issue.code}:${issue.path}:${index}`}>
                <span>
                  {issue.code === 'REQUIRED_SLOT_MISSING'
                    ? context || 'Content'
                    : context
                      ? `${context} / ${field}`
                      : field}
                </span>
                <small>
                  {issue.code === 'REQUIRED_SLOT_MISSING'
                    ? `${field} · Required`
                    : issue.code === 'REQUIRED_NODE_MISSING'
                      ? 'Required Node'
                      : issue.message}
                </small>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

function isRequiredGap(issue: ContentIssue) {
  return issue.code === 'REQUIRED_SLOT_MISSING' || issue.code === 'REQUIRED_NODE_MISSING';
}

function SaveGeneratedCandidate({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      {error ? (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      ) : null}
      <Button
        size="sm"
        disabled={disabled || saving}
        onClick={async () => {
          setSaving(true);
          setError(undefined);
          try {
            await onSave();
          } catch (failure) {
            setError(
              failure instanceof Error ? failure.message : 'Could not save Schema to Draft.'
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? 'Saving…' : 'Save Schema to Draft'}
      </Button>
    </>
  );
}

export function SettingsForm({
  record,
  disabled,
  generating = false,
  externalError,
  onSave,
  onResume,
}: {
  record: AssistantSchemaSettingsView;
  disabled: boolean;
  generating?: boolean;
  externalError?: string;
  onSave: (
    value: AssistantSchemaSettingsInput | null,
    discardStudioCandidate?: boolean
  ) => Promise<void>;
  onResume: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(record.settings);
  const [validation, setValidation] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const saving = submitting || generating;
  const [editing, setEditing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const removing = value.action.startsWith('remove_');
  const renaming = value.action.startsWith('rename_');
  const moving = value.action.startsWith('move_');
  const edited = JSON.stringify(value) !== JSON.stringify(record.settings);
  const confirmationParameters = {
    ...value.definition,
    ...(value.required !== undefined ? { required: value.required } : {}),
    ...(renaming ? { newName: value.newName } : {}),
    ...(moving ? { targetNodePath: value.targetNodePath || 'Root' } : {}),
    ...(value.unsetAttributes?.length ? { removedAttributes: value.unsetAttributes } : {}),
  };
  async function save(settings: AssistantSchemaSettingsInput | null, discard = false) {
    setSubmitting(true);
    setError(undefined);
    try {
      if (discard) await onSave(settings, true);
      else await onSave(settings);
      setConfirmDiscard(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save Schema to Draft.');
    } finally {
      setSubmitting(false);
    }
  }
  async function resume() {
    setSubmitting(true);
    setError(undefined);
    try {
      await onResume();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save Schema to Draft.');
    } finally {
      setSubmitting(false);
    }
  }
  const path = [value.nodePath, value.name].filter(Boolean).join(' / ');
  return (
    <section
      aria-label="Schema change candidate"
      className={`${styles.card} ${styles.confirmationCard}`}
    >
      <header className={styles.header}>
        <Braces aria-hidden="true" />
        <h3>
          {changeLabel(value.action)} · {value.name}
        </h3>
        <span className={styles.pendingStatus}>Candidate · Not applied</span>
      </header>
      <p className={styles.path} title={path}>
        {path}
      </p>
      {edited ? (
        <div>
          <p className={styles.warning}>
            Parameters updated. Impact will be recalculated when the candidate is generated.
          </p>
          <dl aria-label="Parameters to confirm" className="my-3 space-y-2 text-xs">
            {Object.entries(confirmationParameters).map(([key, item]) => (
              <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                <dt className="break-words font-medium">{key}</dt>
                <dd className="break-words">{settingText(item)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div className={styles.comparison}>
        <div>
          <small className="sr-only">Current bound Schema</small>
          <p>{record.currentDefinition ? value.name : 'Absent'}</p>
        </div>
        <ArrowRight size={12} aria-hidden="true" />
        <div>
          <small className="sr-only">Proposed definition</small>
          <p>
            {removing || renaming ? (
              <strong>{removing ? 'Remove definition' : value.newName}</strong>
            ) : null}{' '}
            <span className={styles.tag}>
              {value.action.endsWith('_slot')
                ? String(value.definition.type ?? record.currentDefinition?.type ?? 'any')
                : value.action.endsWith('_relation')
                  ? 'Relation type'
                  : value.action.endsWith('_rule')
                    ? 'Rule'
                    : 'Node'}
            </span>
            {(value.required ?? value.definition.required) ? (
              <span className={styles.tag}>required</span>
            ) : null}
            {value.definition.repeated ? <span className={styles.tag}>repeated</span> : null}
          </p>
        </div>
      </div>
      {record.studioConflict ? (
        <p className={styles.warning}>
          Studio has an unadopted candidate r{record.studioConflict.revision}. It will be kept
          unless you explicitly confirm replacing it.
        </p>
      ) : null}
      {removing ? (
        <p className={styles.warning}>
          Removes the definition only; existing YAML values are kept. Migration may be required.
        </p>
      ) : null}
      {renaming ? (
        <label>
          New name
          <Input
            aria-label="New name"
            value={value.newName ?? ''}
            disabled={disabled || saving || record.status !== 'pending'}
            onChange={(event) => setValue({ ...value, newName: event.target.value })}
          />
        </label>
      ) : null}
      {moving ? (
        <label>
          Destination Node
          <Input
            aria-label="Destination Node"
            value={value.targetNodePath ?? ''}
            disabled={disabled || saving || record.status !== 'pending'}
            onChange={(event) => setValue({ ...value, targetNodePath: event.target.value })}
          />
        </label>
      ) : null}
      {editing ? (
        <fieldset disabled={disabled || saving} className={styles.fields}>
          <SchemaChangeSettingsEditor
            value={value}
            referenceRelations={record.referenceRelations}
            onChange={setValue}
            onValidationChange={setValidation}
            onCancel={() => void save(null)}
          />
        </fieldset>
      ) : null}
      {record.status === 'confirmed' && !saving ? (
        <p>The previous attempt did not finish. Retry to validate and apply the Schema to Draft.</p>
      ) : null}
      {validation || error || externalError ? (
        <p role="alert" className={styles.warning}>
          {error ?? externalError ?? validation}
        </p>
      ) : null}
      <div className={styles.confirmationActions}>
        <details className={styles.technicalDetails}>
          <summary>
            <ChevronRight size={12} aria-hidden="true" /> Change details
          </summary>
          <p className={styles.scope}>YAML content stays unchanged · No Commit</p>
          <p>
            Confirm generates, validates and applies the Schema change to Draft using the exact
            bound snapshot. No content values are modified and no Commit is created.
          </p>
          {!edited && record.changes?.length ? (
            <ul aria-label="Proposed Schema changes" className={styles.validationDetails}>
              {record.changes.map((change) => (
                <li key={`${change.kind}:${change.path}`}>
                  <span>{change.summary}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!edited && record.impact ? (
            <p className={styles.warning}>
              {record.impact.items.filter((item) => item.affectedPaths.length).length} affected
              definition changes · {record.impact.status.replaceAll('_', ' ')}.
            </p>
          ) : null}
        </details>
        <footer className={styles.footer}>
          {['pending', 'queued'].includes(record.status) && !removing && !renaming && !moving ? (
            <button
              type="button"
              className={styles.edit}
              aria-label="Edit attributes"
              disabled={disabled || saving}
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              <ChevronDown size={14} aria-hidden="true" />
              Edit
            </button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || saving}
            onClick={() => void save(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={disabled || saving || !!validation}
            onClick={() => {
              if (record.studioConflict) setConfirmDiscard(true);
              else if (record.status === 'confirmed') void resume();
              else void save(value);
            }}
          >
            <Database size={14} aria-hidden="true" />
            {saving ? 'Applying…' : record.status === 'confirmed' ? 'Retry Confirm' : 'Confirm'}
          </Button>
        </footer>
      </div>
      {confirmDiscard ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!saving) setConfirmDiscard(open);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Replace the Studio candidate?</DialogTitle>
              <DialogDescription>
                Replace the unadopted Studio candidate r{record.studioConflict?.revision} with this
                confirmed Schema change and apply it to Draft after validation. YAML content stays
                unchanged and no Commit is created.
              </DialogDescription>
            </DialogHeader>
            {error ? <p role="alert">{error}</p> : null}
            <div className={styles.footer}>
              <Button variant="outline" disabled={saving} onClick={() => setConfirmDiscard(false)}>
                Keep Studio candidate
              </Button>
              <Button disabled={saving} onClick={() => void save(value, true)}>
                Replace & apply to Draft
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
