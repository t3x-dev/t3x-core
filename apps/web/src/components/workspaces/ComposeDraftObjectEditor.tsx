import type { TransitionProtocolValue, WorkspaceAuthoringOutcome } from '@t3x-dev/api-client';
import { ArrowRight, X } from 'lucide-react';
import { type ChangeEvent, useId, useRef, useState } from 'react';
import { composeValuesEqual } from '@/domain/workspaces/composeObjectChanges';
import { composeObjectSlotEdits, composeSlotInput } from '@/domain/workspaces/composeObjectEditing';
import type { DraftYOp } from '@/domain/workspaces/draftStructure';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import styles from './ComposeFieldDetails.module.css';

export function ComposeDraftObjectEditor({
  activity,
  path,
  slots,
  onCancel,
  onSaved,
  onBusyChange,
  onSubmit,
  includesUngroupedChanges = false,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  path: string;
  slots: Record<string, TransitionProtocolValue>;
  onCancel: () => void;
  onSaved: (result: Pick<WorkspaceAuthoringOutcome, 'kind'>) => void | Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onSubmit?: (operations: DraftYOp[], reason: string) => Promise<boolean>;
  includesUngroupedChanges?: boolean;
}) {
  const id = useId();
  const [initial] = useState(() => ({
    slots,
    revision: activity.compositionRevision,
    workspaceRevision: activity.workspaceRevision,
  }));
  const [inputs, setInputs] = useState(() =>
    Object.fromEntries(Object.entries(slots).map(([key, value]) => [key, composeSlotInput(value)]))
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const identity = useRef<{ facts: string; id: string } | null>(null);
  const stale =
    activity.compositionRevision !== initial.revision ||
    activity.workspaceRevision !== initial.workspaceRevision ||
    !composeValuesEqual(slots, initial.slots);
  const edit = composeObjectSlotEdits(path, initial.slots, inputs);
  const invalid = Object.keys(edit.errors).length > 0;

  const save = async () => {
    if (pending.current || stale || invalid || !edit.operations.length) return;
    setError(null);
    if (!reason.trim()) {
      setError('Explain why these values are changing.');
      return;
    }
    pending.current = true;
    setSaving(true);
    onBusyChange(true);
    try {
      if (onSubmit) {
        if (await onSubmit(edit.operations, reason.trim())) await onSaved({ kind: 'published' });
        else setError('Could not stage these changes. Check the draft and try again.');
      } else {
        const facts = JSON.stringify({
          operations: edit.operations,
          reason: reason.trim(),
          initial,
        });
        const request =
          identity.current?.facts === facts ? identity.current : { facts, id: crypto.randomUUID() };
        identity.current = request;
        const result = await activity.publish({
          request_id: request.id,
          operations: edit.operations,
          reason: reason.trim(),
        });
        identity.current = null;
        await onSaved(result);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save these changes.');
    } finally {
      pending.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  };

  return (
    <section className={styles.objectEditor} aria-labelledby={`${id}-heading`}>
      <header>
        <h3 id={`${id}-heading`}>Edit current value</h3>
        <button type="button" aria-label="Close value editor" disabled={saving} onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
      </header>
      {includesUngroupedChanges ? (
        <p className={styles.helper}>These values include your ungrouped changes.</p>
      ) : null}
      {Object.entries(initial.slots).map(([key, current], index) => {
        const fieldId = `${id}-slot-${index}`;
        const fieldError = edit.errors[key];
        const structured = current === null || typeof current === 'object';
        const multiline =
          typeof current === 'string' && (current.includes('\n') || current.length > 120);
        const props = {
          id: fieldId,
          value: inputs[key],
          disabled: saving || stale,
          'aria-invalid': Boolean(fieldError),
          'aria-describedby': fieldError
            ? `${fieldId}-error`
            : structured
              ? `${fieldId}-hint`
              : undefined,
          onChange: (
            event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
          ) => {
            setInputs((values) => ({ ...values, [key]: event.target.value }));
            setError(null);
          },
        };
        return (
          <div className={styles.editorField} key={key}>
            <label htmlFor={fieldId}>{key}</label>
            {typeof current === 'boolean' ? (
              <select {...props}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : structured || multiline ? (
              <textarea {...props} rows={structured ? 4 : 3} data-json={structured} />
            ) : (
              <input
                {...props}
                type={typeof current === 'number' ? 'number' : 'text'}
                step={typeof current === 'number' ? 'any' : undefined}
              />
            )}
            {structured ? (
              <small id={`${fieldId}-hint`}>Enter the field value as JSON.</small>
            ) : null}
            {fieldError ? (
              <p className={styles.error} id={`${fieldId}-error`} role="alert">
                {fieldError}
              </p>
            ) : null}
          </div>
        );
      })}
      {!Object.keys(initial.slots).length ? (
        <p className={styles.helper}>This object has no existing slots to edit.</p>
      ) : null}
      <div className={styles.editorField}>
        <label htmlFor={`${id}-reason`}>Reason</label>
        <textarea
          id={`${id}-reason`}
          value={reason}
          rows={2}
          disabled={saving || stale}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <section className={styles.editorPreview} aria-label="Preview current to proposed">
        <p>Preview · current → proposed</p>
        {edit.changes.map((change) => (
          <div key={change.key}>
            <code>{change.key}</code>
            <div className={styles.expandedDelta}>
              <del className={styles.beforeValue}>{composeSlotInput(change.before)}</del>
              <ArrowRight aria-hidden="true" />
              <ins className={styles.afterValue}>{composeSlotInput(change.after)}</ins>
            </div>
          </div>
        ))}
        {!edit.changes.length ? <span>No value changes.</span> : null}
      </section>
      <p className={styles.helper}>
        {onSubmit
          ? 'Saving adds ungrouped changes to Latest. Save them as a P from the timeline.'
          : 'Saving appends a new Action. Earlier history stays intact.'}
      </p>
      {stale ? (
        <p className={styles.error} role="alert">
          The draft or ungrouped values changed. Cancel and reopen this object before saving.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.editorActions}>
        <button type="button" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || stale || invalid || !edit.operations.length}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save change'}
        </button>
      </div>
    </section>
  );
}
