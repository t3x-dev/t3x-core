'use client';

import type { Node } from '@xyflow/react';
import {
  AlertCircle,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  GitBranch,
  GitCompare,
  History,
  Loader2,
  Tag,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RelationsTab } from '@/components/relations/RelationsTab';
import { TreeGraphView } from '@/components/tree-graph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSemanticContent } from '@/domain/commitContent';
import { useExportCommit } from '@/hooks/commits/useExportCommit';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import type { ApiCommit, CommitExportFormat } from '@/types/api';
import type { CanvasNodeData, CommitDisplay } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { glass, toneAccent } from '@/utils/theme';
import { CommitHistoryPanel } from '../CommitHistoryPanel';
import type { NodeQuickAction } from './NodeModal';
import {
  CommitConstraintsAndLeaves,
  CommitFullHeader,
  CommitSourceContent,
  MemoryContextSidebar,
  PinnedSourcesSection,
} from './shared';

interface CommittedCommitViewProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  routeProjectId: string | undefined;
  quickActions?: NodeQuickAction[];
}

export function CommittedCommitView({
  node,
  onClose,
  onUpdate: _onUpdate,
  projectId,
  routeProjectId,
  quickActions: _quickActions,
}: CommittedCommitViewProps) {
  const { t } = useTerminology();
  const { run: exportCommit } = useExportCommit();
  const router = useRouter();
  const data = node.data;

  // ========== Internal State ==========

  // History panel
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // Diff state
  const [diffTargetCommit, setDiffTargetCommit] = useState<string>('');
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Layout: resizable panels
  const [commitLeftWidth, setCommitLeftWidth] = useState(280);
  const [commitRightWidth, setCommitRightWidth] = useState(280);

  // Refs
  const commitContainerRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Clean up any pending drag handlers on unmount
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // ========== Computed Values ==========

  // Get all committed commits for diff target selection
  const nodes = useCanvasStore((state) => state.nodes);
  const allCommittedCommits = useMemo(
    () => nodes.filter((n) => n.data.kind === 'unit' && n.data.commitStatus === 'committed'),
    [nodes]
  );

  // Branch label
  const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'main';

  // Source excerpt from committed data
  const commitSourceExcerpt = data.sourceExcerpt || [];
  const commitFacets = data.facetSnapshot || [];

  // Group facets by type for display
  const facetsByType = commitFacets.reduce(
    (acc, facet) => {
      const type = facet.facet || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(facet);
      return acc;
    },
    {} as Record<string, typeof commitFacets>
  );

  // ========== Callbacks ==========

  // Export commit
  const handleCommitExport = useCallback(
    async (format: CommitExportFormat) => {
      const commit = data.commit as ApiCommit | undefined;
      if (!commit) return;
      await exportCommit(commit, format);
    },
    [data.commit, exportCommit]
  );

  // B-15: Navigate to full-screen diff page
  const handleDiffTargetSelect = useCallback(
    (targetHash: string) => {
      if (!data?.commitHash || !targetHash) return;

      setDiffTargetCommit(targetHash);
      setIsDiffLoading(true);
      setDiffError(null);

      const pid = routeProjectId || projectId;
      try {
        router.push(
          `/project/${pid}/diff?base=${encodeURIComponent(data.commitHash)}&target=${encodeURIComponent(targetHash)}`
        );
      } finally {
        setIsDiffLoading(false);
      }
    },
    [data?.commitHash, routeProjectId, projectId, router]
  );

  // Commit left divider handler
  const handleCommitLeftDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!commitContainerRef.current) return;
      const rect = commitContainerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - rect.left;
      setCommitLeftWidth(Math.max(200, Math.min(400, newWidth)));
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    dragCleanupRef.current = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  };

  // Commit right divider handler
  const handleCommitRightDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!commitContainerRef.current) return;
      const rect = commitContainerRef.current.getBoundingClientRect();
      const newWidth = rect.right - moveEvent.clientX;
      setCommitRightWidth(Math.max(200, Math.min(400, newWidth)));
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    dragCleanupRef.current = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  };

  // ========== Render ==========

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-modal-title"
    >
      <div
        className={cn(
          'flex flex-col w-[95vw] max-w-[1400px] h-[85vh] rounded-2xl overflow-hidden',
          glass.cardBase,
          glass.highlight
        )}
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between h-14 px-5 border-b border-[var(--stroke-divider)] shrink-0">
          <div className="flex items-center gap-3">
            <h2
              id="node-modal-title"
              className="text-[0.95rem] font-semibold text-[var(--text-primary)]"
            >
              {t('commit')}: {data.title || 'Untitled'}
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">{data.entryId}</span>
            <Badge
              className={cn(
                'text-xs gap-1 bg-transparent rounded-full',
                branchLabel === 'main'
                  ? cn(toneAccent.commit.border, toneAccent.commit.text)
                  : cn(toneAccent.branch.border, toneAccent.branch.text)
              )}
            >
              <GitBranch size={12} />
              {branchLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Open Full Page link */}
            {data.commitHash && (routeProjectId || projectId) && (
              <Link
                href={`/project/${routeProjectId || projectId}/commit/${encodeURIComponent(data.commitHash)}`}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                  'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                  'hover:bg-[var(--hover-bg)] transition-colors'
                )}
              >
                <ExternalLink size={14} />
                <span>Open Full Page</span>
              </Link>
            )}
            {data.commit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    aria-label="Export"
                  >
                    <Download size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleCommitExport('clipboard')}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Frames
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCommitExport('markdown')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Export as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCommitExport('json')}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X size={20} />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden min-h-0" ref={commitContainerRef}>
          {/* Left Sidebar - Meta & Lineage */}
          <aside
            className="min-w-[200px] p-5 overflow-y-auto shrink-0 bg-[var(--surface-app)]"
            style={{ width: commitLeftWidth }}
          >
            <div className="mb-5">
              <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                Version Info
              </h4>
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                <GitBranch size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <span>
                  {t('branch')}: <strong>{branchLabel}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                <Clock size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <span>{data.timestamp}</span>
              </div>
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                <Tag size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <span>{data.tags.length > 0 ? data.tags.join(', ') : 'No tags'}</span>
              </div>
            </div>

            <div className="h-px bg-[var(--hover-bg)] my-4" />

            <div className="mb-5">
              <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                Lineage
              </h4>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[0.85rem]">
                  <span className="text-[var(--color-text-muted)]">From {t('draft')}:</span>
                  <span className="text-[var(--text-secondary)] font-mono text-xs">
                    {data.entryId}
                  </span>
                </div>
                {data.baselineSummary && (
                  <div className="flex items-center gap-2 text-[0.85rem]">
                    <span className="text-[var(--color-text-muted)]">Upstream:</span>
                    <span className="text-[var(--text-secondary)]">Connected</span>
                  </div>
                )}
              </div>
            </div>

            <MemoryContextSidebar
              projectId={routeProjectId || projectId || undefined}
              conversationId={data?.conversationId || data?.sourceConversationId}
              branch={branchLabel}
            />
          </aside>

          {/* Left Divider */}
          <div
            className="w-1.5 bg-[var(--hover-bg)] cursor-col-resize shrink-0 hover:bg-[var(--color-border)] active:bg-[var(--status-info)] transition-colors"
            onMouseDown={handleCommitLeftDivider}
          />

          {/* Main Content - Tabbed Source View & Generated Output */}
          <div className="flex-1 min-w-0 overflow-y-auto p-[var(--space-page)] flex flex-col gap-[var(--space-section)]">
            {/* Commit header + tabbed source view */}
            {data.commit &&
              (() => {
                const commit = data.commit as CommitDisplay;
                const branchName =
                  data.branchName || (data.branchType === 'main' ? 'main' : undefined);
                const commitProjectId = routeProjectId || projectId || undefined;

                return (
                  <div className="space-y-[var(--space-group)]">
                    <CommitFullHeader commit={commit} branchName={branchName} />

                    {/* Pinned Sources */}
                    {commit.sources && commit.sources.length > 0 && (
                      <PinnedSourcesSection
                        sourceRefs={commit.sources as import('@/infrastructure').CommitSourceRef[]}
                        projectId={commitProjectId}
                      />
                    )}

                    {/* Tabbed view: Source Context | Source Excerpt | JSON */}
                    <Tabs defaultValue="context">
                      <TabsList className="w-full justify-start rounded-none border-b border-[var(--stroke-divider)] bg-transparent px-0 h-auto">
                        <TabsTrigger
                          value="context"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                        >
                          Source Context
                        </TabsTrigger>
                        <TabsTrigger
                          value="excerpt"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                        >
                          Source Excerpt
                        </TabsTrigger>
                        <TabsTrigger
                          value="json"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                        >
                          JSON
                        </TabsTrigger>
                        {commit && getSemanticContent(commit as ApiCommit).trees.length > 0 && (
                          <TabsTrigger
                            value="tree-graph"
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                          >
                            Tree Graph
                          </TabsTrigger>
                        )}
                        <TabsTrigger
                          value="relations"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                        >
                          Relations
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent
                        value="context"
                        forceMount
                        className="data-[state=inactive]:hidden"
                      >
                        <CommitSourceContent commit={commit} />
                      </TabsContent>

                      <TabsContent value="excerpt">
                        <div className="p-3 bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-md min-h-[80px]">
                          {commitSourceExcerpt.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {commitSourceExcerpt.map((excerpt) => (
                                <div
                                  key={`${data.commitHash ?? data.entryId ?? node.id}-excerpt-${excerpt}`}
                                  className="flex items-start gap-2 p-2 bg-[var(--surface-app)] rounded border border-[var(--stroke-divider)]"
                                >
                                  <span className="text-[var(--text-tertiary)] font-bold shrink-0">
                                    &bull;
                                  </span>
                                  <span className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)] break-words">
                                    {excerpt}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center py-6 text-[var(--text-tertiary)] text-sm">
                              <span>No source excerpt recorded</span>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="json">
                        <pre className="p-[var(--space-group)] bg-[var(--surface-app)] border border-[var(--stroke-divider)] rounded-md text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(commit, null, 2)}
                        </pre>
                      </TabsContent>

                      {commit && getSemanticContent(commit as ApiCommit).trees.length > 0 && (
                        <TabsContent value="tree-graph">
                          <div className="h-[400px] border border-[var(--stroke-divider)] rounded-md overflow-hidden">
                            <TreeGraphView
                              content={getSemanticContent(commit as ApiCommit)}
                              className="h-full w-full"
                            />
                          </div>
                        </TabsContent>
                      )}

                      <TabsContent value="relations">
                        <RelationsTab
                          commitHash={data.commitHash || ''}
                          nodes={
                            commit.content?.trees
                              ? commit.content.trees.map((f) => ({
                                  id: f.key,
                                  text: `[${f.key}] ${Object.entries(f.slots ?? {})
                                    .map(
                                      ([k, v]) =>
                                        `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`
                                    )
                                    .join('; ')}`,
                                }))
                              : []
                          }
                        />
                      </TabsContent>
                    </Tabs>

                    {/* Constraints and Leaves below tabs */}
                    <CommitConstraintsAndLeaves
                      commit={commit}
                      leaves={data.leaves}
                      projectId={commitProjectId}
                    />
                  </div>
                );
              })()}

            {/* Generated Output - LLM generated content (only show if no commit data) */}
            {!data.commit && (
              <div className="p-[var(--space-group)] bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)] elevation-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-[var(--text-secondary)]">
                    Generated Output
                  </h3>
                </div>
                <div className="p-[var(--space-group)] bg-[var(--surface-app)] border border-[var(--stroke-divider)] rounded-md text-[0.9rem] leading-relaxed text-[var(--text-secondary)]">
                  {data.summary || 'No generated content.'}
                </div>
              </div>
            )}

            {data.status && !data.commit && (
              <div className="p-[var(--space-group)] bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)] elevation-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Intent</h3>
                </div>
                <div className="p-3 bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-md text-[0.9rem] text-[var(--text-secondary)]">
                  {data.status}
                </div>
              </div>
            )}

            {/* Facets - Extracted semantic data (only show if no commit data) */}
            {!data.commit && (
              <div className="p-[var(--space-group)] bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)] elevation-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Facets</h3>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {commitFacets.length} extracted
                  </span>
                </div>
                <div>
                  {commitFacets.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {Object.entries(facetsByType).map(([type, facets]) => (
                        <div
                          key={type}
                          className="bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-md overflow-hidden"
                        >
                          <h5 className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-app)] border-b border-[var(--stroke-divider)] text-sm font-medium text-[var(--text-secondary)]">
                            <span>
                              {type === 'keyword' && '\u{1F3F7}\u{FE0F}'}
                              {type === 'preference' && '\u{1F496}'}
                              {type === 'intent_seed' && '\u{1F3AF}'}
                              {type === 'time_window' && '\u{23F0}'}
                              {type === 'preference_soft' && '\u{1F4A1}'}
                              {type === 'unknown_slot' && '\u{2753}'}
                              {type === 'segment' && '\u{1F4DD}'}
                              {type === 'topic' && '\u{1F4CC}'}
                              {type === 'time_anchor' && '\u{1F4C6}'}
                              {type === 'facet' && '\u{2728}'}
                            </span>
                            {type}
                            <span className="text-xs text-[var(--text-tertiary)]">
                              ({facets.length})
                            </span>
                          </h5>
                          <div className="p-2 flex flex-wrap gap-2">
                            {facets.map((facet) => {
                              // Determine background color based on polarity
                              const polarityClass =
                                facet.polarity === 1
                                  ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                                  : facet.polarity === -1
                                    ? 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
                                    : 'bg-[var(--surface-app)] text-[var(--text-secondary)]';

                              // Entity type icon mapping
                              const entityIcon =
                                facet.entity_type === 'LOCATION'
                                  ? '\u{1F4CD}'
                                  : facet.entity_type === 'PERSON'
                                    ? '\u{1F464}'
                                    : facet.entity_type === 'DATE'
                                      ? '\u{1F4C5}'
                                      : facet.entity_type === 'ORGANIZATION'
                                        ? '\u{1F3E2}'
                                        : facet.entity_type === 'EVENT'
                                          ? '\u{1F389}'
                                          : facet.entity_type === 'NUMBER'
                                            ? '#'
                                            : null;

                              return (
                                <div
                                  key={[
                                    type,
                                    facet.text ?? '',
                                    facet.key ?? '',
                                    facet.entity_type ?? '',
                                    facet.turn_hash ?? '',
                                  ].join(':')}
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm',
                                    polarityClass
                                  )}
                                  title={
                                    facet.turn_hash
                                      ? `From turn: ${facet.turn_hash.slice(0, 12)}...`
                                      : undefined
                                  }
                                >
                                  {entityIcon && <span>{entityIcon}</span>}
                                  {facet.text && <span>{facet.text}</span>}
                                  {facet.key && facet.value !== undefined && !facet.text && (
                                    <span>
                                      <span className="opacity-70">{facet.key}:</span>
                                      <span className="ml-0.5">{String(facet.value)}</span>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6 text-[var(--text-tertiary)] text-sm">
                      <span>No facets extracted</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Divider */}
          <div
            className="w-1.5 bg-[var(--hover-bg)] cursor-col-resize shrink-0 hover:bg-[var(--color-border)] active:bg-[var(--status-info)] transition-colors"
            onMouseDown={handleCommitRightDivider}
          />

          {/* Right Sidebar - History & Compare */}
          <aside
            className="min-w-[200px] p-5 overflow-y-auto shrink-0 bg-[var(--surface-app)]"
            style={{ width: commitRightWidth }}
          >
            {/* History Section */}
            {data.commit && data.commitHash && (
              <>
                <div className="mb-5">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <History size={14} />
                    History
                  </h4>
                  <Button
                    variant="outline"
                    onClick={() => setShowHistoryPanel(true)}
                    className="w-full gap-2"
                  >
                    <History size={14} />
                    <span>View {t('commit').toLowerCase()} history</span>
                  </Button>
                </div>
                <CommitHistoryPanel
                  commitHash={data.commitHash}
                  open={showHistoryPanel}
                  onClose={() => setShowHistoryPanel(false)}
                  projectId={projectId}
                />
              </>
            )}

            <div className="h-px bg-[var(--hover-bg)] my-4" />

            {/* B-15: Simplified Diff Section */}
            <div className="mb-5">
              <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <GitCompare size={14} />
                Compare
              </h4>

              <div className="flex flex-col gap-2">
                <select
                  className="w-full py-2 px-3 border border-[var(--color-border)] rounded-md text-sm bg-[var(--surface-card)] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:border-[var(--status-info)] disabled:opacity-50 disabled:cursor-not-allowed"
                  value={diffTargetCommit}
                  disabled={allCommittedCommits.length <= 1 || isDiffLoading}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (target) {
                      handleDiffTargetSelect(target);
                    } else {
                      setDiffTargetCommit('');
                    }
                  }}
                >
                  <option value="">
                    {allCommittedCommits.length <= 1
                      ? `Need 2+ ${t('commits').toLowerCase()}`
                      : `Select a ${t('commit').toLowerCase()}...`}
                  </option>
                  {allCommittedCommits
                    .filter((c) => c.data.commitHash !== data.commitHash)
                    .map((c) => (
                      <option key={c.id} value={c.data.commitHash}>
                        {c.data.title || c.data.entryId} ({c.data.commitHash?.slice(0, 8)})
                      </option>
                    ))}
                </select>

                {isDiffLoading && (
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Comparing...</span>
                  </div>
                )}

                {diffError && (
                  <div className="flex items-center gap-2 py-2 px-3 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-md text-[var(--status-error)] text-sm">
                    <AlertCircle size={14} />
                    <span>{diffError}</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
