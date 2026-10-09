import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import * as yaml from 'js-yaml';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Expand,
  ListTree,
  Pencil,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  activityChannelLabel,
  type ComposeActivitySelection,
  expandComposeActivityCards,
} from '@/domain/composeActivity';
import {
  composeActorLabel,
  composeNodeTitle,
  composePathLabel,
} from '@/domain/composePresentation';
import { authoringSemanticContent } from '@/domain/workspaces/authoringReview';
import { composeDraftFields } from '@/domain/workspaces/composeDraftFields';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import { ComposeDraftValueEditor, isSimpleDraftValue } from './ComposeDraftValueEditor';
import styles from './ComposeFieldDetails.module.css';

function actorLabel(id: string) {
  return id === 'human:local-user' ? 'You' : composeActorLabel(id);
}

function valueLabel(value: unknown) {
  if (value === undefined) return 'Absent';
  if (typeof value === 'string') return value || 'Empty text';
  return JSON.stringify(value);
}

function valueType(value: unknown) {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function ValueDelta({ before, after }: { before: unknown; after: unknown }) {
  const beforeText = valueLabel(before);
  const afterText = valueLabel(after);
  if (beforeText === afterText) return <span className={styles.unchanged}>{afterText}</span>;
  return (
    <span className={styles.delta}>
      <del title={beforeText}>{beforeText}</del>
      <ArrowRight aria-hidden="true" />
      <ins title={afterText}>{afterText}</ins>
    </span>
  );
}

function DraftStructure({
  document,
  revision,
  onOpen,
  disabled,
}: {
  document: TransitionProtocolValue;
  revision?: number;
  onOpen: (view: 'structure' | 'yaml') => void;
  disabled: boolean;
}) {
  const [view, setView] = useState<'structure' | 'yaml'>('structure');
  const [notice, setNotice] = useState<string | null>(null);
  const fields = useMemo(() => composeDraftFields(document), [document]);
  const renderedYaml = useMemo(
    () =>
      yaml.dump(authoringSemanticContent(document) ?? document, {
        lineWidth: -1,
        noRefs: true,
        sortKeys: true,
      }),
    [document]
  );
  const copyYaml = async () => {
    try {
      await navigator.clipboard.writeText(renderedYaml);
      setNotice('YAML copied.');
    } catch {
      setNotice('Could not copy YAML. Select the text to copy it.');
    }
  };
  return (
    <div className={styles.structure}>
      <div className={styles.segment} role="group" aria-label="Details structure view">
        <button
          type="button"
          aria-pressed={view === 'structure'}
          onClick={() => setView('structure')}
        >
          <ListTree aria-hidden="true" /> Structure
        </button>
        <button type="button" aria-pressed={view === 'yaml'} onClick={() => setView('yaml')}>
          <Code2 aria-hidden="true" /> YAML
        </button>
      </div>
      {view === 'structure' ? (
        fields.length ? (
          <ul className={styles.tree} aria-label="Current Draft structure">
            {fields.map((field) => (
              <li
                key={field.path}
                style={{ paddingLeft: Math.min(field.depth, 5) * 12 }}
                title={field.path}
              >
                <span>{field.label}</span>
                <code>
                  {field.value !== null && typeof field.value === 'object'
                    ? valueType(field.value)
                    : valueLabel(field.value)}
                </code>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.helper}>No fields in the current draft.</p>
        )
      ) : (
        <div className={styles.yaml}>
          <header>
            <span>Current Draft r{revision ?? '—'}</span>
            <button type="button" aria-label="Copy YAML" onClick={() => void copyYaml()}>
              <Copy aria-hidden="true" />
            </button>
          </header>
          <pre>{renderedYaml}</pre>
        </div>
      )}
      {notice ? <output className={styles.helper}>{notice}</output> : null}
      <button
        className={styles.textButton}
        type="button"
        disabled={disabled}
        onClick={() => onOpen(view)}
      >
        <Expand aria-hidden="true" /> Open full view
      </button>
    </div>
  );
}

/** Details reads the current value separately from the selected immutable change. */
export function ComposeNodeHistoryPanel({
  activity,
  selection,
  onOpenAction,
  onDiscuss,
  onOpenStructure,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  selection: ComposeActivitySelection | null;
  onOpenAction: (actionId: string, nodeId: string, path?: string) => void;
  onDiscuss: () => void;
  onOpenStructure: (view: 'structure' | 'yaml') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const nodeId = selection?.operation.id;
  const selectedPath = selection?.operation.path;

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    setCopyNotice(null);
  }, [nodeId, selectedPath, selection?.meta.actionId]);
  useEffect(() => {
    if (nodeId) void activity.inspectNode(nodeId, selection?.meta.actionId);
  }, [
    activity.inspectNode,
    nodeId,
    selectedPath,
    selection?.meta.actionId,
    activity.compositionRevision,
  ]);

  if (!selection)
    return (
      <div className={styles.empty}>
        <ListTree aria-hidden="true" />
        <p>Select a changed field to see its current Draft value and history.</p>
      </div>
    );

  // Expanded bootstrap cards can share a container identity. Keep their field paths
  // and typed values instead of substituting an unrelated container's current value.
  const derivedEntries = activity.actions
    .flatMap((action) =>
      expandComposeActivityCards(activity.cards[action.actionId] ?? [])
        .filter((card) => card.path === selectedPath)
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
    )
    .sort((left, right) => right.sequence - left.sequence);
  const netCard = activity.view?.netDiff.find(
    (card) =>
      card.path === selectedPath ||
      card.beforePath === selectedPath ||
      card.afterPath === selectedPath
  );
  const matchedNode =
    activity.node &&
    (activity.node.path === selectedPath ||
      (activity.node.nodeId === nodeId &&
        activity.node.entries.some(
          (entry) => entry.beforePath === selectedPath || entry.afterPath === selectedPath
        )))
      ? activity.node
      : null;
  const current = netCard ? netCard.after : derivedEntries[0]?.after;
  const node =
    matchedNode ??
    (derivedEntries.length || netCard
      ? {
          nodeId: selection.operation.id,
          path: selection.operation.path,
          state: current === undefined ? ('deleted' as const) : ('present' as const),
          current,
          entries: derivedEntries,
        }
      : null);

  if (!node)
    return (
      <div className={styles.empty} role={activity.nodeError ? 'alert' : 'status'}>
        <p>
          {activity.nodeError ??
            (activity.nodeLoading
              ? 'Loading field details…'
              : 'Details are not available for this field.')}
        </p>
        {activity.nodeError ? (
          <button
            type="button"
            onClick={() =>
              void activity.inspectNode(selection.operation.id, selection.meta.actionId)
            }
          >
            Retry
          </button>
        ) : null}
      </div>
    );

  const latest = node.entries[0];
  const selectedAction =
    selection.meta.comparison === 'event'
      ? activity.actions.find((action) => action.actionId === selection.meta.actionId)
      : undefined;
  const selectedEntry =
    selection.meta.comparison === 'event'
      ? node.entries.find((entry) => entry.actionId === selection.meta.actionId)
      : undefined;
  const selectedReason =
    selectedAction?.reason ??
    (selection.meta.comparison === 'event' ? selection.operation.reason : undefined);
  const selectedActor = selectedAction?.actor.id ?? selection.meta.actor;
  const selectedChannel = selectedAction?.channel ?? selection.meta.channel;
  const selectedTime = selectedAction?.publishedAt ?? selection.meta.timestamp;
  const selectedCard = selectedAction
    ? expandComposeActivityCards(activity.cards[selectedAction.actionId] ?? []).find(
        (card) => card.path === selectedPath
      )
    : undefined;
  const comparison =
    selection.meta.comparison === 'draft'
      ? (netCard ?? { before: node.current, after: node.current })
      : (selectedCard ??
        selectedEntry ?? {
          before: selection.operation.beforeValue,
          after: selection.operation.afterValue,
        });
  const matchesBase = selection.meta.comparison === 'draft' && !netCard && node.state !== 'unknown';
  const path = node.path ?? selectedPath;
  const title =
    composeNodeTitle(node.current) ?? composePathLabel(path?.split('/slots/').at(-1), node.nodeId);
  const historyCursor = matchedNode ? activity.nodeCursor : activity.cursor;
  const historyLoading = matchedNode
    ? activity.nodeLoading
    : activity.loading || activity.nodeLoading;
  const canEdit =
    Boolean(path) &&
    node.state === 'present' &&
    isSimpleDraftValue(node.current) &&
    !activity.nodeError;
  const copyPath = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopyNotice('Field path copied.');
    } catch {
      setCopyNotice('Could not copy. Select the path to copy it.');
    }
  };
  const revertLatest = async () => {
    if (!path || !latest || saving) return;
    const operations: TransitionProtocolValue[] =
      latest.before === undefined
        ? [{ unset: { path } }]
        : [{ set: { path, value: latest.before } }];
    setSaving(true);
    setSaveError(null);
    try {
      await activity.publish({
        request_id: crypto.randomUUID(),
        operations,
        reason: 'Revert ' + title + ' to its previous value.',
      });
      await activity.inspectNode(node.nodeId, selection.meta.actionId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not revert this Draft value.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.panel} aria-label="Selected field details">
      <div className={styles.context}>
        <div className={styles.revision}>Draft r{activity.compositionRevision ?? '—'}</div>
        <h2>{title}</h2>
        <div className={styles.path}>
          <code title={path}>{path ?? 'Path unavailable'}</code>
          <button
            type="button"
            aria-label="Copy field path"
            disabled={!path}
            onClick={() => void copyPath()}
          >
            <Copy aria-hidden="true" />
          </button>
        </div>
        {copyNotice ? <output className={styles.helper}>{copyNotice}</output> : null}
        <div className={styles.currentLabel}>
          <span>Current Draft value</span>
          <span>{node.state === 'unknown' ? 'unknown' : valueType(node.current)}</span>
        </div>
        <div
          className={styles.currentValue}
          role="region"
          aria-label="Current Draft value"
          data-structured={!isSimpleDraftValue(node.current)}
        >
          {node.state === 'unknown' ? 'Unavailable' : valueLabel(node.current)}
        </div>
        <div className={styles.selectedDelta}>
          <span>
            {selection.meta.comparison === 'draft'
              ? 'Whole draft · Base → r' + (activity.compositionRevision ?? '—')
              : 'Selected action' +
                (selectedAction || selectedEntry
                  ? ' · A' + (selectedAction?.sequence ?? selectedEntry?.sequence)
                  : '')}
          </span>
          {matchesBase ? (
            <span>Matches Base · no change</span>
          ) : (
            <ValueDelta before={comparison.before} after={comparison.after} />
          )}
        </div>
        {!editing ? (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={saving || !canEdit}
              onClick={() => {
                setSaveError(null);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" /> Edit
            </button>
            <button className={styles.ask} type="button" disabled={saving} onClick={onDiscuss}>
              <Sparkles aria-hidden="true" /> Ask AI
            </button>
          </div>
        ) : null}
      </div>
      <div className={styles.body}>
        {editing && path ? (
          <ComposeDraftValueEditor
            key={path}
            activity={activity}
            path={path}
            current={node.current}
            onCancel={() => setEditing(false)}
            onBusyChange={setSaving}
            onSaved={async (result) => {
              if (result.kind !== 'no_change') setEditing(false);
              await activity.inspectNode(node.nodeId, selection.meta.actionId);
            }}
          />
        ) : null}
        {saveError || activity.nodeError ? (
          <p className={styles.error} role="alert">
            {saveError ?? activity.nodeError}
          </p>
        ) : null}
        {activity.notice ? (
          <p className={styles.helper} role="status">
            {activity.notice}
          </p>
        ) : null}
        {!editing && selectedReason ? (
          <section className={styles.reason}>
            <h3>Reason for this action</h3>
            <p>{selectedReason}</p>
            <span>
              {selectedActor ? actorLabel(selectedActor) + ' / ' : ''}
              {activityChannelLabel(selectedChannel)}
              {selectedTime
                ? ' · ' +
                  new Date(selectedTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </span>
          </section>
        ) : null}
        <details className={styles.disclosure}>
          <summary>
            <Clock3 aria-hidden="true" />
            <span>History</span>
            <small>
              {node.entries.length}
              {historyCursor !== null ? '+' : ''} {node.entries.length === 1 ? 'change' : 'changes'}
            </small>
            <ChevronRight aria-hidden="true" />
          </summary>
          <div className={styles.history}>
            {node.entries.map((entry) => (
              <button
                key={entry.actionId + ':' + entry.revision}
                className={styles.historyRow}
                data-selected={selection.meta.actionId === entry.actionId}
                type="button"
                disabled={saving || editing}
                aria-label={'View historical action A' + entry.sequence}
                onClick={() => onOpenAction(entry.actionId, entry.ownerNodeId, path)}
              >
                <span>
                  A{entry.sequence}
                  <small>
                    {actorLabel(entry.actor.id)} / {activityChannelLabel(entry.channel)}
                  </small>
                </span>
                <ValueDelta before={entry.before} after={entry.after} />
              </button>
            ))}
            {historyCursor === null && node.entries.length > 0 && !historyLoading ? (
              <div className={styles.initialValue}>
                <span>Before this workspace</span>
                <strong>{valueLabel(node.entries.at(-1)?.before)}</strong>
              </div>
            ) : null}
            {historyLoading ? (
              <p className={styles.helper} role="status">
                Loading history…
              </p>
            ) : null}
            {historyCursor !== null ? (
              <button
                className={styles.textButton}
                disabled={historyLoading}
                type="button"
                onClick={() =>
                  void (matchedNode
                    ? activity.loadOlderNode(node.nodeId, selection.meta.actionId)
                    : activity.loadOlder())
                }
              >
                Show earlier revisions
              </button>
            ) : null}
            <p className={styles.helper}>
              History records each saved change. Edit starts from today's Draft.
            </p>
            <button
              className={styles.textButton}
              type="button"
              disabled={saving || editing || !latest || !path || Boolean(activity.nodeError)}
              onClick={() => void revertLatest()}
            >
              <RotateCcw aria-hidden="true" /> Revert latest change
            </button>
          </div>
        </details>
        <details className={styles.disclosure}>
          <summary>
            <ListTree aria-hidden="true" />
            <span>Structure &amp; YAML</span>
            <ChevronRight aria-hidden="true" />
          </summary>
          {activity.view?.current !== undefined ? (
            <DraftStructure
              document={activity.view.current}
              revision={activity.compositionRevision}
              onOpen={onOpenStructure}
              disabled={editing || saving}
            />
          ) : (
            <p className={styles.helper}>Current draft structure is unavailable.</p>
          )}
        </details>
      </div>
      <footer className={styles.footer}>
        <span aria-hidden="true" /> Saved actions are kept in history.
      </footer>
    </div>
  );
}
