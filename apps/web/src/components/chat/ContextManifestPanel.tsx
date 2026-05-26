'use client';

import {
  CheckCircle2,
  ExternalLink,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  MessageSquare,
  MessageSquareQuote,
  Plus,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { CommitYAMLDocument } from '@/components/commit/CommitYAMLDocument';
import type {
  ContextManifestFeedback,
  ContextManifestReference,
  ConversationContextManifest,
  Leaf as ProjectLeaf,
} from '@/types/api';
import { cn } from '@/utils/cn';

const EMPTY_LEAF_IDS = new Set<string>();

type PreviewTarget =
  | { kind: 'baseline' }
  | { kind: 'reference'; id: string }
  | { kind: 'lesson'; id: string };
type SourceTab = 'included' | 'baseline' | 'materials' | 'lessons';

export interface ContextManifestSourcePicker {
  availableLeaves?: ProjectLeaf[];
  availableLeavesLoading?: boolean;
  availableLeavesError?: string | null;
  leafPinningIds?: ReadonlySet<string>;
  baseline?: {
    commitHash: string | null;
    branch: string | null;
    parentConversationId?: string | null;
  };
  onPinLeaf?: (leafId: string) => void | Promise<void>;
}

interface ContextManifestPanelProps {
  id: string;
  manifest: ConversationContextManifest | null;
  disabled?: boolean;
  sourcePicker?: ContextManifestSourcePicker;
  onReferenceToggle: (pinId: string, included: boolean) => void | Promise<void>;
  onAssertionToggle: (
    pinId: string,
    assertionId: string,
    included: boolean
  ) => void | Promise<void>;
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return 'none';
  return hash.replace(/^sha256:/, '').slice(0, 8);
}

function referenceLabel(reference: ContextManifestReference): string {
  return reference.title ?? reference.id;
}

function feedbackLabel(feedback: ContextManifestFeedback): string {
  return feedback.lesson ?? feedback.details ?? feedback.id;
}

function leafTitle(leaf: ProjectLeaf): string {
  return leaf.title || leaf.id.slice(0, 12);
}

function referenceOpenHref(reference: ContextManifestReference, projectId: string | undefined) {
  if (reference.type === 'conversation') return `/chat/${encodeURIComponent(reference.id)}`;
  if (!projectId) return null;
  return `/project/${projectId}/leaf/${encodeURIComponent(reference.id)}`;
}

function ReferenceIcon({ type }: { type: ContextManifestReference['type'] }) {
  return type === 'leaf' ? (
    <LeafIcon size={13} className="text-[var(--accent-leaf)]" />
  ) : (
    <MessageSquare size={13} className="text-[var(--accent-conversation)]" />
  );
}

function OpenSourceLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="shrink-0 rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)]">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
    >
      {label}
      <ExternalLink size={10} />
    </Link>
  );
}

function BaselineIncludedRow({
  selected,
  manifest,
  onPreview,
}: {
  selected: boolean;
  manifest: ConversationContextManifest | null;
  onPreview: () => void;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-[var(--accent-commit)]/10' : 'hover:bg-[var(--hover-bg)]'
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--accent-commit)]/20 bg-[var(--accent-commit)]/10">
        <GitCommit size={13} className="text-[var(--accent-commit)]" />
      </span>
      <button type="button" onClick={onPreview} className="min-w-0 text-left">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          Baseline inherited
        </span>
        <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          commit {shortHash(manifest?.baseline.commit_hash)} ·{' '}
          {manifest?.baseline.branch ?? 'no branch'}
        </span>
      </button>
      <span className="rounded-[var(--radius-sm)] bg-[var(--accent-commit)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-commit)]">
        readonly
      </span>
    </div>
  );
}

function ReferenceRow({
  reference,
  projectId,
  selected,
  disabled,
  onPreview,
  onReferenceToggle,
}: {
  reference: ContextManifestReference;
  projectId: string | undefined;
  selected: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onReferenceToggle: ContextManifestPanelProps['onReferenceToggle'];
}) {
  const title = referenceLabel(reference);
  const openLabel = reference.type === 'leaf' ? 'Open leaf' : 'Open conversation';

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[16px_20px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-[var(--accent-commit)]/10' : 'hover:bg-[var(--hover-bg)]'
      )}
    >
      <input
        type="checkbox"
        checked={reference.included}
        disabled={disabled}
        onChange={(event) => {
          void onReferenceToggle(reference.pin_id, event.target.checked);
        }}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[var(--stroke-default)] accent-[var(--accent-commit)]"
        aria-label={`Include ${title}`}
      />
      <span className="mt-0.5">
        <ReferenceIcon type={reference.type} />
      </span>
      <button type="button" onClick={onPreview} className="min-w-0 text-left">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          {reference.type} · {reference.pin_id}
        </span>
      </button>
      <OpenSourceLink href={referenceOpenHref(reference, projectId)} label={openLabel} />
    </div>
  );
}

function AvailableLeafRow({
  leaf,
  pinning,
  onPinLeaf,
}: {
  leaf: ProjectLeaf;
  pinning: boolean;
  onPinLeaf?: ContextManifestSourcePicker['onPinLeaf'];
}) {
  const title = leafTitle(leaf);
  const constraintCount = leaf.constraints?.length ?? 0;

  return (
    <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--hover-bg)]">
      <LeafIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-leaf)]" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
          {constraintCount} constraint{constraintCount !== 1 ? 's' : ''}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Pin and include leaf ${title}`}
        onClick={() => {
          void onPinLeaf?.(leaf.id);
        }}
        disabled={pinning || !onPinLeaf}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf)]/10 px-2 py-1 text-[10px] font-medium text-[var(--accent-leaf)] transition-colors hover:bg-[var(--accent-leaf)]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Pin & include
      </button>
    </div>
  );
}

function LessonRow({
  feedback,
  parentTitle,
  selected,
  disabled,
  onPreview,
  onAssertionToggle,
}: {
  feedback: ContextManifestFeedback;
  parentTitle: string;
  selected: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onAssertionToggle: ContextManifestPanelProps['onAssertionToggle'];
}) {
  const label = feedbackLabel(feedback);

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[16px_20px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-[var(--accent-extract)]/10' : 'hover:bg-[var(--hover-bg)]'
      )}
    >
      <input
        type="checkbox"
        checked={feedback.selected}
        disabled={disabled}
        onChange={(event) => {
          void onAssertionToggle(feedback.pin_id, feedback.id, event.target.checked);
        }}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[var(--stroke-default)] accent-[var(--accent-extract)]"
        aria-label={`Include lesson ${label}`}
      />
      <MessageSquareQuote size={13} className="mt-0.5 shrink-0 text-[var(--accent-extract)]" />
      <button type="button" onClick={onPreview} className="min-w-0 text-left">
        <span className="block break-words text-xs text-[var(--text-primary)]">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--text-tertiary)]">
          {parentTitle}
          {feedback.selected && !feedback.included ? ' · inactive until parent is included' : ''}
        </span>
      </button>
      {feedback.passed === true && (
        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--status-success)]" />
      )}
      {feedback.passed === false && (
        <XCircle size={13} className="mt-0.5 shrink-0 text-[var(--status-error)]" />
      )}
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--stroke-default)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}

function Pane({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-2.5 py-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-normal text-[var(--text-tertiary)]">
          {title}
        </h3>
        {meta && (
          <span className="rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
            {meta}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">{children}</div>
    </section>
  );
}

function PreviewPanel({
  manifest,
  referencesById,
  selectedPreview,
}: {
  manifest: ConversationContextManifest | null;
  referencesById: Map<string, ContextManifestReference>;
  selectedPreview: PreviewTarget;
}) {
  if (selectedPreview.kind === 'reference') {
    const reference = referencesById.get(selectedPreview.id);
    if (reference) {
      return (
        <div className="space-y-3 p-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {referenceLabel(reference)}
            </h3>
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              {reference.type} · {reference.included ? 'included this turn' : 'not used this turn'}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            This source is pinned in the project library. Its checkbox controls only whether the
            current conversation turn includes it.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
              <dt className="text-[var(--text-tertiary)]">Pin</dt>
              <dd className="mt-1 font-mono text-[var(--text-secondary)]">{reference.pin_id}</dd>
            </div>
            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
              <dt className="text-[var(--text-tertiary)]">Include</dt>
              <dd className="mt-1 font-mono text-[var(--text-secondary)]">
                {reference.included ? 'true' : 'false'}
              </dd>
            </div>
          </dl>
        </div>
      );
    }
  }

  if (selectedPreview.kind === 'lesson') {
    const feedback = manifest?.feedback.find((item) => item.id === selectedPreview.id);
    if (feedback) {
      return (
        <div className="space-y-3 p-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {feedbackLabel(feedback)}
            </h3>
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              lesson · {feedback.included ? 'effective' : 'not effective for this turn'}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            Lessons are not evidence sources. They summarize prior output or result feedback and
            only affect extraction context when selected and their parent source is included.
          </p>
        </div>
      );
    }
  }

  return (
    <div className="space-y-3 p-2">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Baseline inherited</h3>
        <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
          commit {shortHash(manifest?.baseline.commit_hash)} · automatic context
        </p>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
        Baseline YAML is inherited from the parent commit. It is automatically included and does not
        require pinning the parent conversation.
      </p>
      <dl className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
          <dt className="text-[var(--text-tertiary)]">Nodes</dt>
          <dd className="mt-1 font-mono text-[var(--text-secondary)]">
            {manifest?.baseline.node_count ?? 0}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
          <dt className="text-[var(--text-tertiary)]">Relations</dt>
          <dd className="mt-1 font-mono text-[var(--text-secondary)]">
            {manifest?.baseline.relation_count ?? 0}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BaselineActions({
  manifest,
  sourcePicker,
}: {
  manifest: ConversationContextManifest | null;
  sourcePicker?: ContextManifestSourcePicker;
}) {
  const commitHash = manifest?.baseline.commit_hash ?? sourcePicker?.baseline?.commitHash ?? null;
  const commitHref =
    manifest?.project_id && commitHash
      ? `/project/${manifest.project_id}/commit/${encodeURIComponent(commitHash)}`
      : null;
  const sourceConversationId =
    manifest?.baseline.source_conversation_id ??
    sourcePicker?.baseline?.parentConversationId ??
    null;
  const sourceConversationHref = sourceConversationId
    ? `/chat/${encodeURIComponent(sourceConversationId)}`
    : null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <OpenSourceLink href={commitHref} label="View commit" />
      <OpenSourceLink
        href={sourceConversationHref}
        label={sourceConversationHref ? 'View source conversation' : 'No source conversation'}
      />
    </div>
  );
}

export function ContextManifestPanel({
  id,
  manifest,
  disabled,
  sourcePicker,
  onReferenceToggle,
  onAssertionToggle,
}: ContextManifestPanelProps) {
  const [activeTab, setActiveTab] = useState<SourceTab>('included');
  const [selectedPreview, setSelectedPreview] = useState<PreviewTarget>({ kind: 'baseline' });
  const references = manifest?.references ?? [];
  const includedReferences = references.filter((reference) => reference.included);
  const materialReferences = references;
  const leafReferences = materialReferences.filter((reference) => reference.type === 'leaf');
  const effectiveLessons = manifest?.feedback.filter((feedback) => feedback.included) ?? [];
  const referencesById = useMemo(
    () => new Map(references.map((reference) => [reference.id, reference])),
    [references]
  );
  const referenceTitlesById = useMemo(
    () => new Map(references.map((reference) => [reference.id, referenceLabel(reference)])),
    [references]
  );

  const leafPinningIds = sourcePicker?.leafPinningIds ?? EMPTY_LEAF_IDS;
  const pinnedLeafIds = new Set(leafReferences.map((reference) => reference.id));
  const availableLeaves = sourcePicker?.availableLeaves ?? [];
  const availableLeafOptions = availableLeaves.filter((leaf) => !pinnedLeafIds.has(leaf.id));
  const showAvailableLeaves =
    Boolean(sourcePicker?.availableLeavesLoading) ||
    Boolean(sourcePicker?.availableLeavesError) ||
    availableLeafOptions.length > 0 ||
    availableLeaves.length > 0;

  return (
    <section
      id={id}
      aria-label="Sources"
      className="mx-auto mt-1 flex h-[min(34vh,320px)] max-w-[760px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-sm)]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-2 pt-2">
          <div
            role="tablist"
            aria-label="Source types"
            className="inline-flex h-8 max-w-full items-center overflow-x-auto text-[11px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'included'}
              onClick={() => setActiveTab('included')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'included'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Included
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {includedReferences.length + (manifest?.baseline.commit_hash ? 1 : 0)}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'baseline'}
              onClick={() => setActiveTab('baseline')}
              className={cn(
                'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'baseline'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Baseline
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'materials'}
              onClick={() => setActiveTab('materials')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'materials'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Materials
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {materialReferences.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lessons'}
              onClick={() => setActiveTab('lessons')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'lessons'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Lessons
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {effectiveLessons.length}
              </span>
            </button>
          </div>
          <div className="hidden shrink-0 items-center gap-2 text-[10px] text-[var(--text-tertiary)] sm:flex">
            <span>{manifest?.sources.length ?? 0} sources</span>
            <span>{manifest?.token_estimate ?? 0} tokens</span>
          </div>
        </div>

        {activeTab === 'included' && (
          <div role="tabpanel" aria-label="Included" className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] gap-2 max-sm:grid-cols-1">
              <Pane title="This turn uses" meta="row click previews">
                <div className="space-y-1">
                  {manifest?.baseline.commit_hash && (
                    <BaselineIncludedRow
                      selected={selectedPreview.kind === 'baseline'}
                      manifest={manifest}
                      onPreview={() => setSelectedPreview({ kind: 'baseline' })}
                    />
                  )}
                  {includedReferences.length > 0 ? (
                    includedReferences.map((reference) => (
                      <ReferenceRow
                        key={reference.pin_id}
                        reference={reference}
                        projectId={manifest?.project_id}
                        selected={
                          selectedPreview.kind === 'reference' &&
                          selectedPreview.id === reference.id
                        }
                        disabled={disabled}
                        onPreview={() =>
                          setSelectedPreview({ kind: 'reference', id: reference.id })
                        }
                        onReferenceToggle={onReferenceToggle}
                      />
                    ))
                  ) : (
                    <EmptyState>No included sources beyond the baseline.</EmptyState>
                  )}
                </div>
              </Pane>
              <Pane title="Preview" meta="not navigation">
                <PreviewPanel
                  manifest={manifest}
                  referencesById={referencesById}
                  selectedPreview={selectedPreview}
                />
              </Pane>
            </div>
          </div>
        )}

        {activeTab === 'baseline' && (
          <div role="tabpanel" aria-label="Baseline" className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_240px] gap-2 max-sm:grid-cols-1">
              <div className="min-h-0 overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
                {manifest?.baseline.content ? (
                  <CommitYAMLDocument content={manifest.baseline.content} />
                ) : (
                  <EmptyState>No baseline commit.</EmptyState>
                )}
              </div>
              <aside className="min-h-0 overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Baseline inherited
                </h3>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                  Automatic semantic baseline from the parent commit.
                </p>
                <dl className="mt-3 space-y-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Commit</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {shortHash(manifest?.baseline.commit_hash)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Branch</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {manifest?.baseline.branch ?? sourcePicker?.baseline?.branch ?? 'none'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Nodes</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {manifest?.baseline.node_count ?? 0}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Relations</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {manifest?.baseline.relation_count ?? 0}
                    </dd>
                  </div>
                </dl>
                <BaselineActions manifest={manifest} sourcePicker={sourcePicker} />
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div
            role="tabpanel"
            aria-label="Materials"
            className="min-h-0 flex-1 overflow-hidden p-2"
          >
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] gap-2 max-sm:grid-cols-1">
              <Pane
                title="Materials"
                meta={`${materialReferences.filter((item) => item.included).length}/${materialReferences.length} included`}
              >
                <div className="space-y-1">
                  {materialReferences.length > 0 ? (
                    materialReferences.map((reference) => (
                      <ReferenceRow
                        key={reference.pin_id}
                        reference={reference}
                        projectId={manifest?.project_id}
                        selected={
                          selectedPreview.kind === 'reference' &&
                          selectedPreview.id === reference.id
                        }
                        disabled={disabled}
                        onPreview={() =>
                          setSelectedPreview({ kind: 'reference', id: reference.id })
                        }
                        onReferenceToggle={onReferenceToggle}
                      />
                    ))
                  ) : (
                    <EmptyState>No pinned material sources.</EmptyState>
                  )}

                  {showAvailableLeaves && (
                    <div className="mt-2 space-y-1 border-t border-[var(--stroke-divider)] pt-2">
                      <div className="px-2 text-[10px] font-medium uppercase tracking-normal text-[var(--text-tertiary)]">
                        Available materials
                      </div>
                      {sourcePicker?.availableLeavesLoading ? (
                        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading materials...
                        </div>
                      ) : sourcePicker?.availableLeavesError ? (
                        <div className="rounded-md border border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-2 py-1.5 text-xs text-[var(--status-error)]">
                          {sourcePicker.availableLeavesError}
                        </div>
                      ) : availableLeafOptions.length > 0 ? (
                        availableLeafOptions.map((leaf) => (
                          <AvailableLeafRow
                            key={leaf.id}
                            leaf={leaf}
                            pinning={leafPinningIds.has(leaf.id)}
                            onPinLeaf={sourcePicker?.onPinLeaf}
                          />
                        ))
                      ) : availableLeaves.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          No project materials available.
                        </p>
                      ) : (
                        <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          All project materials are already pinned.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Pane>
              <Pane title="Preview" meta="checkbox = include">
                <PreviewPanel
                  manifest={manifest}
                  referencesById={referencesById}
                  selectedPreview={selectedPreview}
                />
              </Pane>
            </div>
          </div>
        )}

        {activeTab === 'lessons' && (
          <div role="tabpanel" aria-label="Lessons" className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] gap-2 max-sm:grid-cols-1">
              <Pane
                title="Lessons"
                meta={`${effectiveLessons.length}/${manifest?.feedback.length ?? 0} effective`}
              >
                {manifest && manifest.feedback.length > 0 ? (
                  <div className="space-y-1">
                    {manifest.feedback.map((feedback) => (
                      <LessonRow
                        key={feedback.id}
                        feedback={feedback}
                        parentTitle={
                          referenceTitlesById.get(feedback.parent_ref_id) ?? feedback.parent_ref_id
                        }
                        selected={
                          selectedPreview.kind === 'lesson' && selectedPreview.id === feedback.id
                        }
                        disabled={disabled}
                        onPreview={() => setSelectedPreview({ kind: 'lesson', id: feedback.id })}
                        onAssertionToggle={onAssertionToggle}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState>No lessons selected from prior outputs.</EmptyState>
                )}
              </Pane>
              <Pane title="Preview" meta="not evidence">
                <PreviewPanel
                  manifest={manifest}
                  referencesById={referencesById}
                  selectedPreview={selectedPreview}
                />
              </Pane>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
