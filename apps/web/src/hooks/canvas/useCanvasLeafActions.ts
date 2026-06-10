/**
 * useCanvasLeafActions — view-facing API for creating and removing
 * leaves attached to canvas commit nodes.
 *
 * Owns the I/O previously in canvasLeafSlice async methods per v2 §2.5.
 * The slice retains panel state (leafPanelOpen, leafPanelCommitId,
 * leafCreating) and two node-data setters (embedLeafInNode,
 * removeLeafFromNodeState) that this hook calls after the API resolves.
 */

import { useCallback } from 'react';
import { createLeaf, deleteLeaf } from '@/commands/leaves';
import { formatUserFacingError } from '@/domain/format/errors';
import { toEmbeddedLeaf } from '@/hooks/canvas/leafEmbedding';
import { dispatchLeafChanged } from '@/hooks/leaves/leafEvents';
import { getTerminology } from '@/hooks/shared/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import { isDeveloperMode } from '@/store/shared';
import type { Template } from '@/types/api';
import type { LeafType } from '@/types/nodes';

const LEAF_TYPE_LABELS: Record<LeafType, string> = {
  tweet: 'X / Twitter',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  threads: 'Threads',
  article: 'Blog post',
  email: 'Email',
  slack: 'Slack',
  deploy_agent: 'Deploy Agent',
};

interface PanelContext {
  commitId: string;
  commitHash: string;
  projectId: string;
}

function resolvePanelContext(): { ctx: PanelContext | null; reason: string | null } {
  const state = useCanvasStore.getState();
  const commitId = state.leafPanelCommitId;
  if (!commitId) return { ctx: null, reason: 'No commit selected' };

  const unitNode = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
  if (!unitNode) return { ctx: null, reason: 'Unit not found' };

  const commitHash = unitNode.data.commitHash;
  if (!commitHash) {
    const dev = isDeveloperMode();
    return {
      ctx: null,
      reason: `${getTerminology('commit', dev)} not saved yet. Please ${getTerminology(
        'commitAction',
        dev
      ).toLowerCase()} first before adding output.`,
    };
  }

  const projectId = state.projectId;
  if (!projectId) return { ctx: null, reason: 'Project not found' };

  return { ctx: { commitId, commitHash, projectId }, reason: null };
}

export function useCanvasLeafActions() {
  const add = useCallback(async (leafType: LeafType): Promise<string | null> => {
    const store = useCanvasStore.getState();
    const notify = store.notifyCallback;
    const { ctx, reason } = resolvePanelContext();
    if (!ctx) {
      notify?.(reason ?? 'Cannot create leaf', 'error');
      return null;
    }

    store.setLeafCreating(true);

    try {
      const leaf = await createLeaf({
        source: { type: 'user' },
        commit_hash: ctx.commitHash,
        type: leafType,
        title: LEAF_TYPE_LABELS[leafType],
        project_id: ctx.projectId,
        constraints: [],
        config: {},
      });

      const embedded = toEmbeddedLeaf(leaf);

      // Close panel only after the API call succeeds.
      store.closeLeafPanel();
      store.setLeafCreating(false);
      store.embedLeafInNode(ctx.commitId, embedded);
      dispatchLeafChanged({
        projectId: ctx.projectId,
        commitHash: ctx.commitHash,
        leafId: leaf.id,
        reason: 'created',
      });

      notify?.(`${LEAF_TYPE_LABELS[leafType]} created successfully`, 'success');
      return leaf.id;
    } catch (err) {
      const message = formatUserFacingError(err, 'Failed to create leaf.');
      notify?.(message, 'error');
      store.setLeafCreating(false);
      // Keep panel open on failure so the user can retry.
      return null;
    }
  }, []);

  const addFromTemplate = useCallback(async (template: Template): Promise<string | null> => {
    const store = useCanvasStore.getState();
    const notify = store.notifyCallback;
    const { ctx, reason } = resolvePanelContext();
    if (!ctx) {
      notify?.(reason ?? 'Cannot create leaf from template', 'error');
      return null;
    }

    store.setLeafCreating(true);

    try {
      const leafType = template.leaf_type as LeafType;
      const leaf = await createLeaf({
        source: { type: 'user' },
        commit_hash: ctx.commitHash,
        type: leafType,
        title: template.title,
        project_id: ctx.projectId,
        constraints: [],
        config: {
          template_id: template.template_id,
          prompt_template: template.system_prompt,
        },
      });

      const embedded = toEmbeddedLeaf(leaf);

      store.closeLeafPanel();
      store.setLeafCreating(false);
      store.embedLeafInNode(ctx.commitId, embedded);
      dispatchLeafChanged({
        projectId: ctx.projectId,
        commitHash: ctx.commitHash,
        leafId: leaf.id,
        reason: 'created',
      });

      notify?.(`${template.title} leaf created from template`, 'success');
      return leaf.id;
    } catch (err) {
      const message = formatUserFacingError(err, 'Failed to create leaf from template.');
      notify?.(message, 'error');
      store.setLeafCreating(false);
      return null;
    }
  }, []);

  const remove = useCallback(async (commitNodeId: string, leafId: string): Promise<void> => {
    const store = useCanvasStore.getState();
    const notify = store.notifyCallback;
    const node = store.nodes.find((n) => n.id === commitNodeId);
    const projectId = store.projectId;
    const commitHash = node?.data.commitHash;
    try {
      await deleteLeaf(leafId);
      store.removeLeafFromNodeState(commitNodeId, leafId);
      if (projectId) {
        dispatchLeafChanged({ projectId, commitHash, leafId, reason: 'deleted' });
      }
      notify?.('Leaf deleted', 'success');
    } catch (err) {
      const message = formatUserFacingError(err, 'Failed to delete leaf.');
      notify?.(message, 'error');
    }
  }, []);

  return { add, addFromTemplate, remove };
}
