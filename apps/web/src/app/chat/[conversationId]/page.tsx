'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import type { MaterialReaderSelection } from '@/components/chat/MaterialReader';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import {
  isLegacyRepositorySourceLink,
  legacyRepositorySourceTarget,
} from '@/domain/sourceEvidenceNavigation';
import { useInheritFromCommit } from '@/hooks/conversations/useInheritFromCommit';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { useLegacySourceRedirectResolver } from '@/hooks/sources/useLegacySourceRedirectResolver';
import { useChatStore } from '@/store/chatStore';
import { isTemporaryChatId } from '@/store/temporaryChatsStore';

export default function ConversationPage() {
  // Match /chat landing: useSearchParams forces a CSR bailout in Next 16,
  // so keep the route shell responsive by containing it in Suspense.
  return (
    <Suspense fallback={null}>
      <ConversationRoute />
    </Suspense>
  );
}

function ConversationRoute() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();

  if (isLegacyRepositorySourceLink(searchParams)) {
    return (
      <LegacyRepositorySourceRedirect conversationId={conversationId} searchParams={searchParams} />
    );
  }

  return <ConversationWorkbenchRoute conversationId={conversationId} searchParams={searchParams} />;
}

function LegacyRepositorySourceRedirect({
  conversationId,
  searchParams,
}: {
  conversationId: string;
  searchParams: URLSearchParams;
}) {
  const router = useRouter();
  const [error, setError] = useState<Error | null>(null);
  const resolveConversation = useLegacySourceRedirectResolver();

  useEffect(() => {
    let cancelled = false;
    const projectId = searchParams.get('projectId');

    const redirectToSource = (resolvedProjectId: string) => {
      if (cancelled) return;
      router.replace(legacyRepositorySourceTarget(resolvedProjectId, conversationId, searchParams));
    };

    if (projectId) {
      redirectToSource(projectId);
      return () => {
        cancelled = true;
      };
    }

    void resolveConversation(conversationId)
      .then((conversation) => redirectToSource(conversation.project_id))
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught : new Error('Failed to resolve source evidence.')
        );
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, resolveConversation, router, searchParams]);

  if (error) {
    return <ErrorMessage error={error} />;
  }

  return <LoadingSpinner className="h-full" message={`Opening source ${conversationId}...`} />;
}

function ConversationWorkbenchRoute({
  conversationId,
  searchParams,
}: {
  conversationId: string;
  searchParams: URLSearchParams;
}) {
  const router = useRouter();
  const firstMessage = searchParams.get('firstMessage');
  const initialProvider = searchParams.get('provider');
  const initialModel = searchParams.get('model');
  const inheritFromParam = searchParams.get('inheritFrom');
  const introDemoRequested = searchParams.get('introDemo') === '1';
  // Project context comes from two sources:
  //   - the in-memory chat store (filled by sidebar nav, post-extract, etc.)
  //   - a `projectId` query param (set by the empty-project redirect from
  //     /project/[id], or any other deep-link that wants to anchor the
  //     conversation to a specific project on cold start).
  // The query param wins so a direct load / refresh of the chat URL
  // doesn't lose the project context the URL is explicitly carrying.
  // Temporary chats are intentionally projectless; do not let a stale
  // activeProjectId from the previous project bleed into their workspace.
  const projectIdParam = searchParams.get('projectId');
  const activeProjectId = useChatStore((s) => s.activeProjectId);
  const resolvedProjectId = isTemporaryChatId(conversationId)
    ? null
    : (projectIdParam ?? activeProjectId);
  const [materialReader, setMaterialReader] = useState<MaterialReaderSelection | null>(null);

  const { inheritFromCommitHash, clearInherit } = useInheritFromCommit(conversationId);
  const resolvedInheritFromCommitHash = inheritFromParam ?? inheritFromCommitHash;
  const { completeIntroDemo } = useIntroDemoCompletion(resolvedProjectId);

  const handleMaterialReaderChange = useCallback(
    (selection: MaterialReaderSelection | null) => setMaterialReader(selection),
    []
  );

  const continueIntroDemoToWorkspace = useCallback(() => {
    if (!resolvedProjectId) return;
    router.push(
      `${getProjectIdWorkspacePath(resolvedProjectId, {
        branch: 'main',
        sourceConversationId: conversationId,
      })}&introDemo=1`
    );
  }, [conversationId, resolvedProjectId, router]);

  useEffect(() => {
    setMaterialReader(null);
  }, [conversationId, resolvedProjectId]);

  return (
    <div className="flex h-full overflow-hidden">
      <ChatWorkspace
        key={conversationId}
        conversationId={conversationId}
        projectId={resolvedProjectId ?? undefined}
        firstMessage={firstMessage ?? undefined}
        initialProvider={initialProvider ?? undefined}
        initialModel={initialModel ?? undefined}
        className="flex-1 min-w-0"
        inheritFromCommitHash={resolvedInheritFromCommitHash ?? undefined}
        onInheritComplete={clearInherit}
        activeMaterialReader={materialReader}
        onMaterialReaderChange={handleMaterialReaderChange}
        introDemo={introDemoRequested}
        onIntroDemoDone={continueIntroDemoToWorkspace}
        onIntroDemoSkip={() => void completeIntroDemo()}
        introDemoDoneLabel="Open Workspace"
      />
    </div>
  );
}
