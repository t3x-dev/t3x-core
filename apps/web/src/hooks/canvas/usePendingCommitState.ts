'use client';

/**
 * usePendingCommitState — facade for the pending-commit workspace.
 *
 * Before PR25 this was a 517-line god-hook. Now composed from four
 * focused sub-hooks plus local state for config / commit-finalize:
 *   - usePendingCommitLayout      divider drag + ref
 *   - usePendingCommitExtraction  draft + LLM extraction handlers
 *   - usePendingCommitPostCommit  success page + open-as-draft
 *   - findUpstreamCommitHash      pure graph helper (sibling file)
 */

import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { usePendingCommitExtraction } from '@/hooks/canvas/usePendingCommitExtraction';
import { usePendingCommitLayout } from '@/hooks/canvas/usePendingCommitLayout';
import { usePendingCommitPostCommit } from '@/hooks/canvas/usePendingCommitPostCommit';
import { findUpstreamCommitHash } from '@/hooks/canvas/usePendingCommitState.helpers';
import * as api from '@/infrastructure';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

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

  // Config
  const [template, setTemplate] = useState(data.bridgePrompt || 'prose');
  const [configLocked, setConfigLocked] = useState(false);

  // Commit-finalize (stays in facade — tightly tied to branch + data)
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

  // Upstream commit lookup via canvas graph
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const latestMainCommitId = useCanvasStore((state) => state.latestMainCommitId);
  const upstreamCommitHash = useCanvasStore(
    useCallback(
      (s) => (node?.id ? findUpstreamCommitHash(node.id, s.nodes, s.edges) : null),
      [node?.id]
    )
  );

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

  const mainContentRef = useRef<HTMLDivElement | null>(null);

  // Sub-hooks
  const layout = usePendingCommitLayout();
  const extraction = usePendingCommitExtraction();
  const postCommit = usePendingCommitPostCommit({
    projectId,
    node,
    onClose,
    onConvertDraft,
    commitHash: commitSuccess?.commitHash,
    data,
  });

  // Derived values
  const isMergeDraft = data?.bridgePrompt === '/merge' && !!data?.mergeConfig;
  const shouldShowBranchSelect = !isMergeDraft;
  const requireBranchName = !isMergeDraft && data?.pendingBranch === 'branch';
  const hasSourceConversation = !!data?.sourceConversationId || !!data?.conversationId;

  // Load branches from API when opening the modal.
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

  const handleProceed = useCallback(async () => {
    try {
      await extraction.handleProceed(
        {
          projectId,
          sourceConversationId: data.sourceConversationId || data.conversationId,
          title: data.title,
          sourceCommitHash: data.sourceCommitHash,
          pendingBranch: data.pendingBranch,
          pendingBranchName: data.pendingBranchName,
        },
        () => setConfigLocked(true)
      );
    } catch {
      // Unlock config on failure so the user can retry.
      setConfigLocked(false);
    }
  }, [projectId, data, extraction]);

  const handleReExtract = useCallback(async () => {
    const sourceConversationId = data.sourceConversationId || data.conversationId;
    if (!sourceConversationId) return;
    await extraction.handleReExtract(projectId, sourceConversationId);
  }, [projectId, data, extraction]);

  const handleReset = useCallback(() => {
    setConfigLocked(false);
    extraction.resetExtraction();
    setCommitError(null);
  }, [extraction]);

  const handleCommit = useCallback(async () => {
    if (!extraction.draftId || !projectId) {
      setCommitError('No draft created');
      return;
    }

    setIsCommitting(true);
    setCommitError(null);

    try {
      const branch =
        data.pendingBranch === 'branch'
          ? data.pendingBranchName?.trim() || `branch-${Date.now()}`
          : 'main';

      // Validate main-branch linearity.
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
        } else if (
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

      // Create branch if needed.
      if (branch !== 'main' && !branches.some((b) => b.name === branch)) {
        try {
          await api.createBranch(projectId, branch, 'main', undefined, false);
        } catch (branchErr) {
          const errMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
          if (!errMsg.includes('already exists')) throw branchErr;
        }
      }

      const result = await api.commitWorkbenchDraft(extraction.draftId, data.title);
      const commitHash = result.commit.hash as string;

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
          // Non-critical.
        }
      }

      if (commitHash) {
        const freshNode = useCanvasStore.getState().nodes.find((n) => n.id === node.id);
        const liveNodeId = freshNode?.id ?? node.id;
        useCanvasStore.getState().updateNodeId(liveNodeId, commitHash);
      }

      const sourceExcerpt = extraction.semanticPoints
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
  }, [extraction, projectId, data, node, template, onUpdate, branches]);

  return {
    template,
    setTemplate,
    configLocked,

    draftId: extraction.draftId,
    semanticPoints: extraction.semanticPoints,
    setSemanticPoints: extraction.setSemanticPoints,
    extractionLoading: extraction.extractionLoading,
    extractionError: extraction.extractionError,

    isCommitting,
    commitError,
    branches,
    branchesLoading,
    commitSuccess,
    isMainBranchInvalid,

    sidebarSourceDividerPos: layout.sidebarSourceDividerPos,
    openingAsDraft: postCommit.openingAsDraft,

    isMergeDraft,
    shouldShowBranchSelect,
    requireBranchName,
    hasSourceConversation,

    handleSidebarSourceDivider: layout.handleSidebarSourceDivider,
    handleProceed,
    handleReset,
    handleCommit,
    handleReExtract,
    handleSuccessClose: postCommit.handleSuccessClose,
    handleViewCommitDetails: postCommit.handleViewCommitDetails,
    handleCreateOutput: postCommit.handleCreateOutput,
    handleOpenAsDraft: postCommit.handleOpenAsDraft,

    mainContentRef,
    draftBodyRef: layout.draftBodyRef,
  };
}
