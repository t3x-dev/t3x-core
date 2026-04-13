'use client';

import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useCanvasNodeActions } from '@/hooks/useCanvasNodeActions';
import * as api from '@/infrastructure';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

/**
 * Walk the canvas graph upstream from a staging node to find the nearest
 * committed unit's commitHash. Handles the case where sourceCommitHash
 * wasn't set on the node data (e.g., manual edge drag).
 */
function findUpstreamCommitHash(
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[]
): string | undefined {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const stack = edges.filter((e) => e.target === nodeId).map((e) => e.source);

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const n = nodeMap.get(id);
    if (!n) continue;
    if (n.data.kind === 'unit' && n.data.commitStatus === 'committed' && n.data.commitHash) {
      return n.data.commitHash;
    }
    for (const e of edges) {
      if (e.target === id && !visited.has(e.source)) {
        stack.push(e.source);
      }
    }
  }
  return undefined;
}

interface UsePendingCommitStateProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  onConvertDraft: (() => void) | undefined;
}

export interface UsePendingCommitStateReturn {
  // Config state
  template: string;
  setTemplate: (v: string) => void;
  configLocked: boolean;

  // Draft/Extraction state (LLM pipeline)
  draftId: string | null;
  semanticPoints: api.SemanticPointAPI[];
  setSemanticPoints: (points: api.SemanticPointAPI[]) => void;
  extractionLoading: boolean;
  extractionError: string | null;

  // Commit state
  isCommitting: boolean;
  commitError: string | null;
  branches: api.Branch[];
  branchesLoading: boolean;
  commitSuccess: {
    commitHash: string;
    parentHash: string | null;
    diffStats: {
      sameCount: number;
      addedCount: number;
      removedCount: number;
      modifiedCount: number;
    } | null;
  } | null;
  isMainBranchInvalid: boolean;

  // Layout state
  sidebarSourceDividerPos: number;

  // Draft state
  openingAsDraft: boolean;

  // Derived values
  isMergeDraft: boolean;
  shouldShowBranchSelect: boolean;
  requireBranchName: boolean;
  hasSourceConversation: boolean;
  // Callbacks
  handleSidebarSourceDivider: (e: React.MouseEvent) => void;
  handleProceed: () => void;
  handleReset: () => void;
  handleCommit: () => Promise<void>;
  handleReExtract: () => Promise<void>;
  handleSuccessClose: () => void;
  handleViewCommitDetails: () => void;
  handleCreateOutput: () => void;
  handleOpenAsDraft: () => Promise<void>;

  // Refs
  mainContentRef: React.RefObject<HTMLDivElement | null>;
  draftBodyRef: React.RefObject<HTMLDivElement | null>;
}

export function usePendingCommitState({
  node,
  onClose,
  onUpdate,
  projectId,
  onConvertDraft,
}: UsePendingCommitStateProps): UsePendingCommitStateReturn {
  const data = node.data;
  const { load: loadCanvas } = useCanvasNodeActions();

  // ========== Config state (STEP 1) ==========
  const [template, setTemplate] = useState(data.bridgePrompt || 'prose');
  const [configLocked, setConfigLocked] = useState(false);

  // ========== Draft/Extraction state (LLM pipeline) ==========
  const [draftId, setDraftId] = useState<string | null>(null);
  const [semanticPoints, setSemanticPoints] = useState<api.SemanticPointAPI[]>([]);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // ========== Commit state ==========
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [branches, setBranches] = useState<api.Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<{
    commitHash: string;
    parentHash: string | null;
    diffStats: {
      sameCount: number;
      addedCount: number;
      removedCount: number;
      modifiedCount: number;
    } | null;
  } | null>(null);

  // Get main branch state from canvas store to show warning when selecting main branch
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const latestMainCommitId = useCanvasStore((state) => state.latestMainCommitId);
  const upstreamCommitHash = useCanvasStore(
    useCallback(
      (s) => (node?.id ? findUpstreamCommitHash(node.id, s.nodes, s.edges) : null),
      [node?.id]
    )
  );

  // Compute whether main branch selection is invalid
  const isMainBranchInvalid = useMemo(() => {
    if (data.pendingBranch === 'branch') return false;
    if (!hasMainCommit) return false;
    const effectiveSourceHash = data.sourceCommitHash || upstreamCommitHash;
    if (!effectiveSourceHash) return true;
    return effectiveSourceHash !== latestMainCommitId;
  }, [
    data.pendingBranch,
    data.sourceCommitHash,
    hasMainCommit,
    latestMainCommitId,
    upstreamCommitHash,
  ]);

  // ========== Layout state ==========
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240);

  // ========== Refs ==========
  const mainContentRef = useRef<HTMLDivElement>(null);
  const draftBodyRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // ========== Derived values ==========
  const isMergeDraft = data?.bridgePrompt === '/merge' && !!data?.mergeConfig;
  const shouldShowBranchSelect = !isMergeDraft;
  const requireBranchName = !isMergeDraft && data?.pendingBranch === 'branch';
  const hasSourceConversation = !!data?.sourceConversationId || !!data?.conversationId;

  // ========== Callbacks ==========

  // Cleanup drag listeners on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  // Sidebar | SOURCE divider handler
  const handleSidebarSourceDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftBodyRef.current) return;
      const rect = draftBodyRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - rect.left;
      setSidebarSourceDividerPos(Math.max(220, Math.min(400, newWidth)));
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      cleanup();
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Proceed — create WorkbenchDraft and auto-trigger LLM extraction
  const handleProceed = useCallback(async () => {
    const sourceConversationId = data.sourceConversationId || data.conversationId;
    if (!sourceConversationId || !projectId) return;

    setConfigLocked(true);
    setExtractionLoading(true);
    setExtractionError(null);

    try {
      // 1. Determine branch
      let branch: string;
      if (data.pendingBranch === 'branch') {
        branch = data.pendingBranchName?.trim() || `branch-${Date.now()}`;
      } else {
        branch = 'main';
      }

      // 2. Create WorkbenchDraft
      const draft = await api.createWorkbenchDraft({
        project_id: projectId,
        title: data.title || 'Untitled Unit',
        parent_commit_hash: data.sourceCommitHash || undefined,
        target_branch: branch,
      });
      setDraftId(draft.id);

      // 3. Auto-trigger LLM extraction
      const result = await api.extractIncremental(projectId, sourceConversationId, draft.id);

      setSemanticPoints([...result.ready_points, ...result.review_points]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed';
      setExtractionError(msg);
      setConfigLocked(false);
      toast.error(msg);
    } finally {
      setExtractionLoading(false);
    }
  }, [projectId, data]);

  // Handle Re-Extract — re-run LLM extraction on same draft
  const handleReExtract = useCallback(async () => {
    if (!draftId || !projectId) return;
    const sourceConversationId = data.sourceConversationId || data.conversationId;
    if (!sourceConversationId) return;

    setExtractionLoading(true);
    setExtractionError(null);

    try {
      const result = await api.extractIncremental(projectId, sourceConversationId, draftId);
      setSemanticPoints([...result.ready_points, ...result.review_points]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Re-extraction failed';
      setExtractionError(msg);
      toast.error(msg);
    } finally {
      setExtractionLoading(false);
    }
  }, [draftId, projectId, data]);

  // Handle Reset - unlock config and clear draft/extraction state
  const handleReset = useCallback(() => {
    setConfigLocked(false);
    setDraftId(null);
    setSemanticPoints([]);
    setExtractionError(null);
    setCommitError(null);
  }, []);

  // Handle Commit — commit via WorkbenchDraft API
  const handleCommit = useCallback(async () => {
    if (!draftId || !projectId) {
      setCommitError('No draft created');
      return;
    }

    setIsCommitting(true);
    setCommitError(null);

    try {
      // 1. Determine branch
      let branch: string;
      if (data.pendingBranch === 'branch') {
        branch = data.pendingBranchName?.trim() || `branch-${Date.now()}`;
      } else {
        branch = 'main';
      }

      // 2. Validate main branch linearity
      if (branch === 'main') {
        const canvasState = useCanvasStore.getState();
        if (!data.sourceCommitHash) {
          if (canvasState.hasMainCommit) {
            setCommitError(
              'A root commit on main branch already exists. Please select a different branch.'
            );
            setIsCommitting(false);
            return;
          }
        } else {
          if (
            canvasState.hasMainCommit &&
            data.sourceCommitHash !== canvasState.latestMainCommitId
          ) {
            setCommitError(
              'Can only extend main branch from its latest commit. Please select a different branch or create a new branch.'
            );
            setIsCommitting(false);
            return;
          }
        }
      }

      // 3. Create branch if needed
      if (branch !== 'main' && !branches.some((b) => b.name === branch)) {
        try {
          await api.createBranch(projectId, branch, 'main', undefined, false);
        } catch (branchErr) {
          const errMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
          if (!errMsg.includes('already exists')) {
            throw branchErr;
          }
        }
      }

      // 4. Commit via draft API
      const result = await api.commitWorkbenchDraft(draftId, data.title);
      const commitHash = result.commit.hash as string;

      // 5. Fetch diff stats if there's a parent commit
      const parentHash = data.sourceCommitHash || null;
      let diffStats: {
        sameCount: number;
        addedCount: number;
        removedCount: number;
        modifiedCount: number;
      } | null = null;
      if (parentHash) {
        try {
          const rawDiff = await api.diffRaw(parentHash, commitHash);
          diffStats = {
            sameCount: rawDiff.stats.sameCount,
            addedCount: rawDiff.stats.addedCount,
            removedCount: rawDiff.stats.removedCount,
            modifiedCount: rawDiff.stats.modifiedCount,
          };
        } catch {
          // Diff fetch failure is non-critical
        }
      }

      // 6. Update canvas node ID to match commit hash
      if (commitHash) {
        const freshNode = useCanvasStore.getState().nodes.find((n) => n.id === node.id);
        const liveNodeId = freshNode?.id ?? node.id;
        useCanvasStore.getState().updateNodeId(liveNodeId, commitHash);
      }

      // 7. Build sourceExcerpt from semantic points for node update
      const sourceExcerpt = semanticPoints
        .filter((sp) => sp.zone === 'ready' && sp.status !== 'undone' && sp.staged)
        .map((sp) => sp.text);

      onUpdate({
        summary: sourceExcerpt.join('\n'),
        bridgePrompt: template,
        isGenerated: true,
        commitHash,
        commitStatus: 'committed',
      });

      setCommitSuccess({ commitHash, parentHash, diffStats });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setCommitError(error.message);
    } finally {
      setIsCommitting(false);
    }
  }, [draftId, projectId, data, node, template, onUpdate, branches, semanticPoints]);

  // ========== Effects ==========

  // Load branches from API when opening pending commit modal
  useEffect(() => {
    if (!projectId) return;

    const loadBranches = async () => {
      setBranchesLoading(true);
      try {
        const response = await api.listBranches(projectId);
        setBranches(response.branches);
      } catch {
        setBranches([]);
      } finally {
        setBranchesLoading(false);
      }
    };

    loadBranches();
  }, [projectId]);

  // ========== B-7: Handle success page actions ==========
  const handleSuccessClose = useCallback(() => {
    void loadCanvas(projectId);
    onClose();
  }, [projectId, onClose, loadCanvas]);

  const handleViewCommitDetails = useCallback(() => {
    void loadCanvas(projectId);
    onConvertDraft?.();
  }, [projectId, onConvertDraft, loadCanvas]);

  const handleCreateOutput = useCallback(() => {
    void loadCanvas(projectId);
    onConvertDraft?.();
    if (node?.id) {
      queueMicrotask(() => {
        useCanvasStore.getState().openLeafPanel(commitSuccess?.commitHash || node.id);
      });
    }
  }, [projectId, onConvertDraft, node?.id, commitSuccess?.commitHash, loadCanvas]);

  // ========== B-8: Open as Draft ==========
  const [openingAsDraft, setOpeningAsDraft] = useState(false);

  const handleOpenAsDraft = useCallback(async () => {
    setOpeningAsDraft(true);
    try {
      const newDraft = await api.createWorkbenchDraft({
        project_id: projectId,
        title: data.title || 'Draft from Canvas',
        parent_commit_hash: data.sourceCommitHash || undefined,
        target_branch:
          data.pendingBranch === 'branch' ? data.pendingBranchName || 'branch' : 'main',
      });

      const routeProject = data.projectId || projectId;
      window.location.href = `/project/${routeProject}/draft/${newDraft.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create draft');
    } finally {
      setOpeningAsDraft(false);
    }
  }, [projectId, data]);

  return {
    // Config state
    template,
    setTemplate,
    configLocked,

    // Draft/Extraction state (LLM pipeline)
    draftId,
    semanticPoints,
    setSemanticPoints,
    extractionLoading,
    extractionError,

    // Commit state
    isCommitting,
    commitError,
    branches,
    branchesLoading,
    commitSuccess,
    isMainBranchInvalid,

    // Layout state
    sidebarSourceDividerPos,

    // Draft state
    openingAsDraft,

    // Derived values
    isMergeDraft,
    shouldShowBranchSelect,
    requireBranchName,
    hasSourceConversation,

    // Callbacks
    handleSidebarSourceDivider,
    handleProceed,
    handleReset,
    handleCommit,
    handleReExtract,
    handleSuccessClose,
    handleViewCommitDetails,
    handleCreateOutput,
    handleOpenAsDraft,

    // Refs
    mainContentRef,
    draftBodyRef,
  };
}
