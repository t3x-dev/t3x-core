'use client';

import {
  DEMO_WORKSPACE_FIXTURE,
  type SemanticContent,
  type Source,
  type SourcedYOp,
} from '@t3x-dev/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { EXTRACTION_TOAST_ID } from '@/hooks/drafts/extractionToast';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const DEMO_DELAY_MS = 650;
const DEMO_COMMIT_HASH = 'sha256:intro-demo-replay';

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

function demoOps(): SourcedYOp[] {
  const source = demoSource();
  return DEMO_WORKSPACE_FIXTURE.replay.yops.map((op) => ({ ...op, source }) as SourcedYOp);
}

function demoTree(): SemanticContent {
  return {
    trees: DEMO_WORKSPACE_FIXTURE.replay.trees,
    relations: DEMO_WORKSPACE_FIXTURE.replay.relations,
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('t3x:commit-created', {
          detail: {
            type: 'commit.created',
            projectId,
            conversationId,
            conversationIds: conversationId ? [conversationId] : [],
            branch: useChatStore.getState().activeBranch,
            payload: { hash, branch: useChatStore.getState().activeBranch },
          },
        })
      );
    }

    useChatStore.getState().refreshSidebar();
    return hash;
  }, []);

  return { extract, apply, commit };
}
