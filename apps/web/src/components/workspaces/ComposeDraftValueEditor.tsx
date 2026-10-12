import type { TransitionProtocolValue, WorkspaceAuthoringOutcome } from '@t3x-dev/api-client';
import { Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { DraftYOp, DraftYValue } from '@/domain/workspaces/draftStructure';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import styles from './WorkspaceComposeSurface.module.css';

export function isSimpleDraftValue(value: unknown) {
  return (
    value === undefined || value === null || ['string', 'number', 'boolean'].includes(typeof value)
  );
}

/** The field dialog and node history publish through the same Draft action path. */
export function ComposeDraftValueEditor({
  activity,
  path,
  current,
  onCancel,
  onSaved,
  onBusyChange,
  onSubmit,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  path: string;
  current: unknown;
  onCancel: () => void;
  onSaved: (result: Pick<WorkspaceAuthoringOutcome, 'kind'>) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  /** Stages the edit as an ungrouped manual card instead of publishing an action. */
  onSubmit?: (operations: DraftYOp[], reason: string) => Promise<boolean>;
}) {
  const id = useId();
  const [value, setValue] = useState(current == null ? '' : String(current));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision] = useState(activity.compositionRevision);
  const identity = useRef<{ facts: string; id: string } | null>(null);
  const pending = useRef(false);
  const stale = activity.compositionRevision !== revision;

  const save = async (remove: boolean) => {
    if (pending.current || stale) return;
    setError(null);
    let parsed: TransitionProtocolValue = value;
    if (!remove && typeof current === 'number') {
      if (!value.trim() || !Number.isFinite(Number(value))) {
        setError('Enter a valid number.');
        return;
      }
      parsed = Number(value);
    } else if (!remove && typeof current === 'boolean') {
      parsed = value === 'true';
    }
    if (!reason.trim()) {
      setError('Explain why this value is changing.');
      return;
    }
    if (onSubmit) {
      const staged: DraftYOp[] = remove
        ? [{ unset: { path } }]
        : [{ set: { path, value: parsed as DraftYValue } }];
      setSaving(true);
      onBusyChange?.(true);
      try {
        if (await onSubmit(staged, reason.trim())) await onSaved({ kind: 'published' });
      } finally {
        setSaving(false);
        onBusyChange?.(false);
      }
      return;
    }
    const operations: TransitionProtocolValue[] = remove
      ? [{ unset: { path } }]
      : [{ set: { path, value: parsed } }];
    const facts = JSON.stringify({ operations, reason: reason.trim(), revision });
    const request =
      identity.current?.facts === facts ? identity.current : { facts, id: crypto.randomUUID() };
    identity.current = request;
    pending.current = true;
    setSaving(true);
    onBusyChange?.(true);
    try {
      const result = await activity.publish({
        request_id: request.id,
        operations,
        reason: reason.trim(),
      });
      identity.current = null;
      await onSaved(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this Draft action.');
    } finally {
      pending.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  };

  return (
    <section className={styles.nodeEditor} aria-label="Edit current Draft value">
      <label htmlFor={`${id}-value`}>
        New value
        {typeof current === 'boolean' ? (
          <select
            id={`${id}-value`}
            value={value}
            disabled={saving || stale}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : typeof current === 'string' && current.includes('\n') ? (
          <textarea
            id={`${id}-value`}
            value={value}
            disabled={saving || stale}
            rows={5}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            id={`${id}-value`}
            value={value}
            disabled={saving || stale}
            type={typeof current === 'number' ? 'number' : 'text'}
            step={typeof current === 'number' ? 'any' : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </label>
      <label htmlFor={`${id}-reason`}>
        Reason
        <input
          id={`${id}-reason`}
          value={reason}
          disabled={saving || stale}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <p>
        {onSubmit
          ? 'Saving adds an ungrouped card to Latest. Save it as a P from the timeline.'
          : 'Saving appends a new Action. Earlier values and authors remain unchanged.'}
      </p>
      {stale ? (
        <output role="alert">The draft changed. Cancel and reopen this field before saving.</output>
      ) : null}
      {error ? <output role="alert">{error}</output> : null}
      <div>
        <button disabled={saving} onClick={onCancel} type="button">
          Cancel
        </button>
        <button disabled={saving || stale} onClick={() => void save(false)} type="button">
          {saving ? 'Saving…' : 'Save change'}
        </button>
        <button disabled={saving || stale} onClick={() => void save(true)} type="button">
          <Trash2 aria-hidden="true" /> Remove value
        </button>
      </div>
    </section>
  );
}
