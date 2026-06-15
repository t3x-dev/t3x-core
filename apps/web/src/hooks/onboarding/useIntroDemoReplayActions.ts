'use client';

import {
  DEMO_WORKSPACE_FIXTURE,
  flattenTrees,
  type SemanticContent,
  type Source,
  type SourcedYOp,
  type TreeNode,
} from '@t3x-dev/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { createCommit } from '@/commands/commits';
import { formatUserFacingError } from '@/domain/format/errors';
import { EXTRACTION_TOAST_ID } from '@/hooks/drafts/extractionToast';
import {
  readIntroDemoLocalCommit,
  saveIntroDemoLocalCommit,
} from '@/hooks/onboarding/introDemoLocalCommit';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const DEMO_DELAY_MS = 650;
export const DEMO_COMMIT_HASH = 'sha256:intro-demo-replay';
const FIXTURE_ROOT_KEY = 'support_escalation_review';
export const INTRO_DEMO_ROOT_KEY = 'prompt_review_intake';

function delay(ms = DEMO_DELAY_MS) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function demoSource(): Source {
  const turn = useWorkspaceStore.getState().turns.find((item) => item.role === 'user');
  const quote = turn?.content.trim().slice(0, 240) || DEMO_WORKSPACE_FIXTURE.source.text;
  return {
    type: 'llm',
    model: 'fixture-replay',
    at: new Date().toISOString(),
    turn_ref: {
      turn_hash: turn?.turn_hash ?? 'sha256:intro-demo-source',
      quote,
    },
  };
}

function rewriteDemoPath(value: string): string {
  if (value === FIXTURE_ROOT_KEY) return INTRO_DEMO_ROOT_KEY;
  if (value.startsWith(`${FIXTURE_ROOT_KEY}/`)) {
    return `${INTRO_DEMO_ROOT_KEY}${value.slice(FIXTURE_ROOT_KEY.length)}`;
  }
  return value;
}

function rewriteDemoValue(value: unknown): unknown {
  if (typeof value === 'string') return rewriteDemoPath(value);
  if (Array.isArray(value)) return value.map(rewriteDemoValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        rewriteDemoValue(entry),
      ])
    );
  }
  return value;
}

function rewriteDemoTreeNode(node: TreeNode): TreeNode {
  return {
    key: rewriteDemoPath(node.key),
    slots: rewriteDemoValue(node.slots) as TreeNode['slots'],
    children: node.children.map(rewriteDemoTreeNode),
  };
}

export function demoOps(): SourcedYOp[] {
  const source = demoSource();
  return DEMO_WORKSPACE_FIXTURE.replay.yops.map(
    (op) =>
      ({
        ...(rewriteDemoValue(op) as Record<string, unknown>),
        source,
      }) as SourcedYOp
  );
}

export function demoTree(): SemanticContent {
  return {
    trees: DEMO_WORKSPACE_FIXTURE.replay.trees.map(rewriteDemoTreeNode),
    relations: DEMO_WORKSPACE_FIXTURE.replay.relations.map((relation) => ({
      ...relation,
      from: rewriteDemoPath(relation.from),
      to: rewriteDemoPath(relation.to),
    })),
  };
}

function buildCommittedSnapshot(content: SemanticContent): {
  committedNodeIds: Record<string, boolean>;
  committedNodeSnapshot: Record<string, TreeNode>;
} {
  const committedNodeIds: Record<string, boolean> = {};
  const committedNodeSnapshot: Record<string, TreeNode> = {};

  for (const node of flattenTrees(content.trees)) {
    committedNodeIds[node.id] = true;
  }
  for (const tree of content.trees) {
    committedNodeSnapshot[tree.key] = { ...tree, slots: { ...tree.slots } };
  }

  return { committedNodeIds, committedNodeSnapshot };
}

export function useIntroDemoReplayActions() {
  const extract = useCallback(async () => {
    const store = useWorkspaceStore.getState();
    const projectId = useChatStore.getState().activeProjectId ?? store.activeProjectId;

    if (store.isCommitted) {
      toast.message('This demo conversation is already committed.', { id: EXTRACTION_TOAST_ID });
      return;
    }
    if (store.hasDraft) {
      toast.message('Apply or discard the staged demo extract first.', {
        id: EXTRACTION_TOAST_ID,
      });
      return;
    }

    if (projectId && store.activeProjectId !== projectId) store.setActiveProject(projectId);
    store.setPanelExpanded(true);
    store.setMode('streaming');
    store.setError(null);
    store.clearEditorOverride();
    toast.message('Replaying the preset extraction. No provider call is made.', {
      id: EXTRACTION_TOAST_ID,
    });

    await delay();

    useWorkspaceStore.getState().setDraft({
      ops: demoOps(),
      tree: demoTree(),
      variants: {
        concise: demoOps(),
        balanced: demoOps(),
        detailed: demoOps(),
      },
    });
    useWorkspaceStore.getState().setMode('idle');
    toast.dismiss(EXTRACTION_TOAST_ID);
  }, []);

  const apply = useCallback(async (): Promise<boolean> => {
    const store = useWorkspaceStore.getState();
    if (!store.hasDraft) return false;

    store.setMode('committing');
    store.setError(null);
    await delay(420);

    const next = useWorkspaceStore.getState();
    next.setDerived({
      tree: demoTree(),
      sourceIndex: next.sourceIndex,
      opsLog: demoOps(),
      hasConversationChanges: true,
    });
    next.clearDraft();
    useWorkspaceStore.getState().setMode('executed');
    return true;
  }, []);

  const commit = useCallback(async (message?: string): Promise<string | null> => {
    const store = useWorkspaceStore.getState();
    if (store.hasDraft) {
      toast.error('Apply the staged demo extract before committing.');
      return null;
    }
    const chatState = useChatStore.getState();
    const commitState = useCommitStore.getState();
    const projectId =
      chatState.activeProjectId ?? store.activeProjectId ?? commitState.projectId ?? undefined;
    if (store.isCommitted) return readIntroDemoLocalCommit(projectId)?.hash ?? DEMO_COMMIT_HASH;

    const conversationId = store.conversationId ?? chatState.activeConversationId ?? undefined;
    if (!projectId || !conversationId) {
      toast.error('Demo commit needs a project and conversation.');
      return null;
    }

    store.setMode('committing');
    useCommitStore.getState().setIsCommitting(true);

    try {
      await delay(420);

      const content = demoTree();
      const branch = chatState.activeBranch || commitState.commitBranch || 'main';
      const commitMessage = message?.trim() || 'Demo Commit';
      const result = await createCommit(projectId, content, {
        parents: commitState.lastCommitHash ? [commitState.lastCommitHash] : [],
        branch,
        message: commitMessage,
        sources: [
          {
            type: 'conversation',
            id: conversationId,
            title: commitState.conversationTitle ?? chatState.conversationTitle ?? undefined,
          },
        ],
        source_conversation_id: conversationId,
        provenance: { method: 'llm_extraction', model: 'fixture-replay' },
      });
      const hash = result.commit.hash;
      const { committedNodeIds, committedNodeSnapshot } = buildCommittedSnapshot(content);

      useCommitStore.getState().setCommitSuccess({
        lastCommitHash: hash,
        committedNodeIds,
        committedNodeSnapshot,
      });
      useWorkspaceStore.getState().setMode('idle');
      useWorkspaceStore.getState().setCommitted(true);
      toast.success(message?.trim() ? `Committed: ${message.trim()}` : 'Demo commit created');
      saveIntroDemoLocalCommit({
        projectId,
        conversationId,
        hash,
        branch,
        message: commitMessage,
        committedAt: new Date().toISOString(),
        content,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('t3x:commit-created', {
            detail: {
              type: 'commit.created',
              projectId,
              conversationId,
              conversationIds: [conversationId],
              branch,
              payload: { hash, branch },
            },
          })
        );
      }

      useChatStore.getState().refreshSidebar();
      return hash;
    } catch (err) {
      useWorkspaceStore.getState().setMode('idle');
      useCommitStore.getState().setIsCommitting(false);
      useCommitStore
        .getState()
        .setCommitError(formatUserFacingError(err, 'Demo commit failed.'));
      toast.error(formatUserFacingError(err, 'Demo commit failed.'));
      return null;
    }
  }, []);

  return { extract, apply, commit };
}
