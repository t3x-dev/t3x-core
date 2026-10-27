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
import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  activityChannelLabel,
  activityOperation,
  type ComposeActivitySelection,
  expandComposeActivityCards,
} from '@/domain/composeActivity';
import {
  composeActorLabel,
  composeNodeTitle,
  composePathLabel,
} from '@/domain/composePresentation';
import { authoringSemanticContent } from '@/domain/workspaces/authoringReview';
import {
  composeCardsAtPath,
  composeDraftChangeCards,
  composeDraftValueAtPath,
} from '@/domain/workspaces/composeDraftChanges';
import { composeDraftFields } from '@/domain/workspaces/composeDraftFields';
import {
  type ComposeObjectCard,
  composeObjectFieldChanges,
  composeObjectPath,
  composeValuesEqual,
  isComposeObject,
} from '@/domain/workspaces/composeObjectChanges';
import type { DraftYOp } from '@/domain/workspaces/draftStructure';
import { MANUAL_STAGING_EVENT_ID } from '@/domain/workspaces/manualStaging';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import { ComposeDraftObjectEditor } from './ComposeDraftObjectEditor';
import { ComposeDraftValueEditor, isSimpleDraftValue } from './ComposeDraftValueEditor';
import styles from './ComposeFieldDetails.module.css';
import { ComposeObjectFieldSummary } from './ComposeObjectFieldSummary';

function actorLabel(id: string) {
  return id === 'human:local-user' ? 'You' : composeActorLabel(id);
}

function valueLabel(value: unknown, formatted = false) {
  if (value === undefined) return 'Absent';
  if (typeof value === 'string') return value || 'Empty text';
  return JSON.stringify(value, null, formatted ? 2 : undefined);
}

function valueType(value: unknown) {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function currentValueFields(value: Record<string, unknown>) {
  const node =
    typeof value.key === 'string' && isPlainRecord(value.slots)
      ? { slots: value.slots, children: Array.isArray(value.children) ? value.children : [] }
      : null;
  const entries = Object.entries(node ? node.slots : value);
  const children = node
    ? node.children.map((child, index) =>
        isPlainRecord(child) && typeof child.key === 'string' ? child.key : `#${index + 1}`
      )
    : [];
  return { entries, children, nodeKey: node ? (value.key as string) : null };
}

function CurrentFieldValue({ name, value }: { name: string; value: unknown }) {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.length ? (
      <ul className={styles.currentList}>
        {value.map((item, index) => (
          <li key={`${index}:${item}`}>{item}</li>
        ))}
      </ul>
    ) : (
      <span className={styles.currentEmpty}>Empty list</span>
    );
  }
  if (typeof value === 'string' && !value) {
    return <span className={styles.currentEmpty}>Empty text</span>;
  }
  return (
    <ExpandableText
      text={valueLabel(value)}
      expandedText={valueLabel(value, true)}
      label={`Current ${name}`}
    />
  );
}

export function ComposeDetailValue({
  value,
  unknown,
  label = 'Current Draft value',
}: {
  value: unknown;
  unknown: boolean;
  label?: string;
}) {
  const [raw, setRaw] = useState(false);
  const type = unknown ? 'unknown' : valueType(value);
  const structured = !unknown && isPlainRecord(value);
  const fields = structured ? currentValueFields(value) : null;
  return (
    <>
      <div className={styles.currentLabel}>
        <span>{label}</span>
        <span className={styles.currentMeta}>
          {fields ? (
            <button
              type="button"
              aria-pressed={raw}
              className={styles.rawToggle}
              onClick={() => setRaw((next) => !next)}
            >
              <Code2 aria-hidden="true" /> {raw ? 'Fields' : 'JSON'}
            </button>
          ) : null}
          <span>{type}</span>
        </span>
      </div>
      {fields && !raw ? (
        <section className={styles.currentFields} aria-label={label} data-type={type}>
          {fields.entries.length ? (
            <dl>
              {fields.entries.map(([name, item]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    <CurrentFieldValue name={name} value={item} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className={styles.currentEmpty}>No fields yet</span>
          )}
          {fields.nodeKey !== null ? (
            <footer>
              <span>
                <ListTree aria-hidden="true" />
                {fields.children.length
                  ? `${fields.children.length} child ${fields.children.length === 1 ? 'object' : 'objects'}`
                  : 'No child objects'}
              </span>
              {fields.children.map((child) => (
                <code key={child}>{child}</code>
              ))}
            </footer>
          ) : null}
        </section>
      ) : (
        <div className={styles.currentValue} data-type={type}>
          <ExpandableText
            text={unknown ? 'Unavailable' : valueLabel(value, Boolean(fields))}
            expandedText={unknown ? 'Unavailable' : valueLabel(value, true)}
            label={label}
          />
        </div>
      )}
    </>
  );
}

function ExpandableText({
  text,
  expandedText,
  label,
  className = '',
  compact = false,
}: {
  text: string;
  expandedText?: string;
  label: string;
  className?: string;
  compact?: boolean;
}) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => setExpanded(false), [text]);
  useEffect(() => {
    const element = content.current;
    if (!element || expanded) return;
    const measure = () =>
      setOverflows(
        element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1
      );
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [expanded, text]);

  return (
    <section
      className={`${styles.expandable} ${className}`}
      aria-label={label}
      data-expanded={expanded}
      data-compact={compact}
    >
      <div className={styles.valueText} id={id} ref={content}>
        {expanded ? (expandedText ?? text) : text}
      </div>
      {overflows || expanded ? (
        <button
          className={styles.expandButton}
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Show less' : 'Show more'}: ${label}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </section>
  );
}

function ValueDelta({
  before,
  after,
  expandable = false,
}: {
  before: unknown;
  after: unknown;
  expandable?: boolean;
}) {
  const beforeText = valueLabel(before);
  const afterText = valueLabel(after);
  if (expandable) {
    if (beforeText === afterText)
      return <ExpandableText text={afterText} label="Unchanged value" compact />;
    return (
      <div className={styles.expandedDelta}>
        <ExpandableText
          text={beforeText}
          expandedText={valueLabel(before, true)}
          label="Before selected change"
          className={styles.beforeValue}
          compact
        />
        <ArrowRight aria-hidden="true" />
        <ExpandableText
          text={afterText}
          expandedText={valueLabel(after, true)}
          label="After selected change"
          className={styles.afterValue}
          compact
        />
      </div>
    );
  }
  if (beforeText === afterText)
    return (
      <span className={styles.unchanged} title={afterText}>
        {afterText}
      </span>
    );
  return (
    <span className={styles.delta}>
      <del title={beforeText}>{beforeText}</del>
      <ArrowRight aria-hidden="true" />
      <ins title={afterText}>{afterText}</ins>
    </span>
  );
}

export function ComposeObjectDelta({
  before,
  after,
  beforePath,
  afterPath,
}: {
  before: TransitionProtocolValue | undefined;
  after: TransitionProtocolValue | undefined;
  beforePath?: string;
  afterPath?: string;
}) {
  const fields =
    isComposeObject(before) || isComposeObject(after)
      ? composeObjectFieldChanges(before, after)
      : [
          ...new Set([
            ...Object.keys(isPlainRecord(before) ? before : {}),
            ...Object.keys(isPlainRecord(after) ? after : {}),
          ]),
        ]
          .filter(
            (key) =>
              !composeValuesEqual(
                isPlainRecord(before) ? before[key] : undefined,
                isPlainRecord(after) ? after[key] : undefined
              )
          )
          .map((key) => ({
            scope: 'structure',
            key,
            before: isPlainRecord(before) ? (before[key] as TransitionProtocolValue) : undefined,
            after: isPlainRecord(after) ? (after[key] as TransitionProtocolValue) : undefined,
          }));
  if (beforePath && afterPath && beforePath !== afterPath)
    fields.push({ scope: 'structure', key: 'path', before: beforePath, after: afterPath });
  return (
    <div className={styles.objectDelta}>
      {before === undefined || after === undefined ? (
        <p className={styles.helper}>Object {before === undefined ? 'added' : 'removed'}</p>
      ) : null}
      {fields.map((field) => (
        <section key={`${field.scope}:${field.key}`} aria-label={`Field change: ${field.key}`}>
          <h3>
            <code>{field.key}</code>
          </h3>
          <ValueDelta before={field.before} after={field.after} expandable />
        </section>
      ))}
      {!fields.length && before !== undefined && after !== undefined ? (
        <p className={styles.helper}>No field changes.</p>
      ) : null}
      <details className={styles.objectSnapshot}>
        <summary>Full object comparison</summary>
        <ValueDelta before={before} after={after} expandable />
      </details>
    </div>
  );
}

/** Shared selected-change presentation. Callers supply a live Draft or an immutable Commit. */
export function ComposeChangeContext({
  title,
  path,
  revisionLabel,
  current,
  unknown,
  currentLabel = 'Current Draft value',
  comparison,
  comparisonLabel,
  matchesBase = false,
  children,
}: {
  title: string;
  path?: string | null;
  revisionLabel: string;
  current: TransitionProtocolValue | undefined;
  unknown: boolean;
  currentLabel?: string;
  comparison: {
    before?: TransitionProtocolValue;
    after?: TransitionProtocolValue;
    beforePath?: string;
    afterPath?: string;
  };
  comparisonLabel: string;
  matchesBase?: boolean;
  children?: ReactNode;
}) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyPath = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopyNotice('Field path copied.');
    } catch {
      setCopyNotice('Could not copy. Select the path to copy it.');
    }
  };
  return (
    <div className={styles.context}>
      <div className={styles.revision}>{revisionLabel}</div>
      <h2>{title}</h2>
      <div className={styles.path}>
        <code title={path ?? undefined}>{path ?? 'Path unavailable'}</code>
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
      <ComposeDetailValue key={path} value={current} unknown={unknown} label={currentLabel} />
      <div className={styles.selectedDelta}>
        <span>{comparisonLabel}</span>
        {matchesBase ? (
          <span>Matches Base · no change</span>
        ) : isComposeObject(comparison.before) || isComposeObject(comparison.after) ? (
          <ComposeObjectDelta
            before={comparison.before}
            after={comparison.after}
            beforePath={comparison.beforePath}
            afterPath={comparison.afterPath}
          />
        ) : (
          <ValueDelta before={comparison.before} after={comparison.after} expandable />
        )}
      </div>
      {children}
    </div>
  );
}

export function ComposeChangeReason({
  reason,
  actor,
  channel,
  channelLabel,
  timestamp,
}: {
  reason: string;
  actor?: string;
  channel?: ComposeActivitySelection['meta']['channel'];
  channelLabel?: string;
  timestamp?: string;
}) {
  return (
    <section className={styles.reason}>
      <h3>Reason for this action</h3>
      <ExpandableText text={reason} label="Reason for this action" className={styles.reasonText} />
      <span>
        {actor ? actorLabel(actor) + ' / ' : ''}
        {channelLabel ?? activityChannelLabel(channel)}
        {timestamp
          ? ' · ' +
            new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : ''}
      </span>
    </section>
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
      <fieldset className={styles.segment} aria-label="Details structure view">
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
      </fieldset>
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
                <code title={valueLabel(field.value)}>
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
  onSubmit,
  workingCurrent,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  selection: ComposeActivitySelection | null;
  onOpenAction: (actionId: string, nodeId: string, path?: string) => void;
  onDiscuss: () => void;
  onOpenStructure: (view: 'structure' | 'yaml') => void;
  onSubmit?: (operations: DraftYOp[], reason: string) => Promise<boolean>;
  /** Pending local operations participate in editing, but never replace published history. */
  workingCurrent?: TransitionProtocolValue;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nodeId = selection?.operation.id;
  const selectedPath = selection?.operation.path;
  const isStaged = selection?.meta.eventId === MANUAL_STAGING_EVENT_ID;
  const isObject = Boolean(selection?.operation.objectChange);
  const nodeError = isStaged || isObject ? null : activity.nodeError;

  useEffect(() => {
    setEditing(Boolean(selection?.meta.editRequest));
    setSaveError(null);
  }, [nodeId, selectedPath, selection?.meta.actionId, selection?.meta.editRequest]);
  useEffect(() => {
    if (nodeId && !isStaged && !isObject)
      void activity.inspectNode(nodeId, selection?.meta.actionId);
  }, [
    activity.inspectNode,
    nodeId,
    selectedPath,
    selection?.meta.actionId,
    activity.compositionRevision,
    isStaged,
    isObject,
  ]);

  if (!selection)
    return (
      <div className={styles.empty}>
        <ListTree aria-hidden="true" />
        <p>Select a changed object to see its current Draft value and history.</p>
      </div>
    );

  // Follow only explicit projected relocations, never a matching key in another collection.
  const relatedPaths = new Set([selectedPath!]);
  const objectCards = activity.actions.flatMap((action) =>
    expandComposeActivityCards(activity.cards[action.actionId] ?? [])
  );
  if (isObject) {
    let added = true;
    while (added) {
      added = false;
      for (const card of objectCards) {
        const change = (card as ComposeObjectCard).objectChange;
        if (
          !change?.beforePath ||
          !change.afterPath ||
          (!relatedPaths.has(change.beforePath) && !relatedPaths.has(change.afterPath))
        )
          continue;
        for (const path of [change.beforePath, change.afterPath])
          if (!relatedPaths.has(path)) {
            relatedPaths.add(path);
            added = true;
          }
      }
    }
  }
  const cardsForSelection = (cards: ComposeObjectCard[]) =>
    isObject
      ? cards.filter(
          (card) =>
            relatedPaths.has(card.path) ||
            (card.beforePath !== undefined && relatedPaths.has(card.beforePath))
        )
      : composeCardsAtPath(cards, selectedPath!);
  const derivedEntries = activity.actions
    .flatMap((action) =>
      cardsForSelection(expandComposeActivityCards(activity.cards[action.actionId] ?? [])).map(
        (card) => ({
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
          path: card.path,
        })
      )
    )
    .sort((left, right) => right.sequence - left.sequence);
  const currentPath = isObject
    ? (derivedEntries[0]?.afterPath ?? derivedEntries[0]?.path ?? selectedPath)
    : selectedPath;
  const netCards = isObject
    ? composeDraftChangeCards(
        activity.view?.netDiff ?? [],
        activity.view?.base,
        activity.view?.current
      )
    : (activity.view?.netDiff ?? []);
  const netCard =
    composeCardsAtPath(netCards, currentPath!)[0] ??
    netCards.find(
      (card) =>
        card.path === selectedPath ||
        card.beforePath === selectedPath ||
        card.afterPath === selectedPath
    );
  const matchedNode =
    !isStaged &&
    !isObject &&
    activity.node &&
    (activity.node.path === selectedPath ||
      (activity.node.nodeId === nodeId &&
        activity.node.entries.some(
          (entry) => entry.beforePath === selectedPath || entry.afterPath === selectedPath
        )))
      ? activity.node
      : null;
  const current =
    activity.view?.current !== undefined && currentPath !== undefined
      ? composeDraftValueAtPath(activity.view.current, currentPath)
      : netCard
        ? netCard.after
        : derivedEntries[0]?.after;
  const node =
    matchedNode ??
    (isStaged || isObject || derivedEntries.length || netCard
      ? {
          nodeId: selection.operation.id,
          path: currentPath,
          state: current === undefined ? ('deleted' as const) : ('present' as const),
          current,
          entries: derivedEntries,
        }
      : null);

  if (!node)
    return (
      <div className={styles.empty} role={nodeError ? 'alert' : 'status'}>
        <p>
          {nodeError ??
            (activity.nodeLoading
              ? 'Loading field details…'
              : 'Details are not available for this field.')}
        </p>
        {nodeError ? (
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
    ? cardsForSelection(
        expandComposeActivityCards(activity.cards[selectedAction.actionId] ?? [])
      )[0]
    : undefined;
  const comparison =
    selection.meta.comparison === 'draft'
      ? (netCard ?? { before: node.current, after: node.current })
      : (selectedCard ??
        selectedEntry ?? {
          before: selection.operation.beforeValue,
          after: selection.operation.afterValue,
          beforePath: selection.operation.objectChange?.beforePath,
          afterPath: selection.operation.objectChange?.afterPath,
        });
  const matchesBase = selection.meta.comparison === 'draft' && !netCard && node.state !== 'unknown';
  const path = node.path ?? selectedPath;
  const title =
    composeNodeTitle(node.current) ?? composePathLabel(path?.split('/slots/').at(-1), node.nodeId);
  const historyCursor = matchedNode ? activity.nodeCursor : activity.cursor;
  const historyLoading = matchedNode
    ? activity.nodeLoading
    : activity.loading || (!isObject && activity.nodeLoading);
  const editValue =
    isObject && workingCurrent !== undefined && path !== undefined
      ? composeDraftValueAtPath(workingCurrent, path)
      : node.current;
  const editableObject = isObject && isComposeObject(editValue) ? editValue : null;
  const canEdit =
    !isStaged &&
    Boolean(path) &&
    node.state === 'present' &&
    (editableObject
      ? Object.keys(editableObject.slots).length > 0
      : !isObject && isSimpleDraftValue(node.current)) &&
    !nodeError;
  const editOpen = editing && canEdit;
  const editDisabledReason = saving
    ? 'Wait for the current change to finish saving.'
    : isStaged
      ? 'Save this change as a P before editing it again.'
      : !path
        ? 'This value has no field path available for editing.'
        : nodeError || node.state === 'unknown'
          ? 'The current value could not be loaded. Try again before editing.'
          : node.state !== 'present'
            ? 'This value is no longer present in the current Draft.'
            : editableObject && !Object.keys(editableObject.slots).length
              ? 'This object has no existing slots to edit. Use the structure editor to add fields.'
              : isObject && !editableObject
                ? 'This object is no longer available for value editing. Check the current structure.'
                : !editableObject && !isSimpleDraftValue(node.current)
                  ? 'Objects and arrays cannot be edited here. Select a text, number, or boolean field, or use Ask AI.'
                  : undefined;
  const latestCard =
    latest &&
    cardsForSelection(expandComposeActivityCards(activity.cards[latest.actionId] ?? []))[0];
  const latestSources = (latestCard as ComposeObjectCard | undefined)?.objectChange?.sources;
  const sourceRevertAvailable =
    !isObject ||
    Boolean(
      latestSources?.length &&
        (!latestCard?.beforePath ||
          !latestCard.afterPath ||
          latestCard.beforePath === latestCard.afterPath)
    );
  const revertOriginalPaths = Boolean(
    latestSources?.length &&
      latestSources.every(
        (source) =>
          (composeObjectPath(source.path, activity.view?.current) === path ||
            composeObjectPath(source.path, activity.view?.current).startsWith(`${path}/`)) &&
          (!source.beforePath || source.beforePath === source.path) &&
          (!source.afterPath || source.afterPath === source.path)
      )
  );
  const revertLatest = async () => {
    if (!path || !latest || saving) return;
    if (!sourceRevertAvailable) return;
    // Display aggregation must not turn a field revert into a whole-object write.
    const sources =
      isObject && revertOriginalPaths ? latestSources! : [{ path, before: latest.before }];
    const operations: TransitionProtocolValue[] = sources.map(
      (source): TransitionProtocolValue =>
        source.before === undefined
          ? { unset: { path: source.path } }
          : { set: { path: source.path, value: source.before } }
    );
    setSaving(true);
    setSaveError(null);
    try {
      await activity.publish({
        request_id: crypto.randomUUID(),
        operations,
        reason: 'Revert ' + title + ' to its previous value.',
      });
      if (!isObject) await activity.inspectNode(node.nodeId, selection.meta.actionId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not revert this Draft value.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={styles.panel}
      aria-label={isObject ? 'Selected object details' : 'Selected field details'}
    >
      <ComposeChangeContext
        key={`${path}:${selection.meta.actionId ?? 'draft'}`}
        title={title}
        path={path}
        revisionLabel={`Draft r${activity.compositionRevision ?? '—'}`}
        current={node.current}
        unknown={node.state === 'unknown'}
        comparison={comparison}
        matchesBase={matchesBase}
        comparisonLabel={
          isStaged
            ? 'Unsaved change · not yet applied to Draft'
            : selection.meta.comparison === 'draft'
              ? 'Whole draft · Base → r' + (activity.compositionRevision ?? '—')
              : 'Selected action' +
                (selectedAction || selectedEntry
                  ? ' · A' + (selectedAction?.sequence ?? selectedEntry?.sequence)
                  : '')
        }
      >
        {!editOpen ? (
          <div className={styles.actions}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={styles.editTrigger}
                  tabIndex={editDisabledReason ? 0 : undefined}
                  aria-label={editDisabledReason ? 'Edit unavailable' : undefined}
                >
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
                </span>
              </TooltipTrigger>
              {editDisabledReason ? (
                <TooltipContent side="top" align="start" sideOffset={6} className="max-w-72">
                  {editDisabledReason}
                </TooltipContent>
              ) : null}
            </Tooltip>
            <button className={styles.ask} type="button" disabled={saving} onClick={onDiscuss}>
              <Sparkles aria-hidden="true" /> Ask AI
            </button>
          </div>
        ) : null}
      </ComposeChangeContext>
      <div className={styles.body}>
        {editOpen && path ? (
          editableObject ? (
            <ComposeDraftObjectEditor
              key={path}
              activity={activity}
              path={path}
              slots={editableObject.slots}
              includesUngroupedChanges={!composeValuesEqual(editValue, node.current)}
              onCancel={() => setEditing(false)}
              onBusyChange={setSaving}
              onSubmit={onSubmit}
              onSaved={(result) => {
                if (result.kind !== 'no_change') setEditing(false);
              }}
            />
          ) : (
            <ComposeDraftValueEditor
              key={path}
              activity={activity}
              path={path}
              current={node.current}
              onCancel={() => setEditing(false)}
              onBusyChange={setSaving}
              onSubmit={onSubmit}
              onSaved={async (result) => {
                if (result.kind !== 'no_change') setEditing(false);
                await activity.inspectNode(node.nodeId, selection.meta.actionId);
              }}
            />
          )
        ) : null}
        {saveError || nodeError ? (
          <p className={styles.error} role="alert">
            {saveError ?? nodeError}
          </p>
        ) : null}
        {activity.notice ? <output className={styles.helper}>{activity.notice}</output> : null}
        {!editing && selectedReason ? (
          <ComposeChangeReason
            reason={selectedReason}
            actor={selectedActor}
            channel={selectedChannel}
            timestamp={selectedTime}
          />
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
                {isComposeObject(entry.before) || isComposeObject(entry.after) ? (
                  <ComposeObjectFieldSummary
                    operation={activityOperation({
                      nodeId: entry.ownerNodeId,
                      path: entry.afterPath ?? entry.beforePath ?? path ?? '',
                      before: entry.before,
                      after: entry.after,
                      objectChange: {
                        sources: [],
                        beforePath: entry.beforePath,
                        afterPath: entry.afterPath,
                      },
                    } as ComposeObjectCard)}
                    format={valueLabel}
                  />
                ) : (
                  <ValueDelta before={entry.before} after={entry.after} />
                )}
              </button>
            ))}
            {historyCursor === null && node.entries.length > 0 && !historyLoading ? (
              <div className={styles.initialValue}>
                <span>Before this workspace</span>
                <ExpandableText
                  text={valueLabel(node.entries.at(-1)?.before)}
                  expandedText={valueLabel(node.entries.at(-1)?.before, true)}
                  label="Before this workspace"
                  compact
                />
              </div>
            ) : null}
            {historyLoading ? <output className={styles.helper}>Loading history…</output> : null}
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
              disabled={
                isStaged ||
                saving ||
                editing ||
                !latest ||
                !path ||
                Boolean(nodeError) ||
                !sourceRevertAvailable
              }
              onClick={() => void revertLatest()}
            >
              <RotateCcw aria-hidden="true" /> Revert latest change
            </button>
            {isObject && latest && !sourceRevertAvailable ? (
              <p className={styles.helper}>
                This object was relocated. Use the structure editor to restore its location.
              </p>
            ) : null}
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
    </section>
  );
}
