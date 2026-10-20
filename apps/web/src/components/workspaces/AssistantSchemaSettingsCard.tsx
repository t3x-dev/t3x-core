'use client';

import type {
  AssistantSchemaSettingsInput,
  AssistantSchemaSettingsView,
} from '@t3x-dev/api-client';
import Link from 'next/link';
import { useState } from 'react';
import { SchemaAdditionSettingsEditor } from '@/components/schemas/SchemaDefinitionStructure';
import { Button } from '@/components/ui/button';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useAssistantSchemaSettings } from '@/hooks/schemas/useAssistantSchemaSettings';

export function AssistantSchemaSettingsCard({
  projectId,
  workspaceId,
  conversationId,
  refreshKey,
  disabled,
  onConfirmed,
}: {
  projectId: string;
  workspaceId: string;
  conversationId?: string;
  refreshKey: string;
  disabled: boolean;
  onConfirmed: (id: string, intent: string) => void;
}) {
  const { record, error, save } = useAssistantSchemaSettings(
    projectId,
    workspaceId,
    conversationId,
    refreshKey
  );
  if (!record || record.status === 'cancelled')
    return error ? (
      <output className="px-3 text-xs text-[var(--text-secondary)]">{error}</output>
    ) : null;
  const studioHref = `${getProjectIdRepoPath(projectId)}?${new URLSearchParams({ tab: 'schemas', schemaView: 'studio', workspace: workspaceId })}`;
  if (record.status === 'generated')
    return (
      <section
        aria-label="Schema candidate saved"
        className="mx-3 rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-3 text-xs"
      >
        <strong>Schema candidate saved</strong>
        <p>Open Studio to check its current status, review the difference and prepare content.</p>
        <Link className="text-[var(--color-brand)]" href={studioHref}>
          Open Schema Studio →
        </Link>
      </section>
    );
  return (
    <SettingsForm
      key={`${record.settingsId}:${record.revision}`}
      record={record}
      disabled={disabled}
      onSave={async (settings) => {
        const saved = await save(settings);
        if (!saved) return;
        if (settings) onConfirmed(saved.settingsId, saved.settings.intent);
      }}
      onResume={() => onConfirmed(record.settingsId, record.settings.intent)}
    />
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
  onSave: (value: AssistantSchemaSettingsInput | null) => Promise<void>;
  onResume: () => void;
}) {
  const [value, setValue] = useState(record.settings);
  const [validation, setValidation] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function save(settings: AssistantSchemaSettingsInput | null) {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(settings);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      aria-label="Confirm Schema settings"
      className="mx-3 my-2 flex max-h-[55vh] min-h-0 flex-col rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-3 text-xs"
    >
      <header className="mb-2 space-y-1">
        <strong>{value.action === 'add_slot' ? 'New Slot settings' : 'New Node settings'}</strong>
        <p>
          Parent: {value.nodePath || 'Schema root'}. Confirmation generates a candidate only; it
          does not apply or Commit.
        </p>
      </header>
      {record.status === 'pending' ? (
        <fieldset disabled={disabled || saving} className="min-h-0 overflow-y-auto">
          <SchemaAdditionSettingsEditor
            value={value}
            onChange={setValue}
            onValidationChange={setValidation}
            onCancel={() => void save(null)}
          />
        </fieldset>
      ) : (
        <p>
          Settings confirmed. Continue to generate the candidate if the previous request was
          interrupted.
        </p>
      )}
      {validation || error ? (
        <p role="alert" className="my-2 text-[var(--color-danger)]">
          {error ?? validation}
        </p>
      ) : null}
      <footer className="mt-3 flex flex-wrap justify-end gap-2">
        {record.status === 'pending' ? (
          <>
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
              onClick={() => void save(value)}
            >
              {saving ? 'Saving…' : 'Confirm & generate candidate'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || saving}
              onClick={() => void save(null)}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={disabled || saving} onClick={onResume}>
              Continue generating candidate
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}
