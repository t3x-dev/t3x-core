'use client';

import type { TransitionViewV1 } from '@t3x-dev/core';
import type { Node } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  getBranchCssVariables,
  getBranchVisual,
  getCanvasNodeBranch,
} from '@/domain/canvas/branchVisuals';
import { commitHashLabel, formatDate } from '@/domain/format/formatters';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import type { CommitAction } from './CommitActionPanel';
import vividStyles from './StateCanvasVivid.module.css';

type CanvasUnitNode = Node<CanvasNodeData, 'unit'>;

interface CanvasSelectionPanelProps {
  actions: CommitAction[];
  node: CanvasUnitNode | null;
  parentNodes?: CanvasUnitNode[];
  onClose?: () => void;
  transitionState?: {
    error: string | null;
    loading: boolean;
    view: TransitionViewV1 | null;
  };
}

function branchLabel(node: CanvasUnitNode): string {
  return node.data.branchType === 'branch' ? node.data.branchName?.trim() || 'branch' : 'main';
}

function authorLabel(node: CanvasUnitNode): string {
  const author = node.data.commit?.author;
  return author?.name || author?.id || author?.type || 'Unknown';
}

function initials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}

function CheckTile({
  label,
  observation,
  outcomes,
}: {
  label: string;
  observation?: 'observed' | 'no_statement_observed';
  outcomes?: string[];
}) {
  const results = outcomes ?? [];
  const observed = observation === 'observed';
  const passed =
    observed &&
    results.length > 0 &&
    results.every((outcome) => ['confirmed', 'passed', 'verified'].includes(outcome));
  const failed = observed && !passed;
  const detail = !observed ? 'Not observed' : results.join(', ') || 'Observed';

  return (
    <div
      className={cn(
        vividStyles.checkTile,
        'border',
        passed
          ? 'border-[var(--status-success)]/25 bg-[var(--status-success-muted)]'
          : failed
            ? 'border-[var(--status-error)]/25 bg-[var(--status-error-muted)]'
            : 'border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)]'
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        {passed ? (
          <CheckCircle2 className="size-4 text-[var(--status-success)]" />
        ) : failed ? (
          <XCircle className="size-4 text-[var(--status-error)]" />
        ) : (
          <AlertTriangle className="size-4 text-[var(--status-warning)]" />
        )}
        {label}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{detail}</div>
    </div>
  );
}

export function CanvasSelectionPanel({
  actions,
  node,
  parentNodes = [],
  onClose,
  transitionState,
}: CanvasSelectionPanelProps) {
  const [copied, setCopied] = useState(false);
  if (!node) return null;

  const hash = node.data.commitHash || node.data.commit?.hash || '';
  const hashLabel = hash ? commitHashLabel(hash) : 'none';
  const branch = getCanvasNodeBranch(node.data);
  const branchCssVariables = getBranchCssVariables(branch) as CSSProperties;
  const parents = node.data.commit?.parents ?? parentNodes.map((parent) => parent.id);
  const author = authorLabel(node);
  const view = transitionState?.view;
  const decision =
    view?.decision.observation === 'supplied' ? view.decision.outcome : 'not observed';
  const verificationChecks = view
    ? [
        {
          label: 'Object integrity',
          observation:
            view.checks.objectIntegrity === 'verified'
              ? ('observed' as const)
              : ('no_statement_observed' as const),
          outcomes: [view.checks.objectIntegrity],
        },
        { label: 'Replay', ...view.checks.replay },
        { label: 'Validation', ...view.checks.validation },
        { label: 'Runner', ...view.checks.runner },
        {
          label: 'Human confirmation',
          observation: view.checks.humanConfirmation.observation,
          outcomes: view.checks.humanConfirmation.runs.length > 0 ? ['confirmed'] : [],
        },
      ]
    : [];

  const copyHash = () => {
    if (!hash) return;
    const write = navigator.clipboard?.writeText(hash);
    if (!write) return;
    void write.then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <aside className={vividStyles.inspector} data-branch-color={branch} style={branchCssVariables}>
      <header className={vividStyles.inspectorHeader}>
        <h2 className={vividStyles.inspectorTitle}>Inspector</h2>
        <Button
          aria-label="Close inspector"
          className={vividStyles.closeButton}
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className={vividStyles.inspectorBody}>
        <section className={vividStyles.inspectHero}>
          <span className={vividStyles.inspectIcon}>
            {parents.length > 1 ? (
              <GitMerge aria-hidden="true" size={28} strokeWidth={2.5} />
            ) : (
              <GitBranch aria-hidden="true" size={28} strokeWidth={2.5} />
            )}
          </span>
          <div>
            <h3 className={vividStyles.inspectHeading}>{node.data.title || 'Untitled commit'}</h3>
            <div className={vividStyles.hashGroup}>
              <span className={vividStyles.hash}>{hashLabel}</span>
              <button
                aria-label={copied ? 'Hash copied' : 'Copy hash'}
                className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--accent-commit-soft)] hover:text-[var(--accent-commit)]"
                onClick={copyHash}
                type="button"
              >
                <Copy className="size-4" />
              </button>
              <span className={vividStyles.merged}>
                <CheckCircle2 className="size-3" fill="currentColor" /> Committed
              </span>
            </div>
          </div>
        </section>
        <span className={vividStyles.separator} />

        <section className={vividStyles.card}>
          <h4 className={vividStyles.eyebrow}>Commit flow</h4>
          <div className={vividStyles.flow}>
            <div className={vividStyles.flowBranch}>
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor: getBranchVisual(
                    parentNodes[0] ? getCanvasNodeBranch(parentNodes[0].data) : branch
                  ).accent,
                }}
              />
              {parentNodes[0] ? branchLabel(parentNodes[0]) : parents.length ? 'parent' : 'root'}
            </div>
            <ArrowRight className="size-4 text-[var(--text-tertiary)]" />
            <div className={vividStyles.flowBranch}>
              <span className="size-2 rounded-full bg-[var(--branch-accent)]" /> {branch}
            </div>
          </div>
        </section>

        <section className={vividStyles.card}>
          <h4 className={vividStyles.eyebrow}>Parent commits</h4>
          <div className={vividStyles.parentList}>
            {parents.length === 0 ? (
              <div className="text-xs text-[var(--text-tertiary)]">Root commit has no parent.</div>
            ) : (
              parents.map((parentHash, index) => {
                const parentNode = parentNodes.find(
                  (candidate) =>
                    candidate.id === parentHash || candidate.data.commitHash === parentHash
                );
                const parentBranch = parentNode ? getCanvasNodeBranch(parentNode.data) : branch;
                return (
                  <div
                    className={vividStyles.parent}
                    key={parentHash}
                    style={getBranchCssVariables(parentBranch) as CSSProperties}
                  >
                    <span className="flex items-center gap-3">
                      <span className={vividStyles.parentIcon}>
                        <GitBranch className="size-3" />
                      </span>
                      <span className={vividStyles.parentHash}>{commitHashLabel(parentHash)}</span>
                    </span>
                    <span className={vividStyles.parentBranch}>
                      {parentNode ? branchLabel(parentNode) : index === 0 ? 'parent' : 'merge'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h4 className={vividStyles.eyebrow}>Status checks</h4>
          {transitionState?.loading ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 text-xs text-[var(--text-secondary)]">
              <Loader2 className="size-4 animate-spin text-[var(--text-tertiary)]" />
              Loading verification data…
            </div>
          ) : transitionState?.error ? (
            <div className="mt-3 rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] p-3 text-xs text-[var(--text-secondary)]">
              Verification data unavailable: {transitionState.error}
            </div>
          ) : verificationChecks.length === 0 ? (
            <div className="mt-3 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 text-xs text-[var(--text-secondary)]">
              No verification projection is available for this commit.
            </div>
          ) : (
            <div className={vividStyles.checkGrid}>
              {verificationChecks.map((check) => (
                <CheckTile
                  key={check.label}
                  label={check.label}
                  observation={check.observation}
                  outcomes={check.outcomes}
                />
              ))}
            </div>
          )}
        </section>

        <section className={vividStyles.details}>
          <div className={vividStyles.detailRow}>
            <span className="text-[var(--text-tertiary)]">Date</span>
            <span className="text-right font-medium text-[var(--text-secondary)]">
              {node.data.commit?.committed_at
                ? formatDate(node.data.commit.committed_at)
                : node.data.timestamp}
            </span>
          </div>
          <div className={vividStyles.detailRow}>
            <span className="text-[var(--text-tertiary)]">Author</span>
            <span className="flex items-center gap-2 font-semibold text-[var(--accent-commit)]">
              <span className="flex size-5 items-center justify-center rounded-full bg-[var(--accent-commit)] text-[9px] text-[var(--on-accent)]">
                {initials(author)}
              </span>
              {author}
            </span>
          </div>
          <div className={vividStyles.detailRow}>
            <span className="text-[var(--text-tertiary)]">Decision</span>
            <span className="font-medium capitalize text-[var(--text-secondary)]">{decision}</span>
          </div>
        </section>
      </div>

      <footer className={vividStyles.inspectorFooter}>
        {actions.map((action) => (
          <Button
            className={cn('w-full', action.label === 'View Diff' && vividStyles.footerButton)}
            key={action.label}
            onClick={action.onClick}
            variant={action.label === 'View Diff' ? 'default' : 'canvas-outline'}
          >
            {action.icon}
            {action.label === 'View Diff' ? 'View Diff Changes' : action.label}
            {action.label === 'View Diff' ? <ExternalLink className="size-4" /> : null}
          </Button>
        ))}
      </footer>
    </aside>
  );
}
