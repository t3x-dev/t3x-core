import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { Clock3, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  activityChannelLabel,
  type ComposeActivitySelection,
  expandComposeActivityCards,
} from '@/domain/composeActivity';
import {
  composeActorLabel,
  composeNodeTitle,
  composePathBreadcrumb,
  composePathLabel,
  composeTextDiff,
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

  const save = async (remove = false) => {
    const path = activity.node?.path ?? selection?.operation.path;
    if (!path) return;
    setSaveError(null);
    let parsed: unknown;
    if (!remove) {
      try {
        parsed = parseEditorValue(value, activity.node?.current ?? value);
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
  const latest = node.entries[0];
  const startEditingCurrent = () => {
    setValue(editorValue(node.current));
    setReason('');
    setSaveError(null);
    setEditing(true);
  };
  const revertLatest = async () => {
    const path = node.path;
    if (!path || !latest) return;
    const operations: TransitionProtocolValue[] =
      latest.before === undefined
        ? [{ unset: { path } }]
        : [{ set: { path, value: latest.before as TransitionProtocolValue } }];
    const revertReason = `Revert ${composePathLabel(node.path, node.nodeId)} to its previous value.`;
    setSaving(true);
    setSaveError(null);
    try {
      await activity.publish({
        request_id: crypto.randomUUID(),
        operations,
        reason: revertReason,
      });
      await activity.inspectNode(node.nodeId, selection.meta.actionId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not revert this Draft value.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.nodeHistory}>
      <div className={styles.nodeHistoryScroll}>
        <header className={styles.historySummary}>
          <small>NODE HISTORY · WITHIN THIS DRAFT</small>
          <strong>
            {composeNodeTitle(node.current) ?? composePathLabel(node.path, node.nodeId)}
          </strong>
          <div>
            Now{' '}
            <b title={composeValueLabel(node.current, 'Absent')}>
              {composeValueLabel(node.current, 'Absent')}
            </b>{' '}
            · {node.entries.length} changes in this draft
          </div>
        </header>

        {editing ? (
          <section className={styles.nodeEditor} aria-label="Edit current Draft value">
            <label htmlFor="compose-node-value">
              New value
              {typeof node.current === 'boolean' ? (
                <select
                  id="compose-node-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <input
                  id="compose-node-value"
                  inputMode={typeof node.current === 'number' ? 'decimal' : 'text'}
                  type={typeof node.current === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
            </label>
            <label htmlFor="compose-node-reason">
              Reason
              <input
                id="compose-node-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
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

        <div className={styles.historyCards}>
          {node.entries.map((entry) => {
            const action = activity.actions.find((item) => item.actionId === entry.actionId);
            const actor = actorLabel(entry.actor.id);
            const values = composeValueChangeLabels(entry.before, entry.after);
            const parts = composeTextDiff(values.before, values.after);
            const changed = (kind: 'added' | 'removed') =>
              [
                ...new Set(
                  parts.filter((part) => part.kind === kind).map((part) => part.text.trim())
                ),
              ]
                .filter(Boolean)
                .join(' … ') || '—';
            const added = entry.before === undefined;
            const removed = entry.after === undefined;
            return (
              <article
                className={styles.historyCard}
                key={`${entry.actionId}:${entry.revision}`}
                data-selected={entry.isSelected}
                data-channel={entry.channel}
              >
                <header>
                  <strong>{action?.reason || `Change #${entry.sequence}`}</strong>
                  <span data-kind={added ? 'added' : removed ? 'removed' : 'changed'}>
                    {added ? 'Added' : removed ? 'Removed' : 'Changed'}
                  </span>
                </header>
                <small className={styles.historyPath} title={node.path ?? node.nodeId}>
                  {composePathBreadcrumb(node.path, node.nodeId)}
                </small>
                <div className={styles.historyValues}>
                  {!added && (
                    <del title={values.before}>{removed ? values.before : changed('removed')}</del>
                  )}
                  {!added && !removed && <span>→</span>}
                  {!removed && (
                    <ins title={values.after}>{added ? values.after : changed('added')}</ins>
                  )}
                </div>
                <footer>
                  <span className={styles.historyAvatar}>
                    {entry.channel === 'assistant' ? '✦' : actor.slice(0, 1).toUpperCase()}
                  </span>
                  <small>
                    {actor} · {activityChannelLabel(entry.channel)} ·{' '}
                    {new Date(entry.publishedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                  <button
                    type="button"
                    onClick={() => onOpenAction(entry.actionId, entry.ownerNodeId)}
                  >
                    In feed ↗
                  </button>
                </footer>
              </article>
            );
          })}
          {activity.nodeCursor === null && node.entries.length > 0 && (
            <article className={styles.historyBase}>
              <strong>Before this draft</strong>
              <small>Initial value</small>
              <span>{composeValueLabel(node.entries.at(-1)?.before, 'Absent')}</span>
            </article>
          )}
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
      </div>
      <div className={styles.nodeActionBar}>
        <button
          disabled={
            saving || editing || node.state !== 'present' || !isSimpleNodeValue(node.current)
          }
          onClick={startEditingCurrent}
          type="button"
        >
          <Pencil aria-hidden="true" /> Edit
        </button>
        <button
          disabled={saving || editing || !latest}
          onClick={() => void revertLatest()}
          type="button"
        >
          <RotateCcw aria-hidden="true" /> Revert
        </button>
        <span>
          <kbd>J</kbd>
          <kbd>K</kbd>
          navigate
        </span>
      </div>
    </div>
  );
}
