'use client';

import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Clock,
  Coins,
  Download,
  GitCompare,
  Loader2,
  MapPin,
  Pin,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import {
  AssertionsSection,
  type Suggestion,
  type Violation,
} from '@/components/optimiser/AssertionsSection';
import { ChartToggle } from '@/components/optimiser/charts/ChartToggle';
import { ReportHeader } from '@/components/optimiser/ReportHeader';
import { type StepRecord, TraceTimeline } from '@/components/optimiser/trace';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { ShareLinkButton } from '@/components/shared/ShareLinkButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PinButton } from '@/components/ui/PinButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { usePinsCrud } from '@/hooks/usePinsCrud';
import { useProjectCrud } from '@/hooks/useProjectCrud';
import {
  type ApiCommit,
  type EngineRun,
  getApiCommit,
  getEngineRun,
  getLeaf,
  type Leaf,
  type NodeSourceRef,
  updateEngineRun,
} from '@/infrastructure';
import { exportRunAsJSON, exportRunAsMarkdown } from '@/lib/exportReport';
import { createRetuneSession } from '@/lib/retune';
import { cn } from '@/lib/utils';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';

// Types for parsed result data
interface DimensionScores {
  task_completion: number;
  tool_use: number;
  trajectory_efficiency: number;
  cost_efficiency: number;
  latency: number;
}

interface TraceSummary {
  trajectory: {
    total_steps: number;
    llm_calls: number;
    tool_calls: number;
    retrieval_calls: number;
    failed_steps: number;
  };
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency_ms: number;
}

interface EvalResult {
  passed: boolean;
  score: number;
  dimension_scores?: DimensionScores;
  violations?: Violation[];
  suggestion?: Suggestion;
}

// LLM-generated assertions (from result.assertions)
// Supports both old format (type/message/patch_suggestion) and new format (passed/details/lesson)
interface LLMAssertion {
  id: string;
  type: 'pass' | 'fail' | 'warning';
  category: string;
  message: string;
  confidence: number;
  patch_suggestion?: string;
  // New format fields (aligned with Leaf Assertion)
  constraint_id?: string;
  passed?: boolean;
  details?: string;
  lesson?: string;
}

interface ParsedRunData {
  evalResult: EvalResult | null;
  traceSummary: TraceSummary | null;
  steps: StepRecord[];
  llmAssertions: LLMAssertion[]; // Array of LLM-generated assertions
}

/**
 * Parse run result data
 */
function parseRunData(run: EngineRun): ParsedRunData {
  const result = run.result as Record<string, unknown> | null;
  if (!result) {
    return { evalResult: null, traceSummary: null, steps: [], llmAssertions: [] };
  }

  // Parse eval result
  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResultRaw = (runReport?.eval_result || result.eval_result) as
    | Record<string, unknown>
    | undefined;

  // Parse suggestion - can be string or object with content/confidence
  let suggestion: Suggestion | undefined;
  const suggestionRaw = evalResultRaw?.suggestion;
  if (typeof suggestionRaw === 'string') {
    suggestion = { content: suggestionRaw };
  } else if (suggestionRaw && typeof suggestionRaw === 'object') {
    const suggestionObj = suggestionRaw as Record<string, unknown>;
    suggestion = {
      content: suggestionObj.content as string,
      confidence: suggestionObj.confidence as number | undefined,
    };
  }

  const evalResult: EvalResult | null = evalResultRaw
    ? {
        passed: evalResultRaw.passed as boolean,
        score: evalResultRaw.score as number,
        dimension_scores: evalResultRaw.dimension_scores as DimensionScores | undefined,
        violations: evalResultRaw.violations as Violation[] | undefined,
        suggestion,
      }
    : null;

  // Parse trace summary
  const traceSummaryRaw = result.trace_summary as Record<string, unknown> | undefined;
  const traceSummary: TraceSummary | null = traceSummaryRaw
    ? {
        trajectory: traceSummaryRaw.trajectory as TraceSummary['trajectory'],
        tokens: traceSummaryRaw.tokens as TraceSummary['tokens'],
        latency_ms: traceSummaryRaw.latency_ms as number,
      }
    : null;

  // Parse steps from run_report.trace or full_trace (fallback)
  // Runner returns: run_report.trace.steps (not run_record.steps)
  const traceRaw = runReport?.trace as Record<string, unknown> | undefined; // trace: execution trace object
  const fullTraceRaw = result.full_trace as Record<string, unknown> | undefined; // full_trace: complete trace (conditional storage)
  const stepsRaw = (traceRaw?.steps || fullTraceRaw?.steps || result.steps) as
    | StepRecord[]
    | undefined;
  const steps = stepsRaw || [];

  // Parse LLM assertions (from result.assertions)
  // Normalize: support both old format (type/message) and new format (passed/details)
  const assertionsRaw = (result.assertions as Record<string, unknown>[] | undefined) || [];
  const llmAssertions: LLMAssertion[] = assertionsRaw.map((a, idx) => ({
    id: (a.id as string) || `assert_${String(idx).padStart(3, '0')}`,
    type:
      typeof a.passed === 'boolean'
        ? a.passed
          ? 'pass'
          : 'fail'
        : (((a.type as string) || 'fail') as 'pass' | 'fail' | 'warning'),
    category: (a.category as string) || 'behavior',
    message: (a.details as string) || (a.message as string) || '',
    confidence: typeof a.confidence === 'number' ? a.confidence : 0.8,
    patch_suggestion: (a.lesson as string) || (a.patch_suggestion as string) || undefined,
    constraint_id: a.constraint_id as string | undefined,
    passed: typeof a.passed === 'boolean' ? a.passed : a.type === 'pass',
    details: (a.details as string) || (a.message as string) || undefined,
    lesson: (a.lesson as string) || (a.patch_suggestion as string) || undefined,
  }));

  return { evalResult, traceSummary, steps, llmAssertions };
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Format token count
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const router = useRouter();

  const [run, setRun] = useState<EngineRun | null>(null);
  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const [commit, setCommit] = useState<ApiCommit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAssertionIds, setSelectedAssertionIds] = useState<Set<string>>(new Set());
  const [pinning, setPinning] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [retuning, setRetuning] = useState(false);
  const isPinned = usePinsStore((s) => s.isPinned);
  const getPinByRef = usePinsStore((s) => s.getPinByRef);
  const { fetch: fetchPins, add: addPin, setAssertions: updatePinAssertions } = usePinsCrud();
  const getProject = useProjectStore((s) => s.getProject);
  const projectsInitialized = useProjectStore((s) => s.initialized);
  const { list: fetchProjects } = useProjectCrud();

  // Ensure project store is initialized (for breadcrumb project name)
  useEffect(() => {
    if (!projectsInitialized) fetchProjects();
  }, [projectsInitialized, fetchProjects]);

  // Load run data + associated leaf
  useEffect(() => {
    async function loadRun() {
      if (!runId) return;

      try {
        const data = await getEngineRun(runId);
        setRun(data);
        if (data.project_id) fetchPins(data.project_id);

        // Fetch associated leaf (for structured assertions)
        if (data.leaf?.id) {
          try {
            const leafData = await getLeaf(data.leaf.id);
            setLeaf(leafData);
          } catch {
            // Leaf fetch failure is non-fatal
          }
        }
      } catch (_err) {
        setError('Failed to load run data');
      } finally {
        setLoading(false);
      }
    }

    loadRun();
  }, [runId]);

  // Fetch commit data for lineage chain (assertion → constraint → node → source_ref)
  useEffect(() => {
    if (!leaf?.commit_hash) return;
    getApiCommit(leaf.commit_hash)
      .then(setCommit)
      .catch(() => {
        // Commit fetch failure is non-fatal
      });
  }, [leaf?.commit_hash]);

  // Build map: constraint_id → source_ref (for lineage links)
  const constraintSourceRefMap = useMemo(() => {
    const map = new Map<string, NodeSourceRef>();
    if (!leaf?.constraints || !commit?.content) return map;

    // Derive nodes from tree nodes for source_ref lookup
    const content = commit.content as import('@t3x-dev/core').SemanticContent;
    type SourceRef = { conversation_id?: string; turn_hash?: string; start_char?: number; end_char?: number };
    const nodes: Array<{ id: string; source_ref: SourceRef | undefined }> = content.trees.map((node, idx) => {
      const id = node.key.startsWith('s_') ? node.key : `s_${node.key}_${idx}`;
      const source_ref: SourceRef | undefined = undefined;
      return { id, source_ref };
    });

    // Index nodes by ID for fast lookup, mapping to NodeSourceRef
    const nodeMap = new Map<string, NodeSourceRef>();
    for (const s of nodes) {
      if (s.source_ref?.conversation_id && s.source_ref?.turn_hash) {
        nodeMap.set(s.id, {
          conversation_id: s.source_ref.conversation_id,
          turn_hash: s.source_ref.turn_hash,
          start_char: s.source_ref.start_char ?? 0,
          end_char: s.source_ref.end_char ?? 0,
        });
      }
    }

    // Map constraint → node → source_ref
    for (const constraint of leaf.constraints) {
      if (constraint.type === 'require' && constraint.source_node) {
        const ref = nodeMap.get(constraint.source_node.frame_type);
        if (ref) {
          map.set(constraint.id, ref);
        }
      }
    }

    return map;
  }, [leaf?.constraints, commit?.content]);

  // Initialize selected assertions: default to failed ones from llmAssertions (parsed from result_json)
  const { llmAssertions: parsedAssertions } = run ? parseRunData(run) : { llmAssertions: [] };
  useEffect(() => {
    if (parsedAssertions.length > 0) {
      const failedIds = parsedAssertions
        .filter((a) => a.type === 'fail' || a.passed === false)
        .map((a) => a.id);
      setSelectedAssertionIds(new Set(failedIds));
    }
  }, [run?.run_id]); // re-init when run changes, not on every render

  // Toggle a single assertion checkbox
  const toggleAssertion = useCallback((id: string) => {
    setSelectedAssertionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setPinSuccess(false);
  }, []);

  // Pin selected assertions to the leaf
  const leafId = run?.leaf?.id;
  const projectId = run?.project_id;
  const leafPinned = leafId ? isPinned('leaf', leafId) : false;
  const existingPin = leafId ? getPinByRef('leaf', leafId) : undefined;

  const handlePinAssertions = useCallback(async () => {
    if (!projectId || !leafId || selectedAssertionIds.size === 0) return;

    setPinning(true);
    setPinSuccess(false);
    try {
      const ids = Array.from(selectedAssertionIds);

      if (leafPinned && existingPin) {
        // Already pinned — update selected_assertion_ids
        await updatePinAssertions(existingPin.id, ids);
      } else {
        // Create pin, then set assertion IDs
        const newPin = await addPin(projectId, 'leaf', leafId);
        if (newPin) {
          await updatePinAssertions(newPin.id, ids);
        }
      }
      setPinSuccess(true);
    } finally {
      setPinning(false);
    }
  }, [
    projectId,
    leafId,
    selectedAssertionIds,
    leafPinned,
    existingPin,
    addPin,
    updatePinAssertions,
  ]);

  // Re-tune: pin selected assertions, create new conversation, and navigate to it
  // Update run metadata (ReportHeader)
  const handleUpdateRun = useCallback(
    async (patch: { title?: string; description?: string; tags?: string[] }) => {
      if (!run) return;
      await updateEngineRun(runId, patch);
      // Optimistic: update local state
      setRun((prev) =>
        prev
          ? {
              ...prev,
              title: patch.title !== undefined ? patch.title || null : prev.title,
              description:
                patch.description !== undefined ? patch.description || null : prev.description,
              tags: patch.tags !== undefined ? patch.tags : prev.tags,
            }
          : prev
      );
    },
    [run, runId]
  );

  const handleRetune = useCallback(async () => {
    if (!projectId || !leafId || !leaf?.commit_hash || selectedAssertionIds.size === 0) return;

    setRetuning(true);
    try {
      const { conversationId } = await createRetuneSession({
        projectId,
        leafId,
        commitHash: leaf.commit_hash,
        selectedAssertionIds: Array.from(selectedAssertionIds),
        existingPinId: existingPin?.id,
      });
      // Refresh pins store so other components see the new/updated pin
      await fetchPins(projectId);
      router.push(`/chat/${conversationId}`);
    } catch (_err) {
      // Retuning failed — stay on current page
    } finally {
      setRetuning(false);
    }
  }, [projectId, leafId, leaf?.commit_hash, selectedAssertionIds, existingPin, fetchPins, router]);

  // Keyboard navigation for assertions
  const assertionIds = useMemo(
    () => (run ? parseRunData(run).llmAssertions.map((a) => a.id) : []),
    [run?.run_id]
  );

  const { activeId: activeAssertionId } = useKeyboardNavigation({
    ids: assertionIds,
    onSelect: (id) => {
      if (id) {
        const el = document.querySelector(`[data-assertion-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    onAction: (id) => toggleAssertion(id),
    enabled: !loading && activeTab === 'assertions',
  });

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading run...</span>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex h-full flex-col gap-[var(--space-section)] p-[var(--space-page)]">
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="mb-[var(--space-group)] h-12 w-12 text-red-500" />
            <h2 className="text-lg font-semibold">Run not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The run ID "<code className="rounded bg-muted px-1">{runId}</code>" could not be
              found.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => router.push('/deploy')}>
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { evalResult, traceSummary, steps, llmAssertions } = parseRunData(run);
  const passed = evalResult?.passed ?? run.status === 'completed';
  const score = evalResult?.score;
  const dimensionScores = evalResult?.dimension_scores;
  const violations = evalResult?.violations || [];
  const suggestion = evalResult?.suggestion;

  return (
    <ErrorBoundary>
      <div className="flex h-full flex-col">
        {/* Fixed Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/deploy')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Breadcrumb
              segments={[
                { label: 'Home', href: '/' },
                ...(run.project_id
                  ? [
                      {
                        label: getProject(run.project_id)?.name || 'Project',
                        href: `/project/${run.project_id}`,
                      },
                    ]
                  : []),
                ...(run.leaf?.id?.startsWith('leaf_') && run.project_id
                  ? [
                      {
                        label: run.leaf.title || run.leaf.id,
                        href: `/project/${run.project_id}/leaf/${run.leaf.id}`,
                      },
                    ]
                  : []),
                { label: run.title || `Run ${runId.slice(0, 8)}` },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <KeyboardHintBar
              hints={[
                { key: 'j k', label: 'navigate' },
                { key: 'o', label: 'toggle' },
                { key: 'esc', label: 'deselect' },
              ]}
            />
            <span className="h-4 w-px bg-[var(--stroke-divider)]" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportRunAsMarkdown(run)}>
                  Export as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRunAsJSON(run)}>
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ShareLinkButton entityType="run" entityId={runId} />
            {run.project_id && run.leaf && (
              <PinButton projectId={run.project_id} type="leaf" refId={run.leaf.id} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/deploy/compare?v1=${runId}`)}
            >
              <GitCompare className="h-4 w-4" />
              Compare
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-[var(--space-page)]">
          <div className="flex flex-col gap-[var(--space-section)]">
            <ReportHeader
              runId={runId}
              title={run.title}
              description={run.description}
              tags={run.tags}
              status={run.status}
              createdAt={run.created_at}
              onUpdate={handleUpdateRun}
            />

            {/* Milestone: Eval Complete Summary Card */}
            {(run.status === 'completed' || run.status === 'failed') &&
              llmAssertions.length > 0 && (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-4 py-3',
                    passed
                      ? 'border-[var(--diff-added-border)] bg-[var(--diff-added-bg)]'
                      : 'border-[var(--diff-removed-border)] bg-[var(--diff-removed-bg)]'
                  )}
                >
                  {passed ? (
                    <CheckCircle className="h-5 w-5 shrink-0 text-[var(--diff-added-accent)]" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-[var(--diff-removed-accent)]" />
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      passed ? 'text-[var(--diff-added-text)]' : 'text-[var(--diff-removed-text)]'
                    )}
                  >
                    Confidence report ready —{' '}
                    {llmAssertions.filter((a) => a.passed || a.type === 'pass').length}/
                    {llmAssertions.length} passed
                  </span>
                  {score !== undefined && (
                    <span
                      className={cn(
                        'ml-auto font-mono text-sm font-semibold',
                        passed
                          ? 'text-[var(--diff-added-accent)]'
                          : 'text-[var(--diff-removed-accent)]'
                      )}
                    >
                      {Math.round(score * 100)}%
                    </span>
                  )}
                </div>
              )}

            {/* Status Bar */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3">
              {/* Pass/Fail Badge */}
              {run.status === 'completed' || run.status === 'failed' ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'px-3 py-1 text-sm',
                    passed
                      ? 'border-green-500/30 bg-green-500/10 text-[var(--status-success)]'
                      : 'border-red-500/30 bg-red-500/10 text-[var(--status-error)]'
                  )}
                >
                  {passed ? (
                    <CheckCircle className="mr-1 h-4 w-4" />
                  ) : (
                    <XCircle className="mr-1 h-4 w-4" />
                  )}
                  {passed ? 'Passed' : 'Failed'}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-[var(--status-info)]"
                >
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  {run.status}
                </Badge>
              )}

              <div className="h-4 w-px bg-border" />

              {/* Score */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Score:</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    passed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
                  )}
                >
                  {score !== undefined ? `${Math.round(score * 100)}%` : '-'}
                </span>
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Latency */}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {traceSummary?.latency_ms ? formatDuration(traceSummary.latency_ms) : '-'}
                </span>
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Tokens */}
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {traceSummary?.tokens?.total_tokens
                    ? formatTokens(traceSummary.tokens.total_tokens)
                    : '-'}{' '}
                  tokens
                </span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trace">Trace</TabsTrigger>
                <TabsTrigger value="assertions">Assertions</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent
                value="overview"
                className="mt-[var(--space-group)] space-y-[var(--space-section)]"
              >
                <div className="grid gap-[var(--space-section)] lg:grid-cols-2">
                  {/* Dimension Scores */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Dimension Scores</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dimensionScores ? (
                        <ChartToggle scores={dimensionScores} />
                      ) : (
                        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                          No dimension scores available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Trajectory Summary */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Trajectory Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {traceSummary ? (
                        <div className="space-y-[var(--space-group)]">
                          {/* Steps */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-2xl font-bold">
                                {traceSummary.trajectory.total_steps}
                              </p>
                              <p className="text-xs text-muted-foreground">Total Steps</p>
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-2xl font-bold">
                                {traceSummary.trajectory.llm_calls}
                              </p>
                              <p className="text-xs text-muted-foreground">LLM Calls</p>
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-2xl font-bold">
                                {traceSummary.trajectory.tool_calls}
                              </p>
                              <p className="text-xs text-muted-foreground">Tool Calls</p>
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-2xl font-bold text-[var(--status-error)]">
                                {traceSummary.trajectory.failed_steps}
                              </p>
                              <p className="text-xs text-muted-foreground">Failed Steps</p>
                            </div>
                          </div>

                          {/* Token breakdown */}
                          <div className="rounded-lg border p-3">
                            <p className="mb-[var(--space-item)] text-sm font-medium">
                              Token Usage
                            </p>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Prompt</span>
                                <span className="font-mono">
                                  {formatTokens(traceSummary.tokens.prompt_tokens)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Completion</span>
                                <span className="font-mono">
                                  {formatTokens(traceSummary.tokens.completion_tokens)}
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-1">
                                <span className="font-medium">Total</span>
                                <span className="font-mono font-medium">
                                  {formatTokens(traceSummary.tokens.total_tokens)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                          No trajectory data available
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Violations & Suggestions */}
                <AssertionsSection violations={violations} suggestion={suggestion} />
              </TabsContent>

              {/* Trace Tab */}
              <TabsContent value="trace" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Execution Trace</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TraceTimeline steps={steps} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Assertions Tab — unified: data from result_json, with Pin + Re-tune actions */}
              <TabsContent value="assertions" className="mt-4 space-y-6">
                {llmAssertions.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        Assertions
                        <Badge variant="outline" className="text-xs font-normal">
                          {llmAssertions.filter((a) => a.passed || a.type === 'pass').length}/
                          {llmAssertions.length} passed
                        </Badge>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Runner evaluation results. Select assertions to pin lessons into future
                        conversations, or Re-tune to start a new iteration.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {llmAssertions.map((assertion) => {
                          const isFailed = assertion.type === 'fail' || assertion.passed === false;
                          const isWarning = assertion.type === 'warning';
                          const isPassed = !isFailed && !isWarning;
                          return (
                            <div
                              key={assertion.id}
                              data-assertion-id={assertion.id}
                              className={cn(
                                'rounded-lg border p-3 transition-shadow',
                                isFailed
                                  ? 'border-red-500/30 bg-red-500/5'
                                  : isWarning
                                    ? 'border-yellow-500/30 bg-yellow-500/5'
                                    : 'border-green-500/30 bg-green-500/5',
                                activeAssertionId === assertion.id &&
                                  'ring-2 ring-[var(--accent-primary)]'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={selectedAssertionIds.has(assertion.id)}
                                  onCheckedChange={() => toggleAssertion(assertion.id)}
                                  className="mt-0.5"
                                />
                                {isFailed ? (
                                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                                ) : isWarning ? (
                                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                                ) : (
                                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs">
                                      {assertion.category}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-xs',
                                        isFailed
                                          ? 'border-red-500/30 text-[var(--status-error)]'
                                          : isWarning
                                            ? 'border-yellow-500/30 text-[var(--status-warning)]'
                                            : 'border-green-500/30 text-[var(--status-success)]'
                                      )}
                                    >
                                      {isPassed ? 'passed' : isFailed ? 'failed' : 'warning'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {Math.round(assertion.confidence * 100)}% confidence
                                    </span>
                                  </div>
                                  <p className="mt-1 text-sm">{assertion.message}</p>
                                  {assertion.patch_suggestion && (
                                    <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-500/10 p-2 text-xs">
                                      <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                                      <div>
                                        <span className="font-medium text-amber-700">Lesson: </span>
                                        <span className="text-amber-900">
                                          {assertion.patch_suggestion}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  {/* Lineage link: assertion → constraint → node → source conversation turn */}
                                  {assertion.constraint_id &&
                                    constraintSourceRefMap.get(assertion.constraint_id) &&
                                    projectId && (
                                      <Link
                                        href={`/chat/${constraintSourceRefMap.get(assertion.constraint_id)!.conversation_id}`}
                                        className="inline-flex items-center gap-1 text-xs text-[var(--status-info)] hover:underline mt-1"
                                      >
                                        <MapPin size={10} />
                                        View source
                                      </Link>
                                    )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Pin Selected & Re-tune buttons */}
                      <div className="mt-4 flex items-center gap-3 border-t pt-4">
                        <Button
                          size="sm"
                          disabled={selectedAssertionIds.size === 0 || pinning || !projectId}
                          onClick={handlePinAssertions}
                        >
                          {pinning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Pin className="h-4 w-4" />
                          )}
                          {leafPinned ? 'Update Pin' : 'Pin Selected'}
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {selectedAssertionIds.size}
                          </Badge>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            selectedAssertionIds.size === 0 || retuning || !leaf?.commit_hash
                          }
                          onClick={handleRetune}
                        >
                          {retuning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Re-tune
                        </Button>
                        {pinSuccess && (
                          <span className="text-xs text-green-600">
                            Pinned — lessons will be available in future conversations.
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                      No assertions available
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
