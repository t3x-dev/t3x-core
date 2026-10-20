'use client';

import type {
  AssistantSchemaSettingsInput,
  AssistantSchemaSettingsView,
} from '@t3x-dev/api-client';
import { Braces, ChevronDown, Database } from 'lucide-react';
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
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useAssistantSchemaSettings } from '@/hooks/schemas/useAssistantSchemaSettings';
import styles from './AssistantSchemaSettingsCard.module.css';

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
        className={styles.card}
        aria-label={
          record.status === 'applied' ? 'Schema saved to Draft' : 'Schema candidate saved'
        }
      >
        <header className={styles.header}>
          <Braces aria-hidden="true" />
          <span className={styles.badge}>Schema · Structure</span>
          <span>{record.status === 'applied' ? 'Saved to Draft' : 'Schema candidate saved'}</span>
        </header>
        <h3>
          {record.settings.action === 'add_slot' ? 'Add Slot' : 'Add Node'} · {record.settings.name}
        </h3>
        <p>
          {record.status === 'applied'
            ? `Schema saved to the current Draft and synced to Studio r${record.candidateRevision}. YAML content is unchanged. No Commit was created.`
            : `Candidate r${record.candidateRevision} is saved in Studio, but has not been applied to the Draft.`}
        </p>
        {record.application && !record.application.ready ? (
          <div className={styles.warning}>
            <p>Schema saved. Complete the required content before Review can pass.</p>
            <ul>
              {record.application.issues.map((issue, index) => (
                <li key={`${issue.code}:${issue.path}:${index}`}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className={styles.path}>
          {[record.settings.nodePath, record.settings.name].filter(Boolean).join(' / ')}
        </p>
        {record.snapshot ? (
          <p className={styles.path}>Snapshot: {record.snapshot.schemaHash}</p>
        ) : null}
        {error ? (
          <p role="alert" className={styles.warning}>
            {error}
          </p>
        ) : null}
        <footer className={styles.footer}>
          {record.status === 'generated' && record.snapshot ? (
            <SaveGeneratedCandidate
              disabled={disabled}
              onSave={async () => {
                const saved = await generate(record.settings);
                if (saved) onChanged?.();
              }}
            />
          ) : null}
          <Link href={studioHref}>Open Schema Studio →</Link>
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
        {value.action === 'add_slot' ? 'Add Slot' : 'Add Node'} · {value.name}
      </h3>
      <p className={styles.path}>{path}</p>
      <div className={styles.comparison}>
        <div>
          <small>Current bound Schema</small>
          <p>Not defined</p>
        </div>
        <div>
          <small>Proposed definition</small>
          <p>
            <strong>{value.name}</strong>{' '}
            <span className={styles.tag}>
              {value.action === 'add_slot' ? String(value.definition.type ?? 'any') : 'Node'}
            </span>
            {value.required || value.definition.required ? (
              <span className={styles.tag}>required</span>
            ) : null}
            {value.definition.repeated ? <span className={styles.tag}>repeated</span> : null}
          </p>
        </div>
      </div>
      <p>
        Save this Schema to the current Draft from the exact bound snapshot and sync Studio. YAML
        content stays unchanged. This does not Commit.
      </p>
      {record.studioConflict ? (
        <p className={styles.warning}>
          Studio has an unadopted candidate r{record.studioConflict.revision}. It will be kept
          unless you explicitly confirm replacing it.
        </p>
      ) : null}
      {record.status === 'pending' ? (
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
                onChange={setValue}
                onValidationChange={setValidation}
                onCancel={() => void save(null)}
              />
            </fieldset>
          ) : null}
        </>
      ) : (
        <p>Settings confirmed. Resume saving to Draft if the previous request was interrupted.</p>
      )}
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
              ? 'Resume saving to Draft'
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
                Replace the unadopted Studio candidate r{record.studioConflict?.revision} and save
                this Schema directly to the current Draft. Studio will sync automatically. YAML
                content stays unchanged and no Commit is created.
              </DialogDescription>
            </DialogHeader>
            {error ? <p role="alert">{error}</p> : null}
            <div className={styles.footer}>
              <Button variant="outline" disabled={saving} onClick={() => setConfirmDiscard(false)}>
                Keep Studio candidate
              </Button>
              <Button disabled={saving} onClick={() => void save(value, true)}>
                Replace &amp; save to Draft
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
