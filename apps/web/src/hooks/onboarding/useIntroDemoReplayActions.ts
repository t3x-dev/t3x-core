'use client';

import {
  DEMO_WORKSPACE_FIXTURE,
  type SemanticContent,
  type Source,
  type SourcedYOp,
  type TreeNode,
} from '@t3x-dev/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { EXTRACTION_TOAST_ID } from '@/hooks/drafts/extractionToast';
import { saveIntroDemoLocalCommit } from '@/hooks/onboarding/introDemoLocalCommit';
import { useChatStore } from '@/store/chatStore';
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
    if (store.isCommitted) return DEMO_COMMIT_HASH;

    store.setMode('committing');
    await delay(420);

    const hash = DEMO_COMMIT_HASH;
    useWorkspaceStore.getState().setMode('idle');
    useWorkspaceStore.getState().setCommitted(true);
    toast.success(message?.trim() ? `Committed: ${message.trim()}` : 'Demo commit created');

    const projectId = useChatStore.getState().activeProjectId ?? store.activeProjectId ?? undefined;
    const conversationId = store.conversationId ?? undefined;
    const branch = useChatStore.getState().activeBranch;
    const commitMessage = message?.trim() || 'Demo Commit';
    if (projectId && conversationId) {
      saveIntroDemoLocalCommit({
        projectId,
        conversationId,
        hash,
        branch,
        message: commitMessage,
        committedAt: new Date().toISOString(),
        content: demoTree(),
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('t3x:commit-created', {
          detail: {
            type: 'commit.created',
            projectId,
            conversationId,
            conversationIds: conversationId ? [conversationId] : [],
            branch,
            payload: { hash, branch },
          },
        })
      );
    }

    useChatStore.getState().refreshSidebar();
    return hash;
  }, []);

  return { extract, apply, commit };
}
