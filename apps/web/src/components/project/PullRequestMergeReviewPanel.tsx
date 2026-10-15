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
} from '@/domain/project/pullRequestMergeReview';
import { cn } from '@/utils/cn';
import detailStyles from './ProjectReviewsDetail.module.css';
import styles from './PullRequestMergeReview.module.css';

export interface MergeResolutionProgress {
  total: number;
  unresolved: number;
}

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
  const revision = useRef(0);
  const dirty = useRef(false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const draftId = pullRequest.mergeDraftId;
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
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
  }, [draftId, fetchMergeReview, projectId, pullRequest.number]);

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
    if (!outcome || !draftId || !dirty.current) return;
    const timer = window.setTimeout(() => {
      saving.current = saving.current
        .then(() => saveMergeDecision(draftId, outcome.decision, revision.current))
        .then((next) => {
          revision.current = next;
          setSaveError(null);
        })
        .catch((error) => {
          setSaveError(
            error instanceof Error ? error.message : 'Could not save the conflict decisions.'
          );
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftId, outcome, saveMergeDecision]);

  const updateChoices = (next: MergeChoices) => {
    dirty.current = true;
    setChoices(next);
  };
  const updateNode = (path: string, update: (current: MergeNodeChoice) => MergeNodeChoice) =>
    updateChoices({ ...choices, [path]: update(choices[path] ?? { slots: {} }) });

  if (!draftId) {
    return (
      <div className={styles.emptyState}>
        <p>The merge has not been prepared for these commits yet.</p>
        <button
          className={styles.primaryButton}
          disabled={rerunning}
          onClick={onRerun}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={rerunning ? 'animate-spin' : undefined} />
          {rerunning ? 'Preparing…' : 'Prepare merge'}
        </button>
      </div>
    );
  }
  if (loadError) return <div className={styles.emptyState}>{loadError}</div>;
  if (!review || !outcome) return <div className={styles.emptyState}>Loading merge review…</div>;
  if (review.nodes.length === 0) {
    return <div className={styles.emptyState}>These commits merge without any field changes.</div>;
  }

  const visibleNodes = conflictsOnly ? conflicts : review.nodes;
  const selected = review.nodes.find((node) => node.path === selectedPath) ?? visibleNodes[0];
  const unresolved = new Set(outcome.unresolved);
  const conflictIndex = selected ? conflicts.findIndex((node) => node.path === selected.path) : -1;
  const added = review.nodes.filter((node) => node.status === 'source_only').length;
  const autoMerged = review.nodes.filter(
    (node) => node.status === 'auto' || node.status === 'target_only'
  ).length;

  const goToConflict = (direction: 1 | -1) => {
    if (conflicts.length === 0) return;
    const start = conflictIndex === -1 ? (direction === 1 ? -1 : 0) : conflictIndex;
    const next = conflicts[(start + direction + conflicts.length) % conflicts.length];
    if (next) setSelectedPath(next.path);
  };

  return (
    <div className={detailStyles.changesLayout}>
      <section className={detailStyles.diffPanel}>
        <div className={cn(detailStyles.diffToolbar, styles.toolbar)}>
          <div>
            <span className={detailStyles.addedCount}>＋ {added} added</span>
            <span className={detailStyles.modifiedCount}>∿ {autoMerged} auto-merged</span>
            <span className={detailStyles.conflictCount}>
              ! {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
              {conflicts.length > 0 ? ` · ${unresolved.size} open` : ''}
            </span>
          </div>
          {conflicts.length > 0 ? (
            <div className={styles.bulkActions}>
              <span>Remaining conflicts:</span>
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
              <button onClick={() => updateChoices({})} type="button">
                Reset
              </button>
            </div>
          ) : null}
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
        <div className={detailStyles.treeWrap}>
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
                  onSelect={() => setSelectedPath(node.path)}
                  selected={node.path === selected?.path}
                  sourceBranch={pullRequest.sourceBranch}
                  targetBranch={pullRequest.targetBranch}
                  unresolved={unresolved.has(node.path)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className={detailStyles.inspector}>
        {selected ? (
          <section className={detailStyles.inspectorCard}>
            <div className={detailStyles.inspectorHeader}>
              <h2>{selected.status === 'conflict' ? 'Resolve conflict' : 'Selected change'}</h2>
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
                    ? 'Needs decision'
                    : 'Decided'
                  : statusLabel(
                      selected.status,
                      pullRequest.sourceBranch,
                      pullRequest.targetBranch
                    )}
              </span>
              {selected.status === 'conflict' ? (
                <ConflictEditor
                  choice={choices[selected.path] ?? { slots: {} }}
                  node={selected}
                  onChange={(update) => updateNode(selected.path, update)}
                  sourceBranch={pullRequest.sourceBranch}
                  targetBranch={pullRequest.targetBranch}
                />
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
                <p className={styles.saveError} role="alert">
                  {saveError}
                </p>
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
            <b>{displayPath(node.path)}</b>
          </span>
        </td>
        <td className={styles.muted}>{nodeValue(node.presence.target)}</td>
        <td className={styles.muted}>{nodeValue(node.presence.source)}</td>
        <td>
          <span className={styles.statusTag} data-status={node.status}>
            {statusLabel(node.status, sourceBranch, targetBranch)}
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
  if (value === undefined) return <span className={styles.muted}>(empty)</span>;
  const text = formatSlotValue(value);
  return (
    <span className={styles.valueText} title={text}>
      {text}
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
  onChange,
  sourceBranch,
  targetBranch,
}: {
  choice: MergeNodeChoice;
  node: ApiPullRequestMergeReviewNode;
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
