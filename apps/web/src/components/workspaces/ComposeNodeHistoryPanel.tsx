import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { ArrowRight, Clock3, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  activityChannelLabel,
  type ComposeActivitySelection,
  expandComposeActivityCards,
} from '@/domain/composeActivity';
import {
  composeActorLabel,
  composePathBreadcrumb,
  composePathLabel,
  composeValueChangeLabels,
  composeValueLabel,
} from '@/domain/composePresentation';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import styles from './WorkspaceComposeSurface.module.css';

function editorValue(value: unknown) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

function isSimpleNodeValue(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function parseEditorValue(value: string, current: unknown): TransitionProtocolValue {
  if (typeof current === 'number') {
    if (!value.trim()) throw new TypeError('Enter a number.');
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new TypeError('Enter a valid number.');
    return parsed;
  }
  if (typeof current === 'boolean') return value === 'true';
  return value;
}

function actorLabel(id: string) {
  return id === 'human:local-user' ? 'You' : composeActorLabel(id);
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
        parsed = parseEditorValue(value, activity.node?.current);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Enter a valid value.');
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

  const derivedEntries = activity.actions.flatMap((action) =>
    expandComposeActivityCards(activity.cards[action.actionId] ?? [])
      .filter((card) => card.path === selection.operation.path)
      .map((card) => ({
        actionId: action.actionId,
        sequence: action.sequence,
        revision: action.afterRevision,
        channel: action.channel,
        actor: action.actor,
        publishedAt: action.publishedAt,
        ownerNodeId: card.nodeId,
        beforePath: card.beforePath,
        afterPath: card.afterPath,
        before: card.before,
        after: card.after,
        isSelected: action.actionId === selection.meta.actionId,
      }))
  );
  const derivedNode = derivedEntries.length
    ? {
        nodeId: selection.operation.id,
        path: selection.operation.path,
        state: derivedEntries[0].after === undefined ? ('deleted' as const) : ('present' as const),
        current: composeValueChangeLabels(derivedEntries[0].before, derivedEntries[0].after).after,
        entries: derivedEntries,
      }
    : null;

  if (activity.nodeLoading && !derivedNode)
    return <p className={styles.nodeHistoryMessage}>Loading node history…</p>;
  if (activity.nodeError)
    return (
      <p className={styles.nodeHistoryMessage} role="alert">
        {activity.nodeError}
      </p>
    );
  const node =
    activity.node?.path === selection.operation.path
      ? activity.node
      : (derivedNode ?? activity.node);
  if (!node)
    return <p className={styles.nodeHistoryMessage}>No history is available for this field.</p>;
  const isDerivedNode = node === derivedNode;
  const latest = node.entries[0];
  return (
    <div className={styles.nodeHistory}>
      <div className={styles.nodeHistoryIdentity}>
        <span>NODE DETAIL</span>
        <strong>{composePathLabel(node.path, node.nodeId)}</strong>
        <small title={node.path ?? node.nodeId}>
          {composePathBreadcrumb(node.path, node.nodeId)}
        </small>
      </div>

      <section className={styles.currentNodeValue}>
        <span>CURRENT VALUE · DRAFT r{activity.compositionRevision ?? '—'}</span>
        <strong
          className={styles.nodeCurrentValue}
          title={composeValueLabel(node.current, 'Absent')}
        >
          {composeValueLabel(node.current, 'Absent')}
        </strong>
        <small>
          {latest
            ? `Latest: ${actorLabel(latest.actor.id)} · ${activityChannelLabel(latest.channel)} · may differ from selected action`
            : `No saved revisions · ${node.state}`}
        </small>
        {node.state === 'present' &&
        !isDerivedNode &&
        !editing &&
        isSimpleNodeValue(node.current) ? (
          <button onClick={startEditing} type="button">
            <Pencil aria-hidden="true" /> Edit current value
          </button>
        ) : null}
        {node.state === 'present' && !isDerivedNode && !isSimpleNodeValue(node.current) ? (
          <small>Edit an individual child field from its own change card.</small>
        ) : null}
      </section>

      {editing ? (
        <section className={styles.nodeEditor} aria-label="Edit current Draft value">
          <label>
            New value
            {typeof node.current === 'boolean' ? (
              <select value={value} onChange={(event) => setValue(event.target.value)}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : (
              <input
                inputMode={typeof node.current === 'number' ? 'decimal' : 'text'}
                type={typeof node.current === 'number' ? 'number' : 'text'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
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
          const actor = actorLabel(entry.actor.id);
          const values = composeValueChangeLabels(entry.before, entry.after);
          return (
            <article key={`${entry.actionId}:${entry.revision}`} data-selected={entry.isSelected}>
              <small>
                {new Date(entry.publishedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {actor} / {activityChannelLabel(entry.channel)}
              </small>
              <div className={styles.nodeHistoryDelta}>
                <span className={styles.nodeHistoryBefore} title={values.before}>
                  {values.before}
                </span>
                <ArrowRight aria-hidden="true" />
                <span className={styles.nodeHistoryAfter} title={values.after}>
                  {values.after}
                </span>
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
          Show earlier revisions
        </button>
      ) : null}
      <p className={styles.nodeHistoryFootnote}>
        History is immutable. Editing today’s value creates a new Action against the latest Draft.
      </p>
    </div>
  );
}
