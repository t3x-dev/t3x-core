'use client';

import { CheckCircle as PhCheckCircle, Tilde as PhTilde } from '@phosphor-icons/react';
import type { MergeDecision } from '@t3x-dev/core';
import { ChevronLeft, ChevronRight, Copy, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { shortHash } from '@/domain/format/formatters';
import {
  type ApiPullRequestMergeReview,
  type ApiPullRequestMergeReviewNode,
  type ApiPullRequestMergeReviewSlot,
  buildMergeReviewDecision,
  changedSlots,
  choicesFromDecision,
  chooseSideForRemaining,
  chosenSlotValue,
  formatSlotValue,
  isNodeResolved,
  isPresenceConflict,
  type MergeChoices,
  type MergeNodeChoice,
  type MergeSlotChoice,
  summarizeMergeReview,
} from '@/domain/project/pullRequestMergeReview';
import { cn } from '@/utils/cn';
import detailStyles from './ProjectReviewsDetail.module.css';
import styles from './PullRequestMergeReview.module.css';

export interface MergeResolutionProgress {
  total: number;
  unresolved: number;
}

export interface MergeReviewLoadState {
  review: ApiPullRequestMergeReview | null;
  loading: boolean;
  error: string | null;
}
export type MergeDecisionSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface PullRequestMergeReviewPanelProps {
  projectId: string;
  pullRequest: {
    number: number;
    mergeDraftId?: string;
    sourceBranch: string;
    targetBranch: string;
    sourceCommitId: string;
    targetBaseCommitId: string;
  };
  fetchMergeReview: (projectId: string, number: number) => Promise<ApiPullRequestMergeReview>;
  saveMergeDecision: (
    draftId: string,
    decisions: MergeDecision,
    expectedRevision: number
  ) => Promise<number>;
  onResolutionChange: (decision: MergeDecision | null, progress: MergeResolutionProgress) => void;
  onReviewChange?: (state: MergeReviewLoadState) => void;
  onSaveStateChange?: (state: MergeDecisionSaveState) => void;
  readOnly?: boolean;
  onRerun: () => void;
  rerunning: boolean;
}

function statusLabel(
  status: ApiPullRequestMergeReviewNode['status'],
  sourceBranch: string,
  targetBranch: string
) {
  if (status === 'conflict') return 'Conflict';
  if (status === 'source_only') return `Added in ${sourceBranch}`;
  if (status === 'target_only') return `Only in ${targetBranch}`;
  return 'Auto-merged';
}

const displayPath = (path: string) => path.replaceAll('/', '.');

export function PullRequestMergeReviewPanel({
  projectId,
  pullRequest,
  fetchMergeReview,
  saveMergeDecision,
  onResolutionChange,
  onReviewChange,
  onSaveStateChange,
  readOnly = false,
  onRerun,
  rerunning,
}: PullRequestMergeReviewPanelProps) {
  const [review, setReview] = useState<ApiPullRequestMergeReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [choices, setChoices] = useState<MergeChoices>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<MergeDecisionSaveState>('idle');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const inspectorRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);
  const editVersion = useRef(0);
  const revision = useRef(0);
  const dirty = useRef(false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const draftId = pullRequest.mergeDraftId;
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    setLoadError(null);
    setReview(null);
    fetchMergeReview(projectId, pullRequest.number)
      .then((loaded) => {
        if (cancelled) return;
        const restored = choicesFromDecision(loaded, loaded.decisions);
        revision.current = loaded.decision_revision;
        dirty.current = false;
        setReview(loaded);
        setChoices(restored);
        setSelectedPath(
          loaded.nodes.find(
            (node) => node.status === 'conflict' && !isNodeResolved(node, restored[node.path])
          )?.path ??
            loaded.nodes[0]?.path ??
            null
        );
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : 'Could not load the merge review.');
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, fetchMergeReview, projectId, pullRequest.number, loadAttempt]);

  useEffect(() => {
    onReviewChange?.({
      review,
      loading: Boolean(draftId && !review && !loadError),
      error: loadError,
    });
  }, [draftId, review, loadError, onReviewChange]);
  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  const conflicts = useMemo(
    () => review?.nodes.filter((node) => node.status === 'conflict') ?? [],
    [review]
  );
  const outcome = useMemo(
    () => (review ? buildMergeReviewDecision(review, choices) : null),
    [choices, review]
  );

  useEffect(() => {
    if (!outcome) return;
    onResolutionChange(
      conflicts.length > 0 && outcome.unresolved.length === 0 ? outcome.decision : null,
      { total: conflicts.length, unresolved: outcome.unresolved.length }
    );
  }, [conflicts.length, onResolutionChange, outcome]);

  useEffect(() => {
    if (!outcome || !draftId || !dirty.current || readOnly) return;
    const version = editVersion.current;
    const timer = window.setTimeout(() => {
      saving.current = saving.current
        .then(() => saveMergeDecision(draftId, outcome.decision, revision.current))
        .then((next) => {
          revision.current = next;
          if (version !== editVersion.current) return;
          dirty.current = false;
          setSaveError(null);
          setSaveState('saved');
        })
        .catch((error) => {
          if (version !== editVersion.current) return;
          setSaveError(
            error instanceof Error ? error.message : 'Could not save the conflict decisions.'
          );
          setSaveState('error');
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftId, outcome, readOnly, saveAttempt, saveMergeDecision]);

  const updateChoices = (next: MergeChoices) => {
    if (readOnly) return;
    dirty.current = true;
    editVersion.current += 1;
    setSaveError(null);
    setSaveState('saving');
    setChoices(next);
  };
  const selectNode = (path: string) => {
    setSelectedPath(path);
    if (window.matchMedia?.('(max-width: 1050px)').matches) {
      window.requestAnimationFrame(() => {
        inspectorRef.current?.scrollIntoView({ block: 'start' });
        inspectorRef.current?.focus({ preventScroll: true });
      });
    }
  };
  const updateNode = (path: string, update: (current: MergeNodeChoice) => MergeNodeChoice) =>
    updateChoices({ ...choices, [path]: update(choices[path] ?? { slots: {} }) });

  if (!draftId) {
    return (
      <div className={styles.emptyState}>
        <p>The merge has not been prepared for these commits yet.</p>
        {!readOnly ? (
          <button
            className={styles.primaryButton}
            disabled={rerunning}
            onClick={onRerun}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={rerunning ? 'animate-spin' : undefined} />
            {rerunning ? 'Preparing…' : 'Prepare merge'}
          </button>
        ) : null}
      </div>
    );
  }
  if (loadError)
    return (
      <div className={styles.emptyState}>
        <p role="alert">{loadError}</p>
        <button
          className={styles.secondaryButton}
          onClick={() => setLoadAttempt((value) => value + 1)}
          type="button"
        >
          Retry comparison
        </button>
      </div>
    );
  if (!review || !outcome) return <div className={styles.emptyState}>Loading merge review…</div>;
  if (review.nodes.length === 0 && !review.schema_merge) {
    return <div className={styles.emptyState}>These commits merge without any field changes.</div>;
  }

  const visibleNodes = conflictsOnly ? conflicts : review.nodes;
  const selected = visibleNodes.find((node) => node.path === selectedPath) ?? visibleNodes[0];
  const unresolved = new Set(outcome.unresolved);
  const conflictIndex = selected ? conflicts.findIndex((node) => node.path === selected.path) : -1;
  const summary = summarizeMergeReview(review);

  const goToConflict = (direction: 1 | -1) => {
    if (conflicts.length === 0) return;
    const start = conflictIndex === -1 ? (direction === 1 ? -1 : 0) : conflictIndex;
    const next = conflicts[(start + direction + conflicts.length) % conflicts.length];
    if (next) selectNode(next.path);
  };

  return (
    <div className={detailStyles.changesLayout}>
      <section className={detailStyles.diffPanel}>
        <div className={cn(detailStyles.diffToolbar, styles.toolbar)}>
          <div>
            <span className={detailStyles.addedCount}>＋ {summary.added} added</span>
            <span className={detailStyles.modifiedCount}>∿ {summary.autoMerged} auto-merged</span>
            <span className={detailStyles.conflictCount}>
              ! {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
              {conflicts.length > 0 ? ` · ${unresolved.size} open` : ''}
            </span>
          </div>
          <div className={detailStyles.viewSwitch}>
            <button
              aria-pressed={!conflictsOnly}
              className={!conflictsOnly ? detailStyles.viewActive : undefined}
              onClick={() => setConflictsOnly(false)}
              type="button"
            >
              All
            </button>
            <button
              aria-pressed={conflictsOnly}
              className={conflictsOnly ? detailStyles.viewActive : undefined}
              disabled={conflicts.length === 0}
              onClick={() => setConflictsOnly(true)}
              type="button"
            >
              Conflicts
            </button>
          </div>
        </div>
        {conflicts.length > 0 && !readOnly ? (
          <div className={styles.bulkActions}>
            <span>{unresolved.size} unresolved</span>
            <button
              onClick={() => updateChoices(chooseSideForRemaining(review, choices, 'target'))}
              type="button"
            >
              Keep {pullRequest.targetBranch}
            </button>
            <button
              onClick={() => updateChoices(chooseSideForRemaining(review, choices, 'source'))}
              type="button"
            >
              Use {pullRequest.sourceBranch}
            </button>
            <button
              disabled={Object.keys(choices).length === 0}
              onClick={() => updateChoices({})}
              type="button"
            >
              Reset
            </button>
          </div>
        ) : null}
        <section
          aria-label="Changes comparison"
          className={detailStyles.treeWrap}
          ref={tableRef}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll this comparison region.
          tabIndex={0}
        >
          {review.schema_merge ? (
            <section className={styles.schemaChanges} aria-label="Schema changes">
              <header>
                <strong>Schema changes · {review.schema_merge.changes.length}</strong>
                <code title={review.schema_merge.schema_hash}>
                  {shortHash(review.schema_merge.schema_hash)}
                </code>
              </header>
              <p>Combined Schema · not yet merged</p>
              <ul>
                {review.schema_merge.changes.map((change) => (
                  <li key={change.path} title={change.summary}>
                    <span>
                      {change.kind === 'ADD' ? '+' : change.kind === 'REMOVE' ? '−' : '~'}
                    </span>
                    <code>{change.path}</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <table className={detailStyles.tree}>
            <colgroup>
              <col className={detailStyles.pathColumn} />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Path</th>
                <th>
                  {pullRequest.targetBranch}
                  <code>@ {shortHash(pullRequest.targetBaseCommitId)}</code>
                </th>
                <th>
                  {pullRequest.sourceBranch}
                  <code>@ {shortHash(pullRequest.sourceCommitId)}</code>
                </th>
                <th>Merged result</th>
              </tr>
            </thead>
            <tbody>
              {visibleNodes.map((node) => (
                <MergeNodeRows
                  choice={choices[node.path]}
                  key={node.path}
                  node={node}
                  onSelect={() => selectNode(node.path)}
                  selected={node.path === selected?.path}
                  sourceBranch={pullRequest.sourceBranch}
                  targetBranch={pullRequest.targetBranch}
                  unresolved={unresolved.has(node.path)}
                />
              ))}
            </tbody>
          </table>
        </section>
      </section>

      <aside
        aria-label="Change inspector"
        className={detailStyles.inspector}
        ref={inspectorRef}
        tabIndex={-1}
      >
        {selected ? (
          <section className={detailStyles.inspectorCard}>
            <button
              className={styles.backToChanges}
              onClick={() => {
                tableRef.current?.scrollIntoView({ block: 'start' });
                tableRef.current
                  ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
                  ?.focus({ preventScroll: true });
              }}
              type="button"
            >
              <ChevronLeft aria-hidden="true" />
              Back to changes
            </button>
            <div className={detailStyles.inspectorHeader}>
              <h2>
                {selected.status === 'conflict'
                  ? readOnly
                    ? 'Recorded decision'
                    : 'Resolve conflict'
                  : 'Selected change'}
              </h2>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(displayPath(selected.path));
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                }}
                type="button"
              >
                <Copy aria-hidden="true" />
                {copied ? 'Copied' : 'Copy path'}
              </button>
            </div>
            <div className={detailStyles.inspectorBody}>
              <code className={detailStyles.selectedPath}>{displayPath(selected.path)}</code>
              <span
                className={
                  selected.status === 'conflict'
                    ? detailStyles.decisionBadge
                    : detailStyles.changeBadge
                }
              >
                <PhTilde aria-hidden="true" />
                {selected.status === 'conflict'
                  ? unresolved.has(selected.path)
                    ? readOnly
                      ? 'No recorded decision'
                      : 'Needs decision'
                    : readOnly
                      ? 'Recorded'
                      : 'Decided'
                  : statusLabel(
                      selected.status,
                      pullRequest.sourceBranch,
                      pullRequest.targetBranch
                    )}
              </span>
              {selected.status === 'conflict' ? (
                <div>
                  <ConflictEditor
                    choice={choices[selected.path] ?? { slots: {} }}
                    node={selected}
                    readOnly={readOnly}
                    onChange={(update) => updateNode(selected.path, update)}
                    sourceBranch={pullRequest.sourceBranch}
                    targetBranch={pullRequest.targetBranch}
                  />
                </div>
              ) : (
                <AutoMergedFields
                  node={selected}
                  sourceBranch={pullRequest.sourceBranch}
                  targetBranch={pullRequest.targetBranch}
                />
              )}
              {conflicts.length > 0 ? (
                <div className={styles.conflictNav}>
                  <button onClick={() => goToConflict(-1)} type="button">
                    <ChevronLeft aria-hidden="true" />
                    Previous
                  </button>
                  <span>
                    {conflicts.length - unresolved.size} of {conflicts.length} decided
                  </span>
                  <button onClick={() => goToConflict(1)} type="button">
                    Next conflict
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              {saveError ? (
                <div className={styles.saveError} role="alert">
                  <p>{saveError}</p>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => {
                      setSaveError(null);
                      setSaveState('saving');
                      setSaveAttempt((value) => value + 1);
                    }}
                    type="button"
                  >
                    Retry saving
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function MergeNodeRows({
  choice,
  node,
  onSelect,
  selected,
  sourceBranch,
  targetBranch,
  unresolved,
}: {
  choice: MergeNodeChoice | undefined;
  node: ApiPullRequestMergeReviewNode;
  onSelect: () => void;
  selected: boolean;
  sourceBranch: string;
  targetBranch: string;
  unresolved: boolean;
}) {
  const slots = changedSlots(node);
  const presence = isPresenceConflict(node);
  const nodeValue = (present: boolean) =>
    present ? '' : node.presence.base ? 'node removed' : 'not on this branch';
  return (
    <>
      <tr
        className={cn(
          styles.nodeRow,
          selected && detailStyles.treeSelected,
          unresolved && detailStyles.treeConflict
        )}
        onClick={onSelect}
      >
        <td>
          <span className={detailStyles.treeField}>
            <span className={detailStyles.typeIcon} data-type="object">
              {'{ }'}
            </span>
            <button
              aria-label={`Inspect ${displayPath(node.path)}`}
              aria-pressed={selected}
              className={styles.nodeButton}
              type="button"
            >
              {displayPath(node.path)}
            </button>
          </span>
        </td>
        <td className={styles.muted}>{nodeValue(node.presence.target)}</td>
        <td className={styles.muted}>{nodeValue(node.presence.source)}</td>
        <td>
          <span className={styles.statusTag} data-status={node.status}>
            {node.status === 'conflict' && !unresolved
              ? 'Decided'
              : statusLabel(node.status, sourceBranch, targetBranch)}
          </span>
          {presence && choice?.node ? (
            <span className={styles.muted}>
              {' '}
              · keep {choice.node === 'source' ? sourceBranch : targetBranch}
            </span>
          ) : null}
        </td>
      </tr>
      {slots.map((slot) => {
        const merged = chosenSlotValue(slot, choice?.slots[slot.key]);
        const open = slot.conflict && !merged.resolved && !presence;
        return (
          <tr
            className={cn(selected && detailStyles.treeSelected, open && detailStyles.treeConflict)}
            key={slot.key}
            onClick={onSelect}
          >
            <td>
              <span className={detailStyles.treeField} style={{ paddingLeft: 22 }}>
                <span className={detailStyles.typeIcon} data-type={slotType(slot)}>
                  {slotType(slot) === 'number'
                    ? '123'
                    : slotType(slot) === 'boolean'
                      ? 'T/F'
                      : 'abc'}
                </span>
                <b>{slot.key}</b>
              </span>
            </td>
            <ValueCell value={slot.target} />
            <ValueCell value={slot.source} />
            <td>
              {open ? (
                <span className={styles.choosePill}>
                  <PhTilde aria-hidden="true" weight="bold" />
                  Choose value
                </span>
              ) : presence ? (
                <span className={styles.muted}>whole node</span>
              ) : (
                <span className={styles.mergedCell}>
                  <PhCheckCircle aria-hidden="true" className={detailStyles.okIcon} weight="fill" />
                  <ValueText value={merged.value} />
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function slotType(slot: ApiPullRequestMergeReviewSlot) {
  const value = slot.source ?? slot.target ?? slot.base;
  return typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
}

function ValueText({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (value === undefined) return <span className={styles.muted}>(empty)</span>;
  const text = formatSlotValue(value);
  const long = text.length > 160 || text.split('\n').length > 3;
  const preview = text.split('\n').slice(0, 3).join('\n').slice(0, 160);
  return (
    <span className={styles.valueBlock}>
      <span className={styles.valueText}>{long && !expanded ? `${preview}…` : text}</span>
      {long ? (
        <button
          aria-expanded={expanded}
          className={styles.expandValue}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(!expanded);
          }}
          type="button"
        >
          {expanded ? 'Show less' : 'Show full value'}
        </button>
      ) : null}
    </span>
  );
}

function ValueCell({ value }: { value: unknown }) {
  return (
    <td>
      <ValueText value={value} />
    </td>
  );
}

function ConflictEditor({
  choice,
  node,
  readOnly,
  onChange,
  sourceBranch,
  targetBranch,
}: {
  choice: MergeNodeChoice;
  node: ApiPullRequestMergeReviewNode;
  readOnly: boolean;
  onChange: (update: (current: MergeNodeChoice) => MergeNodeChoice) => void;
  sourceBranch: string;
  targetBranch: string;
}) {
  if (isPresenceConflict(node)) {
    const removedBy = node.presence.source ? targetBranch : sourceBranch;
    return (
      <div className={styles.slotDecision}>
        <p className={styles.hint}>
          {removedBy} removed this node while the other branch changed it. Keep one side.
        </p>
        <div className={styles.options} role="radiogroup" aria-label={`Resolve ${node.path}`}>
          {(['target', 'source'] as const).map((side) => (
            <label className={cn(choice.node === side && styles.optionActive)} key={side}>
              <input
                disabled={readOnly}
                checked={choice.node === side}
                name={`node:${node.path}`}
                onChange={() => onChange((current) => ({ ...current, node: side }))}
                type="radio"
              />
              <span>
                {side === 'target' ? `Keep ${targetBranch}` : `Use ${sourceBranch}`}
                <small>
                  {(side === 'target' ? node.presence.target : node.presence.source)
                    ? 'Keep the node with this branch’s values.'
                    : 'Remove the node.'}
                </small>
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  const setSlot = (key: string, next: MergeSlotChoice) =>
    onChange((current) => ({ ...current, slots: { ...current.slots, [key]: next } }));
  const autoSlots = changedSlots(node).filter((slot) => !slot.conflict);
  return (
    <>
      {node.slots
        .filter((slot) => slot.conflict)
        .map((slot) => {
          const current = choice.slots[slot.key];
          return (
            <div className={styles.slotDecision} key={slot.key}>
              <span className={detailStyles.fieldLabel}>{slot.key}</span>
              <div className={styles.baseValue}>
                <span>Common ancestor</span>
                <ValueText value={slot.base} />
              </div>
              <div className={styles.options} role="radiogroup" aria-label={`Resolve ${slot.key}`}>
                <label className={cn(current?.kind === 'target' && styles.optionActive)}>
                  <input
                    disabled={readOnly}
                    aria-label={`Keep ${targetBranch} for ${slot.key}`}
                    checked={current?.kind === 'target'}
                    name={`${node.path}:${slot.key}`}
                    onChange={() => setSlot(slot.key, { kind: 'target' })}
                    type="radio"
                  />
                  <span>
                    Keep {targetBranch}
                    <ValueText value={slot.target} />
                  </span>
                </label>
                <label className={cn(current?.kind === 'source' && styles.optionActive)}>
                  <input
                    disabled={readOnly}
                    aria-label={`Use ${sourceBranch} for ${slot.key}`}
                    checked={current?.kind === 'source'}
                    name={`${node.path}:${slot.key}`}
                    onChange={() => setSlot(slot.key, { kind: 'source' })}
                    type="radio"
                  />
                  <span>
                    Use {sourceBranch}
                    <ValueText value={slot.source} />
                  </span>
                </label>
                <label className={cn(current?.kind === 'custom' && styles.optionActive)}>
                  <input
                    disabled={readOnly}
                    aria-label={`Write a value for ${slot.key}`}
                    checked={current?.kind === 'custom'}
                    name={`${node.path}:${slot.key}`}
                    onChange={() =>
                      setSlot(slot.key, {
                        kind: 'custom',
                        text: formatSlotValue(slot.source ?? slot.target ?? slot.base),
                      })
                    }
                    type="radio"
                  />
                  <span>
                    Write my own
                    {current?.kind === 'custom' ? (
                      <textarea
                        readOnly={readOnly}
                        aria-label={`Custom value for ${slot.key}`}
                        className={styles.customInput}
                        onChange={(event) =>
                          setSlot(slot.key, { kind: 'custom', text: event.target.value })
                        }
                        rows={3}
                        value={current.text}
                      />
                    ) : (
                      <small>Replace both with a new value.</small>
                    )}
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      {autoSlots.length > 0 ? (
        <>
          <h3>Merged automatically in this node</h3>
          <AutoMergedList slots={autoSlots} />
        </>
      ) : null}
    </>
  );
}

function AutoMergedFields({
  node,
  sourceBranch,
  targetBranch,
}: {
  node: ApiPullRequestMergeReviewNode;
  sourceBranch: string;
  targetBranch: string;
}) {
  const explanation =
    node.status === 'source_only'
      ? `New in ${sourceBranch}; the merge adds it.`
      : node.status === 'target_only'
        ? `Only in ${targetBranch}; the merge keeps it.`
        : 'Only one branch changed these fields, so the merge takes that change.';
  return (
    <>
      <p className={styles.hint}>{explanation}</p>
      <AutoMergedList slots={changedSlots(node)} />
    </>
  );
}

function AutoMergedList({ slots }: { slots: ApiPullRequestMergeReviewSlot[] }) {
  return (
    <dl className={styles.autoList}>
      {slots.map((slot) => (
        <div key={slot.key}>
          <dt>{slot.key}</dt>
          <dd>
            <ValueText value={slot.merged} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
