import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { ArrowRight, Clock3, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  activityChannelLabel,
  activityValue,
  type ComposeActivitySelection,
} from '@/domain/composeActivity';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import styles from './WorkspaceComposeSurface.module.css';

function editorValue(value: unknown) {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

export function ComposeNodeHistoryPanel({
  activity,
  selection,
  onOpenAction,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  selection: ComposeActivitySelection | null;
  onOpenAction: (actionId: string, nodeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveIdentity = useRef<{ facts: string; id: string } | null>(null);
  const nodeId = selection?.operation.id;

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    if (nodeId) void activity.inspectNode(nodeId, selection?.meta.actionId);
  }, [activity.inspectNode, nodeId, selection?.meta.actionId]);

  const startEditing = () => {
    setValue(editorValue(activity.node?.current));
    setReason('');
    setSaveError(null);
    setEditing(true);
  };

  const save = async (remove = false) => {
    const path = activity.node?.path;
    if (!path) return;
    setSaveError(null);
    let parsed: unknown;
    if (!remove) {
      try {
        parsed = JSON.parse(value) as TransitionProtocolValue;
      } catch {
        setSaveError('Enter a valid JSON value. Text values need quotation marks.');
        return;
      }
    }
    if (!reason.trim()) {
      setSaveError('Explain why this value is changing.');
      return;
    }
    const operations: TransitionProtocolValue[] = remove
      ? [{ unset: { path } }]
      : [{ set: { path, value: parsed as TransitionProtocolValue } }];
    const facts = JSON.stringify({
      operations,
      reason: reason.trim(),
      revision: activity.compositionRevision,
    });
    const identity =
      saveIdentity.current?.facts === facts
        ? saveIdentity.current
        : { facts, id: crypto.randomUUID() };
    saveIdentity.current = identity;
    setSaving(true);
    try {
      const result = await activity.publish({
        request_id: identity.id,
        operations,
        reason: reason.trim(),
      });
      saveIdentity.current = null;
      if (result.kind !== 'no_change') setEditing(false);
      await activity.inspectNode(nodeId!, selection?.meta.actionId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this Draft action.');
    } finally {
      setSaving(false);
    }
  };

  if (!selection)
    return (
      <div className={styles.nodeHistoryEmpty}>
        <Clock3 aria-hidden="true" />
        <p>Select a changed field to inspect its current value and immutable Draft history.</p>
      </div>
    );

  if (activity.nodeLoading || (activity.node && activity.node.nodeId !== nodeId))
    return <p className={styles.nodeHistoryMessage}>Loading node history…</p>;
  if (activity.nodeError)
    return (
      <p className={styles.nodeHistoryMessage} role="alert">
        {activity.nodeError}
      </p>
    );
  if (!activity.node)
    return <p className={styles.nodeHistoryMessage}>No history is available for this field.</p>;

  const node = activity.node;
  return (
    <div className={styles.nodeHistory}>
      <div className={styles.nodeHistoryIdentity}>
        <span>NODE DETAIL</span>
        <strong>{node.path ?? node.nodeId}</strong>
        <small>{node.nodeId}</small>
      </div>

      <section className={styles.currentNodeValue}>
        <span>CURRENT VALUE · DRAFT r{activity.compositionRevision ?? '—'}</span>
        <pre>{activityValue(node.current)}</pre>
        <small>Current value is separate from the selected historical action · {node.state}</small>
        {node.state === 'present' && !editing ? (
          <button onClick={startEditing} type="button">
            <Pencil aria-hidden="true" /> Edit current value
          </button>
        ) : null}
      </section>

      {editing ? (
        <section className={styles.nodeEditor} aria-label="Edit current Draft value">
          <label>
            New value
            <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={5} />
          </label>
          <label>
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <p>Saving appends a new Action. Earlier values and authors remain unchanged.</p>
          {saveError ? <output role="alert">{saveError}</output> : null}
          <div>
            <button disabled={saving} onClick={() => setEditing(false)} type="button">
              Cancel
            </button>
            <button disabled={saving} onClick={() => void save(false)} type="button">
              {saving ? 'Saving…' : 'Save change'}
            </button>
            <button disabled={saving} onClick={() => void save(true)} type="button">
              <Trash2 aria-hidden="true" /> Remove value
            </button>
          </div>
        </section>
      ) : null}

      {activity.notice ? <p className={styles.nodeHistoryNotice}>{activity.notice}</p> : null}

      <div className={styles.nodeHistoryHeading}>
        <strong>Revision history</strong>
        <span>{node.entries.length} saved changes</span>
      </div>
      <div className={styles.nodeHistoryTimeline}>
        {node.entries.map((entry) => {
          const action = activity.actions.find((item) => item.actionId === entry.actionId);
          const actor = entry.actor.id === 'human:local-user' ? 'You' : entry.actor.id;
          return (
            <article key={`${entry.actionId}:${entry.revision}`} data-selected={entry.isSelected}>
              <small>
                {new Date(entry.publishedAt).toLocaleString()} · {actor} ·{' '}
                {activityChannelLabel(entry.channel)}
              </small>
              <div>
                <code>{activityValue(entry.before)}</code>
                <ArrowRight aria-hidden="true" />
                <code>{activityValue(entry.after)}</code>
              </div>
              {action?.reason ? <p>{action.reason}</p> : null}
              <button onClick={() => onOpenAction(entry.actionId, entry.ownerNodeId)} type="button">
                View action · #{entry.sequence}
              </button>
            </article>
          );
        })}
      </div>
      {activity.nodeCursor !== null ? (
        <button
          className={styles.loadNodeHistory}
          disabled={activity.nodeLoading}
          onClick={() => void activity.loadOlderNode(node.nodeId, selection.meta.actionId)}
          type="button"
        >
          Load earlier revisions
        </button>
      ) : null}
      <p className={styles.nodeHistoryFootnote}>
        History is immutable. Editing today’s value creates a new Action against the latest Draft.
      </p>
    </div>
  );
}
