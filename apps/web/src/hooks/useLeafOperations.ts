/**
 * useLeafOperations — view-facing API for leaf create/delete orchestrations.
 *
 * Owns the I/O + notify + canvas-state embedding that used to live inside
 * canvasLeafSlice actions (addLeafNode / addLeafFromTemplate /
 * removeLeafFromNode). Store now exposes only setters
 * (embedLeafInCommit, removeLeafFromCommit, setLeafCreating); this hook
 * composes them. Return shape preserves the old action names so consumers
 * change an import line plus the store-selector call.
 */

import { useCallback } from 'react';
import { createLeaf, deleteLeaf } from '@/commands/leaves';
import { getTerminology } from '@/hooks/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import { isDeveloperMode } from '@/store/shared';
import type { Template } from '@/types/api';
import type { EmbeddedLeaf, LeafType } from '@/types/nodes';

const LEAF_LABELS: Record<LeafType, string> = {
  tweet: 'Twitter',
  weibo: 'Weibo',
  wechat: 'WeChat Moments',
  email: 'Email',
  article: 'Article',
  slack: 'Slack',
  deploy_agent: 'Deploy Agent',
};

export function useLeafOperations() {
  const addLeafNode = useCallback(async (leafType: LeafType): Promise<string | null> => {
    const state = useCanvasStore.getState();
    const notify = state.notifyCallback;

    const commitId = state.leafPanelCommitId;
    if (!commitId) {
      notify?.('No commit selected', 'error');
      return null;
    }

    const unitNode = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!unitNode) {
      notify?.('Unit not found', 'error');
      return null;
    }

    const commitHash = unitNode.data.commitHash;
    if (!commitHash) {
      const dev = isDeveloperMode();
      notify?.(
        `${getTerminology('commit', dev)} not saved yet. Please ${getTerminology(
          'commitAction',
          dev
        ).toLowerCase()} first before adding output.`,
        'error'
      );
      return null;
    }

    const projectId = state.projectId;
    if (!projectId) {
      notify?.('Project not found', 'error');
      return null;
    }

    state.setLeafCreating(true);

    try {
      const leaf = await createLeaf({
        commit_hash: commitHash,
        type: leafType,
        title: LEAF_LABELS[leafType],
        project_id: projectId,
        constraints: [],
        config: {},
      });

      const s = useCanvasStore.getState();
      s.closeLeafPanel();
      s.setLeafCreating(false);

      const embedded: EmbeddedLeaf = {
        id: leaf.id,
        type: leafType,
        title: LEAF_LABELS[leafType],
        createdAt: leaf.created_at,
      };
      s.embedLeafInCommit(commitId, embedded);

      notify?.(`${LEAF_LABELS[leafType]} created successfully`, 'success');
      return leaf.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create leaf';
      notify?.(message, 'error');
      useCanvasStore.getState().setLeafCreating(false);
      // Keep panel open on failure so user can retry.
      return null;
    }
  }, []);

  const addLeafFromTemplate = useCallback(async (template: Template): Promise<string | null> => {
    const state = useCanvasStore.getState();
    const notify = state.notifyCallback;

    const commitId = state.leafPanelCommitId;
    if (!commitId) {
      notify?.('No commit selected', 'error');
      return null;
    }

    const unitNode = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!unitNode) {
      notify?.('Unit not found', 'error');
      return null;
    }

    const commitHash = unitNode.data.commitHash;
    if (!commitHash) {
      const dev = isDeveloperMode();
      notify?.(
        `${getTerminology('commit', dev)} not saved yet. Please ${getTerminology(
          'commitAction',
          dev
        ).toLowerCase()} first before adding output.`,
        'error'
      );
      return null;
    }

    const projectId = state.projectId;
    if (!projectId) {
      notify?.('Project not found', 'error');
      return null;
    }

    state.setLeafCreating(true);

    try {
      const leafType = template.leaf_type as LeafType;
      const leaf = await createLeaf({
        commit_hash: commitHash,
        type: leafType,
        title: template.title,
        project_id: projectId,
        constraints: [],
        config: {
          template_id: template.template_id,
          prompt_template: template.system_prompt,
        },
      });

      const s = useCanvasStore.getState();
      s.closeLeafPanel();
      s.setLeafCreating(false);

      const embedded: EmbeddedLeaf = {
        id: leaf.id,
        type: leafType,
        title: template.title,
        createdAt: leaf.created_at,
      };
      s.embedLeafInCommit(commitId, embedded);

      notify?.(`${template.title} leaf created from template`, 'success');
      return leaf.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create leaf from template';
      notify?.(message, 'error');
      useCanvasStore.getState().setLeafCreating(false);
      return null;
    }
  }, []);

  const removeLeafFromNode = useCallback(
    async (commitNodeId: string, leafId: string): Promise<void> => {
      const notify = useCanvasStore.getState().notifyCallback;
      try {
        await deleteLeaf(leafId);
        useCanvasStore.getState().removeLeafFromCommit(commitNodeId, leafId);
        notify?.('Leaf deleted', 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete leaf';
        notify?.(message, 'error');
      }
    },
    []
  );

  return { addLeafNode, addLeafFromTemplate, removeLeafFromNode };
}
