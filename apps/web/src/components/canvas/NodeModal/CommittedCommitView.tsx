'use client';

import type { Node } from '@xyflow/react';
import { AlertCircle, Clock, GitBranch, GitCompare, History, Loader2, Tag, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { DiffFullScreen } from '@/components/diff/DiffFullScreen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DiffResult, DiffResultRaw } from '@/lib/api';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData, CommitDisplay } from '@/types/nodes';
import { CommitHistoryPanel } from '../CommitHistoryPanel';
import type { NodeQuickAction } from './NodeModal';
import {
  CommitConstraintsAndLeaves,
  CommitFullHeader,
  CommitSourceContent,
  isCommitV4,
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
  const data = node.data;

  // ========== Internal State ==========

  // History panel
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // Diff state
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [diffTargetCommit, setDiffTargetCommit] = useState<string>('');
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffRawData, setDiffRawData] = useState<DiffResultRaw | null>(null);
  const [showDiffFullScreen, setShowDiffFullScreen] = useState(false);

  // Layout: resizable panels
  const [commitLeftWidth, setCommitLeftWidth] = useState(280);
  const [commitRightWidth, setCommitRightWidth] = useState(280);

  // Refs
  const commitContainerRef = useRef<HTMLDivElement>(null);

  // ========== Computed Values ==========

  // Get all committed commits for diff target selection
  const nodes = useCanvasStore((state) => state.nodes);
  const allCommittedCommits = useMemo(
    () => nodes.filter((n) => n.data.kind === 'unit' && n.data.commitStatus === 'committed'),
    [nodes]
  );

  // Branch label
  const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'main';

  // Keywords and source excerpt from committed data
  const commitMustHave = data.mustHave || [];
  const commitMustntHave = data.mustntHave || [];
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

  // Handle Diff - compare two commits using sentence-level diff
  const handleDiff = useCallback(async () => {
    if (!data?.commitHash || !diffTargetCommit) {
      setDiffError('Please select a commit to compare with');
      return;
    }

    if (data.commitHash === diffTargetCommit) {
      setDiffError('Cannot compare a commit with itself');
      return;
    }

    setIsDiffLoading(true);
    setDiffError(null);
    setDiffResult(null);
    setDiffRawData(null);

    try {
      const [result, raw] = await Promise.all([
        api.diff(data.commitHash, diffTargetCommit),
        api.diffRaw(data.commitHash, diffTargetCommit),
      ]);
      setDiffResult(result);
      setDiffRawData(raw);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDiffError(error.message);
    } finally {
      setIsDiffLoading(false);
    }
  }, [data?.commitHash, data?.commitV3, data?.commitV4, diffTargetCommit, allCommittedCommits]);

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
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // ========== Render ==========

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col w-[95vw] max-w-[1400px] h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Top Bar */}
          <header className="flex items-center justify-between h-14 px-5 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[0.95rem] font-semibold text-gray-800">
                Commit: {data.title || 'Untitled'}
              </h2>
              <span className="text-xs text-gray-400 font-mono">{data.entryId}</span>
              <Badge
                className={cn(
                  'text-xs gap-1',
                  branchLabel === 'main'
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-purple-100 text-purple-700 border-purple-300'
                )}
              >
                <GitBranch size={12} />
                {branchLabel}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="h-9 w-9 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </Button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden min-h-0" ref={commitContainerRef}>
            {/* Left Sidebar - Meta & Lineage */}
            <aside
              className="min-w-[200px] p-5 overflow-y-auto shrink-0 bg-gray-50"
              style={{ width: commitLeftWidth }}
            >
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Version Info
                </h4>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <GitBranch size={14} className="text-gray-400 shrink-0" />
                  <span>
                    Branch: <strong>{branchLabel}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  <span>{data.timestamp}</span>
                </div>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <Tag size={14} className="text-gray-400 shrink-0" />
                  <span>{data.tags.length > 0 ? data.tags.join(', ') : 'No tags'}</span>
                </div>
              </div>

              <div className="h-px bg-gray-200 my-4" />

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Lineage
                </h4>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[0.85rem]">
                    <span className="text-gray-500">From Draft:</span>
                    <span className="text-gray-700 font-mono text-xs">{data.entryId}</span>
                  </div>
                  {data.baselineSummary && (
                    <div className="flex items-center gap-2 text-[0.85rem]">
                      <span className="text-gray-500">Upstream:</span>
                      <span className="text-gray-700">Connected</span>
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
              className="w-1.5 bg-gray-200 cursor-col-resize shrink-0 hover:bg-gray-300 active:bg-blue-500 transition-colors"
              onMouseDown={handleCommitLeftDivider}
            />

            {/* Main Content - Tabbed Source View & Generated Output */}
            <div className="flex-1 min-w-0 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Commit header + tabbed source view */}
              {(data.commitV3 || data.commitV4) &&
                (() => {
                  const commit = (data.commitV4 || data.commitV3) as CommitDisplay;
                  const branchName =
                    data.branchName || (data.branchType === 'main' ? 'main' : undefined);
                  const isV4 = isCommitV4(commit);
                  const commitProjectId = routeProjectId || projectId || undefined;

                  return (
                    <div className="space-y-4">
                      <CommitFullHeader commit={commit} branchName={branchName} />

                      {/* Pinned Sources - V4 only */}
                      {isV4 && commit.source_refs && commit.source_refs.length > 0 && (
                        <PinnedSourcesSection
                          sourceRefs={commit.source_refs}
                          projectId={commitProjectId}
                        />
                      )}

                      {/* Tabbed view: Source Context | Source Excerpt | JSON */}
                      <Tabs defaultValue="context">
                        <TabsList variant="pill" className="w-full">
                          <TabsTrigger value="context" variant="pill">
                            Source Context
                          </TabsTrigger>
                          <TabsTrigger value="excerpt" variant="pill">
                            Source Excerpt
                          </TabsTrigger>
                          <TabsTrigger value="json" variant="pill">
                            JSON
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
                          <div className="p-3 bg-white border border-gray-200 rounded-md min-h-[80px]">
                            {commitSourceExcerpt.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                {commitSourceExcerpt.map((excerpt, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-100"
                                  >
                                    <span className="text-gray-400 font-bold shrink-0">&bull;</span>
                                    <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                                      {excerpt}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                                <span>No source excerpt recorded</span>
                              </div>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="json">
                          <pre className="p-4 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono text-gray-700 overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                            {JSON.stringify(commit, null, 2)}
                          </pre>
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
              {!data.commitV3 && !data.commitV4 && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-gray-700">Generated Output</h3>
                  </div>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-[0.9rem] leading-relaxed text-gray-700">
                    {data.summary || 'No generated content.'}
                  </div>
                </div>
              )}

              {data.status && !data.commitV3 && !data.commitV4 && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-gray-700">Intent</h3>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-md text-[0.9rem] text-gray-700">
                    {data.status}
                  </div>
                </div>
              )}

              {/* Facets - Extracted semantic data (only show if no commit data) */}
              {!data.commitV3 && !data.commitV4 && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-gray-700">Facets</h3>
                    <span className="text-xs text-gray-400">{commitFacets.length} extracted</span>
                  </div>
                  <div>
                    {commitFacets.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {Object.entries(facetsByType).map(([type, facets]) => (
                          <div
                            key={type}
                            className="bg-white border border-gray-200 rounded-md overflow-hidden"
                          >
                            <h5 className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-700">
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
                              <span className="text-xs text-gray-400">({facets.length})</span>
                            </h5>
                            <div className="p-2 flex flex-wrap gap-2">
                              {facets.map((facet, idx) => {
                                // Determine background color based on polarity
                                const polarityClass =
                                  facet.polarity === 1
                                    ? 'bg-green-100 text-green-700'
                                    : facet.polarity === -1
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-50 text-gray-700';

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
                                    key={idx}
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
                                    {facet.confidence !== undefined && facet.confidence < 1 && (
                                      <span className="text-xs opacity-60 font-medium">
                                        {Math.round(facet.confidence * 100)}%
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
                      <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                        <span>No facets extracted</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Divider */}
            <div
              className="w-1.5 bg-gray-200 cursor-col-resize shrink-0 hover:bg-gray-300 active:bg-blue-500 transition-colors"
              onMouseDown={handleCommitRightDivider}
            />

            {/* Right Sidebar - Constraints Summary */}
            <aside
              className="min-w-[200px] p-5 overflow-y-auto shrink-0 bg-gray-50"
              style={{ width: commitRightWidth }}
            >
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Constraints
                </h4>

                <div className="mb-4">
                  <h5 className="text-xs font-medium text-green-600 mb-2">Must-have</h5>
                  {commitMustHave.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {commitMustHave.map((w, i) => (
                        <Badge
                          key={i}
                          className="text-[0.7rem] bg-green-100 text-green-700 border-green-300"
                        >
                          {w}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">None</span>
                  )}
                </div>

                <div className="mb-4">
                  <h5 className="text-xs font-medium text-red-600 mb-2">Mustn&apos;t-have</h5>
                  {commitMustntHave.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {commitMustntHave.map((w, i) => (
                        <Badge
                          key={i}
                          className="text-[0.7rem] bg-red-100 text-red-700 border-red-300"
                        >
                          {w}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">None</span>
                  )}
                </div>
              </div>

              {/* History Section */}
              {data.commitV4 && data.commitHash && (
                <>
                  <div className="h-px bg-gray-200 my-4" />
                  <div className="mb-5">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <History size={14} />
                      History
                    </h4>
                    <Button
                      variant="outline"
                      onClick={() => setShowHistoryPanel(true)}
                      className="w-full gap-2"
                    >
                      <History size={14} />
                      <span>View commit history</span>
                    </Button>
                  </div>
                  <CommitHistoryPanel
                    commitHash={data.commitHash}
                    open={showHistoryPanel}
                    onClose={() => setShowHistoryPanel(false)}
                  />
                </>
              )}

              <div className="h-px bg-gray-200 my-4" />

              {/* Diff Section */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <GitCompare size={14} />
                  Compare
                </h4>

                {!showDiffPanel ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowDiffPanel(true)}
                    disabled={allCommittedCommits.length <= 1}
                    title={
                      allCommittedCommits.length <= 1
                        ? 'Need at least 2 commits to compare'
                        : 'Compare with another commit'
                    }
                    className="w-full gap-2"
                  >
                    <GitCompare size={14} />
                    <span>Compare with...</span>
                  </Button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-gray-500">Compare with:</label>
                      <select
                        className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm bg-white text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                        value={diffTargetCommit}
                        onChange={(e) => {
                          setDiffTargetCommit(e.target.value);
                          setDiffError(null);
                        }}
                      >
                        <option value="">Select a commit...</option>
                        {allCommittedCommits
                          .filter((c) => c.data.commitHash !== data.commitHash)
                          .map((c) => (
                            <option key={c.id} value={c.data.commitHash}>
                              {c.data.title || c.data.entryId} ({c.data.commitHash?.slice(0, 8)})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleDiff}
                        disabled={!diffTargetCommit || isDiffLoading}
                        className="flex-1 gap-1.5"
                      >
                        {isDiffLoading ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Comparing...</span>
                          </>
                        ) : (
                          <>
                            <GitCompare size={14} />
                            <span>Run Diff</span>
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDiffPanel(false);
                          setDiffTargetCommit('');
                          setDiffError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>

                    {diffError && (
                      <div className="flex items-center gap-2 py-2 px-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm mt-2">
                        <AlertCircle size={14} />
                        <span>{diffError}</span>
                      </div>
                    )}

                    {diffResult && (
                      <div className="mt-3 p-3 bg-white border border-gray-200 rounded-md">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-600">Facet Changes:</span>
                          <Badge variant="outline" className="text-xs">
                            {diffResult.diff.facet_changes.length}
                          </Badge>
                        </div>

                        {diffRawData && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mb-3 gap-1.5"
                            onClick={() => setShowDiffFullScreen(true)}
                          >
                            <GitCompare size={14} />
                            Open Full Diff
                          </Button>
                        )}

                        {diffResult.diff.facet_changes.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {diffResult.diff.facet_changes.map((change, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  'p-2 rounded border text-sm',
                                  change.change_type === 'added' && 'bg-green-50 border-green-200',
                                  change.change_type === 'removed' && 'bg-red-50 border-red-200',
                                  change.change_type === 'modified' &&
                                    'bg-amber-50 border-amber-200'
                                )}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-xs',
                                      change.change_type === 'added' &&
                                        'text-green-600 border-green-300',
                                      change.change_type === 'removed' &&
                                        'text-red-600 border-red-300',
                                      change.change_type === 'modified' &&
                                        'text-amber-600 border-amber-300'
                                    )}
                                  >
                                    {change.change_type}
                                  </Badge>
                                  <span className="font-medium text-gray-700">{change.facet}</span>
                                </div>
                                {change.base_text && (
                                  <div className="text-red-600 text-xs font-mono bg-red-100/50 px-2 py-1 rounded">
                                    - {change.base_text}
                                  </div>
                                )}
                                {change.target_text && (
                                  <div className="text-green-600 text-xs font-mono bg-green-100/50 px-2 py-1 rounded mt-1">
                                    + {change.target_text}
                                  </div>
                                )}
                                {change.added_keywords.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1 mt-2">
                                    <span className="text-xs text-gray-500">Added:</span>
                                    {change.added_keywords.map((kw, i) => (
                                      <Badge
                                        key={i}
                                        className="text-xs bg-green-100 text-green-700"
                                      >
                                        {kw}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {change.removed_keywords.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1 mt-2">
                                    <span className="text-xs text-gray-500">Removed:</span>
                                    {change.removed_keywords.map((kw, i) => (
                                      <Badge key={i} className="text-xs bg-red-100 text-red-700">
                                        {kw}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {diffResult.diff.facet_changes.length === 0 && (
                          <div className="text-center py-4 text-sm text-gray-400">
                            No facet changes detected
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {diffRawData && data?.commitHash && (
        <DiffFullScreen
          open={showDiffFullScreen}
          onClose={() => setShowDiffFullScreen(false)}
          baseCommitHash={data.commitHash}
          targetCommitHash={diffTargetCommit}
          diffData={diffRawData}
        />
      )}
    </>
  );
}
