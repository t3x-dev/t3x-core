'use client';

import type {
  AssistantSchemaSettingsInput,
  AssistantSchemaSettingsView,
} from '@t3x-dev/api-client';
import {
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Database,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SchemaAdditionSettingsEditor } from '@/components/schemas/SchemaDefinitionStructure';
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
  const { record, error, save, generate } = useAssistantSchemaSettings(
    projectId,
    workspaceId,
    conversationId,
    refreshKey
  );
  return (
    <AssistantSchemaSettingsContent
      projectId={projectId}
      workspaceId={workspaceId}
      disabled={disabled}
      onChanged={onChanged}
      state={{ record, error, save, generate }}
    />
  );
}

/** Shared card presentation; the Compose owner places this record on its timeline. */
export function AssistantSchemaSettingsContent({
  projectId,
  workspaceId,
  disabled,
  onChanged,
  state,
}: {
  projectId: string;
  workspaceId: string;
  disabled: boolean;
  onChanged?: () => void;
  state: ReturnType<typeof useAssistantSchemaSettings>;
}) {
  const { record, error, save, generate } = state;
  if (!record || record.status === 'cancelled') return error ? <p role="alert">{error}</p> : null;
  const studioHref =
    getProjectIdRepoPath(projectId) +
    '?' +
    new URLSearchParams({ tab: 'schemas', schemaView: 'studio', workspace: workspaceId });
  if (record.status === 'generated' || record.status === 'applied')
    return (
      <section
        className={`${styles.card} ${styles.resultCard}`}
        aria-label={
          record.status === 'applied' ? 'Schema saved to Draft' : 'Schema candidate saved'
        }
      >
        <header className={`${styles.header} ${styles.resultHeader}`}>
          <Braces aria-hidden="true" />
          <span className={styles.badge}>Schema · Structure</span>
          <span className={styles.resultStatus} data-applied={record.status === 'applied'}>
            {record.status === 'applied' ? <Check aria-hidden="true" /> : null}
            {record.status === 'applied' ? 'Saved to Draft' : 'Candidate saved'}
          </span>
        </header>
        <div className={styles.resultBody}>
          <p className={styles.resultEyebrow}>
            {record.settings.action.startsWith('add_')
              ? record.settings.action.endsWith('_slot')
                ? 'Added field'
                : 'Added Node'
              : changeLabel(record.settings.action)}
            {record.settings.nodePath ? (
              <>
                {' '}
                in {record.settings.nodePath.split('/').map(humanizeComposeIdentifier).join(' / ')}
              </>
            ) : null}
          </p>
          <div className={styles.resultTitle}>
            <h3>{humanizeComposeIdentifier(record.settings.name)}</h3>
            <code>{record.settings.name}</code>
          </div>
          <ul className={styles.resultAttributes} aria-label="Definition attributes">
            {record.settings.action.endsWith('_slot') && record.settings.definition.type ? (
              <li>{humanizeComposeIdentifier(String(record.settings.definition.type))}</li>
            ) : null}
            {record.settings.required || record.settings.definition.required ? (
              <li>Required</li>
            ) : null}
            {record.settings.definition.repeated ? <li>Repeated</li> : null}
          </ul>
          <p className={styles.resultDescription}>
            {record.status === 'applied'
              ? 'Schema saved to the current Draft and synced to Studio.'
              : 'Saved in Studio. This candidate has not been applied to the Draft.'}
          </p>
          {record.application && !record.application.ready ? (
            <SchemaContentGaps issues={record.application.issues} />
          ) : null}
          {record.status === 'generated' && record.impact && !record.impact.canAdopt ? (
            <p className={styles.warning}>
              Content migration is required before saving this Schema. Open Studio to prepare the
              mapping; existing YAML content has not been changed.
            </p>
          ) : null}
          {record.changes?.length ? (
            <ul aria-label="Schema changes" className={styles.validationDetails}>
              {record.changes.map((change) => (
                <li key={`${change.kind}:${change.path}`}>
                  <span>{change.summary}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <details className={styles.technicalDetails}>
            <summary>
              <ChevronRight aria-hidden="true" />
              Technical details
            </summary>
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
          {error ? (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          ) : null}
        </div>
        <footer className={`${styles.footer} ${styles.resultFooter}`}>
          <span className={styles.resultScope}>YAML content is unchanged · No Commit created</span>
          {record.status === 'generated' && record.snapshot ? (
            <SaveGeneratedCandidate
              disabled={disabled || record.impact?.canAdopt === false}
              onSave={async () => {
                const saved = await generate(record.settings);
                if (saved) onChanged?.();
              }}
            />
          ) : null}
          <Link href={studioHref}>
            Open Schema Studio <ArrowUpRight aria-hidden="true" size={14} />
          </Link>
        </footer>
      </section>
    );
  return (
    <SettingsForm
      key={record.settingsId + ':' + record.revision}
      record={record}
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

function SchemaContentGaps({ issues }: { issues: ContentIssue[] }) {
  const requiredOnly = issues.length > 0 && issues.every(isRequiredGap);
  return (
    <section className={styles.contentGaps} aria-label="Content needs attention">
      <CircleAlert aria-hidden="true" size={17} />
      <div className={styles.gapBody}>
        <p className={styles.gapTitle}>
          {requiredOnly
            ? `${issues.length} required ${issues.length === 1 ? 'value' : 'values'} to fill`
            : 'Content needs attention'}
        </p>
        <p className={styles.gapDescription}>
          The Schema is saved. Complete the content before Review can pass.
        </p>
        {issues.length ? (
          <details className={styles.affectedItems}>
            <summary>
              <ChevronRight aria-hidden="true" />
              View affected items ({issues.length})
            </summary>
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
        ) : null}
      </div>
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
  onSave,
  onResume,
}: {
  record: AssistantSchemaSettingsView;
  disabled: boolean;
  onSave: (
    value: AssistantSchemaSettingsInput | null,
    discardStudioCandidate?: boolean
  ) => Promise<void>;
  onResume: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(record.settings);
  const [validation, setValidation] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const generic = record.generationMode === 'schema_yops_v1' || !value.action.startsWith('add_');
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
    setSaving(true);
    setError(undefined);
    try {
      if (discard) await onSave(settings, true);
      else await onSave(settings);
      setConfirmDiscard(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save Schema to Draft.');
    } finally {
      setSaving(false);
    }
  }
  async function resume() {
    setSaving(true);
    setError(undefined);
    try {
      await onResume();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save Schema to Draft.');
    } finally {
      setSaving(false);
    }
  }
  const path = [value.nodePath, value.name].filter(Boolean).join(' / ');
  return (
    <section aria-label="Schema change candidate" className={styles.card}>
      <header className={styles.header}>
        <Braces aria-hidden="true" />
        <span className={styles.badge}>Schema · Structure</span>
        <span>Candidate · Not applied</span>
      </header>
      <h3>
        {changeLabel(value.action)} · {value.name}
      </h3>
      <p className={styles.path}>{path}</p>
      {!edited && record.changes?.length ? (
        <ul aria-label="Proposed Schema changes" className={styles.validationDetails}>
          {record.changes.map((change) => (
            <li key={`${change.kind}:${change.path}`}>
              <span>{change.summary}</span>
            </li>
          ))}
        </ul>
      ) : null}
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
      ) : record.impact ? (
        <p className={styles.warning}>
          {record.impact.items.filter((item) => item.affectedPaths.length).length} affected
          definition changes · {record.impact.status.replaceAll('_', ' ')}. YAML content stays
          unchanged.
        </p>
      ) : null}
      <div className={styles.comparison}>
        <div>
          <small>Current bound Schema</small>
          <p>{record.currentDefinition ? value.name : 'Not defined'}</p>
        </div>
        <div>
          <small>Proposed definition</small>
          <p>
            <strong>
              {removing ? 'Remove definition' : renaming ? value.newName : value.name}
            </strong>{' '}
            <span className={styles.tag}>
              {value.action.endsWith('_slot')
                ? String(value.definition.type ?? record.currentDefinition?.type ?? 'any')
                : 'Node'}
            </span>
            {value.required || value.definition.required ? (
              <span className={styles.tag}>required</span>
            ) : null}
            {value.definition.repeated ? <span className={styles.tag}>repeated</span> : null}
          </p>
        </div>
      </div>
      <p>
        {generic
          ? 'Confirm the displayed change to generate and validate a Schema candidate from the exact bound snapshot. YAML content stays unchanged. Save the result separately; this does not Commit.'
          : 'Save this Schema to the current Draft from the exact bound snapshot and sync Studio. YAML content stays unchanged. This does not Commit.'}
      </p>
      {record.studioConflict ? (
        <p className={styles.warning}>
          Studio has an unadopted candidate r{record.studioConflict.revision}. It will be kept
          unless you explicitly confirm replacing it.
        </p>
      ) : null}
      {removing ? (
        <p className={styles.warning}>
          This removes the selected definition, not existing YAML content. Referenced definitions
          must remain valid; content migration or Review may still be required.
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
      {record.status === 'pending' && !removing && !renaming && !moving ? (
        <>
          <button
            type="button"
            className={styles.edit}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            <ChevronDown size={14} aria-hidden="true" />
            Edit attributes
          </button>
          {editing ? (
            <fieldset disabled={disabled || saving} className={styles.fields}>
              <SchemaAdditionSettingsEditor
                value={value}
                referenceRelations={record.referenceRelations}
                onChange={setValue}
                onValidationChange={setValidation}
                onCancel={() => void save(null)}
              />
            </fieldset>
          ) : null}
        </>
      ) : record.status === 'confirmed' ? (
        <p>
          Settings confirmed. Resume generating the candidate if the previous request was
          interrupted.
        </p>
      ) : null}
      {validation || error ? (
        <p role="alert" className={styles.warning}>
          {error ?? validation}
        </p>
      ) : null}
      <footer className={styles.footer}>
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
          {saving
            ? 'Saving…'
            : record.status === 'confirmed'
              ? generic
                ? 'Resume generating candidate'
                : 'Resume saving to Draft'
              : generic
                ? 'Confirm'
                : 'Save Schema to Draft'}
        </Button>
      </footer>
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
                confirmed Schema candidate. YAML content stays unchanged and no Commit is created.
              </DialogDescription>
            </DialogHeader>
            {error ? <p role="alert">{error}</p> : null}
            <div className={styles.footer}>
              <Button variant="outline" disabled={saving} onClick={() => setConfirmDiscard(false)}>
                Keep Studio candidate
              </Button>
              <Button disabled={saving} onClick={() => void save(value, true)}>
                {generic ? 'Replace & generate candidate' : 'Replace & save to Draft'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
