'use client';

/**
 * CommitDetailPage — full-page 3-panel view for a single committed snapshot.
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │ HEADER: breadcrumb · back · actions (view canvas / fork / export) │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │ HERO: message · author · time · branch · hash · diff stats     │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │ LINEAGE: parent · leaves count · sources count · kbd shortcuts │
 *  ├──────────┬─────────────────────────────┬────────────────────────┤
 *  │ LEFT     │ CENTER                      │ RIGHT                  │
 *  │ Tree     │ Tree Cards (scrollable)    │ Source SlideIn /        │
 *  │ Index    │                             │ Context                │
 *  │ Leaves   │                             │                        │
 *  │ Sources  │                             │                        │
 *  ├──────────┴─────────────────────────────┴────────────────────────┤
 *  │ BOTTOM: Provenance Graph (collapsible)                          │
 *  └─────────────────────────────────────────────────────────────────┘
 */

import {
  ArrowLeft,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  Pin,
  Sparkles,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { ShareLinkButton } from '@/components/shared/ShareLinkButton';
import { TreeGraphView } from '@/components/tree-graph';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import { useCommitHistory } from '@/hooks/commits/useCommitHistory';
import { useLeavesByCommit } from '@/hooks/commits/useLeavesByCommit';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { useProjectDetail } from '@/hooks/projects/useProjectDetail';
import { useKeyboardNavigation } from '@/hooks/shared/useKeyboardNavigation';
import { useCommitDetailStore } from '@/store/commitDetailStore';
import { useProjectStore } from '@/store/projectStore';
import type { ApiCommit, Leaf } from '@/types/api';
import { PAGE_ANIMATION_STYLES } from '@/utils/pageAnimations';
import { CopyButton, useCountUp } from './CommitDetailHelpers';
import { CommitOperationsSidebar } from './CommitOperationsSidebar';
import { ProvenanceGraph } from './CommitProvenanceGraph';
import { CommitTreeIndex } from './CommitTreeIndex';
import { CommitYAMLDocument } from './CommitYAMLDocument';
import { SourceSlideIn } from './SourceSlideIn';

// ============================================================================
// Types
// ============================================================================

interface CommitDetailPageProps {
  projectId: string;
  commitHash: string;
}

const COMMIT_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: 'actions',
    label: 'Actions',
    title: 'Use the header buttons to move through the version workflow',
    description:
      'This row is where users leave the commit detail page, compare with a parent, share, or export the snapshot.',
    target: 'commit-actions',
    tone: 'commit',
    icon: Eye,
  },
  {
    id: 'identity',
    label: 'Snapshot',
    title: 'Read the commit identity before drilling into content',
    description:
      'The identity strip explains who created the version, when it was committed, which branch it belongs to, and what changed.',
    target: 'commit-identity',
    tone: 'commit',
    icon: GitCommit,
  },
  {
    id: 'content',
    label: 'Tabs',
    title: 'Switch tabs to inspect the same commit from different angles',
    description:
      'YAML is the readable semantic document, Graph shows structure, JSON is the raw payload, and Relations isolates links.',
    target: 'commit-tabs',
    tone: 'extract',
    icon: Tag,
  },
  {
    id: 'audit',
    label: 'Audit',
    title: 'The right rail proves where the commit came from',
    description:
      'Evidence, YOps operations, hash chain, and snapshot metadata teach users that a commit is auditable, not just generated text.',
    target: 'commit-audit',
    tone: 'source',
    icon: Pin,
  },
  {
    id: 'provenance',
    label: 'Graph',
    title: 'Expand provenance to connect source, commit, and leaf',
    description:
      'The bottom graph makes the full path visible: source evidence becomes a stable commit and then reusable leaves.',
    target: 'commit-provenance',
    tone: 'leaf',
    icon: LeafIcon,
  },
];

// ============================================================================
// Component
// ============================================================================

export function CommitDetailPage({ projectId, commitHash }: CommitDetailPageProps) {
  const router = useRouter();
  const introDemoRequested = useIntroDemoQueryFlag();
  const { completeIntroDemo } = useIntroDemoCompletion(projectId);
  const _notify = useProjectStore((state) => state.notifyCallback);

  // ── Hook callbacks (queries via composition layer) ─
  const { loadCommit } = useCommitByHash();
  const { loadLeaves } = useLeavesByCommit();
  const { loadProject } = useProjectDetail();
  const { loadHistory } = useCommitHistory(null, { enabled: false });

  // ── Data state ────────────────────────────────────
  const [commit, setCommitLocal] = useState<ApiCommit | null>(null);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [_commitHistory, setCommitHistory] = useState<ApiCommit[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Store ──────────────────────────────────────────
  const enrichedNodes = useCommitDetailStore((s) => s.enrichedNodes);
  const removedNodes = useCommitDetailStore((s) => s.removedNodes);
  const activeNodeId = useCommitDetailStore((s) => s.activeNodeId);
  const setActiveNode = useCommitDetailStore((s) => s.setActiveNode);
  const sourceViewer = useCommitDetailStore((s) => s.sourceViewer);
  const storeSetCommit = useCommitDetailStore((s) => s.setCommit);
  const openSourceViewer = useCommitDetailStore((s) => s.openSourceViewer);

  // ── UI state ──────────────────────────────────────
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  type CommitTab = 'yaml' | 'graph' | 'json' | 'relations';
  const [activeTab, setActiveTab] = useState<CommitTab>('yaml');
  const [tourOpen, setTourOpen] = useState(false);

  // ── Refs ──────────────────────────────────────────
  const frameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const canvasHref = `/chat/project/${encodeURIComponent(projectId)}/canvas`;

  // ── Fetch data ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [commitData, leavesData, projectData] = await Promise.all([
          loadCommit(commitHash),
          loadLeaves(commitHash).catch(() => [] as Leaf[]),
          loadProject(projectId).catch(() => null),
        ]);
        setCommitLocal(commitData);
        setLeaves(leavesData);
        if (projectData?.name) setProjectName(projectData.name);

        // Fetch parent commit for diff computation (if single parent)
        let parentCommit: ApiCommit | null = null;
        if (commitData.parents.length === 1) {
          try {
            parentCommit = await loadCommit(commitData.parents[0]);
          } catch {
            // Parent fetch failure is non-critical
          }
        }

        // Store computes enriched nodes automatically
        storeSetCommit(commitData, parentCommit);

        // Fetch commit history
        try {
          const history = await loadHistory(commitHash, 10);
          setCommitHistory(history);
        } catch {
          // History fetch failure is non-critical
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commit');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [commitHash, projectId, storeSetCommit, loadCommit, loadLeaves, loadProject, loadHistory]);

  useEffect(() => {
    if (introDemoRequested) setTourOpen(true);
  }, [introDemoRequested]);

  // ── Tree stats ─────────────────────────────────
  const frameStats = useMemo(
    () => ({
      added: enrichedNodes.filter((f) => f.diffStatus === 'added').length,
      modified: enrichedNodes.filter((f) => f.diffStatus === 'modified').length,
      identical: enrichedNodes.filter((f) => f.diffStatus === 'identical').length,
      removed: removedNodes.length,
    }),
    [enrichedNodes, removedNodes]
  );

  const countIdentical = useCountUp(frameStats.identical);
  const countModified = useCountUp(frameStats.modified);
  const countAdded = useCountUp(frameStats.added);
  const countRemoved = useCountUp(frameStats.removed);

  // ── Tree IDs for keyboard navigation ───────────
  const allNodeIds = useMemo(() => {
    return [...enrichedNodes.map((ef) => ef.path), ...removedNodes.map((ef) => ef.path)];
  }, [enrichedNodes, removedNodes]);

  const nodeStatusMap = useMemo(() => {
    return new Map(enrichedNodes.map((ef) => [ef.path, ef.diffStatus]));
  }, [enrichedNodes]);

  // ── Callbacks ─────────────────────────────────────
  const scrollToNode = useCallback(
    (id: string) => {
      setActiveNode(id);
      setTimeout(() => {
        frameRefs.current[id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 50);
    },
    [setActiveNode]
  );

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(canvasHref);
  }, [canvasHref, router]);

  // ── Keyboard navigation (shared hook, controlled mode) ──
  useKeyboardNavigation({
    ids: allNodeIds,
    activeId: activeNodeId,
    onSelect: (id) => {
      if (id) scrollToNode(id);
      else setActiveNode(null);
    },
  });

  // ── Source info (from commit) ────────────────
  const sourceConversations = useMemo(
    () => commit?.sources?.filter((ref) => ref.type === 'conversation') ?? [],
    [commit?.sources]
  );
  const sourceLeafRefs = useMemo(
    () => commit?.sources?.filter((ref) => ref.type === 'leaf') ?? [],
    [commit?.sources]
  );

  // ── Loading state ─────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--surface-app)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
          <span className="text-sm text-[var(--text-tertiary)]">Loading commit...</span>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────
  if (error || !commit) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--surface-app)]">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-sm text-[var(--status-error)]">{error || 'Commit not found'}</p>
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 text-sm text-[var(--status-info)] hover:underline"
          >
            <ArrowLeft size={14} />
            Back to Canvas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-app)]">
      {/* Shared animation styles */}
      <style>{PAGE_ANIMATION_STYLES}</style>

      {/* ═══════ HEADER ═══════ */}
      <header
        className="flex h-[var(--h-header)] shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4"
        data-intro-target="commit-header"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <Breadcrumb
            className="text-[13px]"
            segments={[
              { label: projectName || 'Project', href: canvasHref },
              ...(commit.branch
                ? [{ label: commit.branch, href: `/project/${projectId}/history` }]
                : []),
              { label: shortHash(commitHash) },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5" data-intro-target="commit-actions">
          <Link
            href={canvasHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
          >
            <Eye size={13} /> View Canvas
          </Link>
          {commit.parents.length === 1 && (
            <Link
              href={`/project/${projectId}/diff?base=${encodeURIComponent(commit.parents[0])}&target=${encodeURIComponent(commitHash)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
            >
              <Sparkles size={13} /> View Diff
            </Link>
          )}
          <ShareLinkButton entityType="commit" entityId={commitHash} />
          <button
            type="button"
            onClick={() => {
              const data = JSON.stringify(commit, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `commit-${shortHash(commitHash)}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
          >
            <ExternalLink size={13} /> Export
          </button>
        </div>
      </header>

      {/* ═══════ MAIN CONTENT: 3-Panel Layout ═══════ */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* LEFT: TreeNode Index */}
        <CommitTreeIndex projectId={projectId} leaves={leaves} onLeavesChange={setLeaves} />

        {/* CENTER: Tabbed Panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Commit identity */}
          <div
            className="flex min-h-[70px] shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-[var(--space-page)] py-3"
            data-intro-target="commit-identity"
          >
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
                {commit.message || 'No message'}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]">
                    {commit.author?.type === 'agent' ? (
                      <Sparkles size={9} />
                    ) : (
                      <span className="text-[8px] font-bold">
                        {(commit.author?.name || 'U')[0].toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="font-medium">
                    {commit.author?.name || commit.author?.type || 'unknown'}
                  </span>
                </span>
                <span className="text-[var(--text-tertiary)]">&middot;</span>
                <span
                  className="text-[var(--text-tertiary)]"
                  title={new Date(commit.committed_at).toLocaleString()}
                >
                  {relativeTime(commit.committed_at)}
                </span>
                {commit.branch && (
                  <>
                    <span className="text-[var(--text-tertiary)]">&middot;</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/8 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-branch)]">
                      <GitBranch size={9} />
                      {commit.branch}
                    </span>
                  </>
                )}
                <span className="text-[var(--text-tertiary)]">&middot;</span>
                <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">
                  {commitHash.replace('sha256:', '').slice(0, 12)}...
                  <CopyButton text={commitHash} size={10} />
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {[
                {
                  label: 'identical',
                  count: countIdentical,
                  symbol: '=',
                  style:
                    'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
                },
                {
                  label: 'modified',
                  count: countModified,
                  symbol: '~',
                  style:
                    'border-[var(--diff-modified-accent)]/40 text-[var(--diff-modified-accent)] bg-[var(--diff-modified-bg)]',
                },
                {
                  label: 'added',
                  count: countAdded,
                  symbol: '+',
                  style:
                    'border-[var(--diff-added-accent)]/40 text-[var(--diff-added-accent)] bg-[var(--diff-added-bg)]',
                },
                {
                  label: 'removed',
                  count: countRemoved,
                  symbol: '-',
                  style:
                    'border-[var(--diff-removed-accent)]/40 text-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)]',
                },
              ].map((stat) => (
                <span
                  key={stat.label}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${stat.style}`}
                >
                  <span className="font-mono">{stat.symbol}</span>
                  {stat.count}
                </span>
              ))}
            </div>
          </div>

          {/* Lineage summary */}
          <div
            className="flex min-h-[38px] shrink-0 items-center gap-4 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] px-[var(--space-page)] text-[11px]"
            data-intro-target="commit-lineage"
          >
            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <GitCommit size={11} className="text-[var(--accent-commit)]" />
              <span>
                {commit.parents.length === 0
                  ? 'Root commit'
                  : commit.parents.length === 1
                    ? 'Parent:'
                    : 'Parents:'}
              </span>
              {commit.parents.map((parentHash) => (
                <Link
                  key={parentHash}
                  href={`/project/${projectId}/commit/${encodeURIComponent(parentHash)}`}
                  className="font-mono text-[var(--accent-commit)] hover:underline"
                >
                  {shortHash(parentHash)}
                </Link>
              ))}
            </div>

            <span className="h-3 w-px shrink-0 bg-[var(--stroke-divider)]" />

            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <Tag size={10} />
              <span className="font-medium text-[var(--text-secondary)]">
                {commit.content.trees.length} tree{commit.content.trees.length !== 1 ? 's' : ''}
              </span>
            </div>

            <span className="h-3 w-px shrink-0 bg-[var(--stroke-divider)]" />

            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <GitBranch size={10} />
              <span className="font-medium text-[var(--text-secondary)]">
                {commit.content.relations.length} relation
                {commit.content.relations.length !== 1 ? 's' : ''}
              </span>
            </div>

            <span className="h-3 w-px shrink-0 bg-[var(--stroke-divider)]" />

            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <LeafIcon size={10} className="text-[var(--accent-leaf)]" />
              <span className="font-medium text-[var(--text-secondary)]">
                {leaves.length} lea{leaves.length !== 1 ? 'ves' : 'f'}
              </span>
            </div>

            <span className="h-3 w-px shrink-0 bg-[var(--stroke-divider)]" />

            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <Pin size={10} className="text-[var(--accent-conversation)]" />
              <span className="font-medium text-[var(--text-secondary)]">
                {sourceConversations.length + sourceLeafRefs.length} source
                {sourceConversations.length + sourceLeafRefs.length !== 1 ? 's' : ''}
              </span>
            </div>

            <span className="h-3 w-px shrink-0 bg-[var(--stroke-divider)]" />

            <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <Tag size={10} />
              <span className="font-mono text-[10px]">{commit.schema}</span>
            </div>

            <div className="ml-auto hidden shrink-0 2xl:block">
              <KeyboardHintBar
                hints={[
                  { key: 'j k', label: 'navigate' },
                  { key: 'esc', label: 'deselect' },
                ]}
              />
            </div>
          </div>

          {/* Tab Bar */}
          <div
            className="flex gap-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 shrink-0"
            data-intro-target="commit-tabs"
          >
            {(['yaml', 'graph', 'json', 'relations'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 text-[11px] font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-[var(--accent-commit)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div
            className="flex-1 overflow-y-auto p-[var(--space-page)]"
            data-intro-target="commit-content"
          >
            {/* YAML Tab — Nested YAML document */}
            {activeTab === 'yaml' && (
              <div className="mx-auto w-full max-w-[760px]">
                <CommitYAMLDocument
                  content={commit.content}
                  nodeStatuses={nodeStatusMap}
                  onSlotClick={(treeId, slotKey) => {
                    setActiveNode(treeId);
                    openSourceViewer(slotKey);
                  }}
                />
              </div>
            )}

            {/* GRAPH Tab */}
            {activeTab === 'graph' && (
              <div className="mx-auto w-full max-w-[980px]">
                <div className="h-[500px]">
                  <TreeGraphView content={commit.content} className="h-full w-full" />
                </div>
              </div>
            )}

            {/* JSON Tab */}
            {activeTab === 'json' && (
              <div className="mx-auto w-full max-w-[760px]">
                <pre className="overflow-auto rounded-[var(--radius-lg)] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4 font-mono text-[12px] text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)]">
                  {JSON.stringify(commit, null, 2)}
                </pre>
              </div>
            )}

            {/* RELATIONS Tab */}
            {activeTab === 'relations' && (
              <div className="mx-auto w-full max-w-[760px]">
                {commit.content.relations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm text-[var(--text-tertiary)] italic">
                      No relations in this commit.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--stroke-divider)] rounded-[var(--radius-lg)] border border-[var(--stroke-default)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
                    {commit.content.relations.map((rel, i) => (
                      <div
                        key={`${rel.from}-${rel.to}-${i}`}
                        className="flex items-center gap-2 px-4 py-1.5 text-[11px]"
                      >
                        <span className="font-mono text-[var(--accent-commit)]">{rel.from}</span>
                        <span className="text-[var(--diff-modified-accent)]">→</span>
                        <span className="text-[var(--text-tertiary)] text-[10px]">{rel.type}</span>
                        <span className="text-[var(--diff-modified-accent)]">→</span>
                        <span className="font-mono text-[var(--accent-commit)]">{rel.to}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Source Slide-In (pushes center) */}
        {sourceViewer.isOpen && <SourceSlideIn projectId={projectId} />}

        {/* RIGHT: Operations Sidebar (always visible) */}
        <CommitOperationsSidebar projectId={projectId} commit={commit} />
      </div>

      {/* ═══════ BOTTOM: Provenance Graph ═══════ */}
      <ProvenanceGraph
        activeNodeId={activeNodeId}
        commit={commit}
        leaves={leaves}
        projectId={projectId}
        collapsed={bottomCollapsed}
        onToggleCollapse={() => setBottomCollapsed(!bottomCollapsed)}
      />
      <FeatureTourOverlay
        open={tourOpen}
        title="Commit walkthrough"
        steps={COMMIT_TOUR_STEPS}
        onClose={() => setTourOpen(false)}
        onDone={() => void completeIntroDemo()}
      />
    </div>
  );
}
