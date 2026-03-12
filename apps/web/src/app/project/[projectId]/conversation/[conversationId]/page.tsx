'use client';

import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { ConversationWorkspace } from '@/components/conversation/ConversationWorkspace';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { useConversationChat } from '@/hooks/useConversationChat';
import type { Conversation } from '@/lib/api';
import { getConversation } from '@/lib/api';
import { useProjectStore } from '@/store/projectStore';

export default function ConversationPage() {
  return (
    <Suspense>
      <ConversationPageContent />
    </Suspense>
  );
}

function ConversationPageContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const conversationId = params.conversationId as string;
  const projectName = useProjectStore((s) => s.getProject(projectId))?.name;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load conversation metadata
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    getConversation(conversationId)
      .then((data) => {
        setConversation(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }, [conversationId]);

  const chat = useConversationChat({
    projectId,
    conversationId,
    title: conversation?.title,
  });

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading conversation..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage
          error={error}
          onRetry={() => {
            setError(null);
            setLoading(true);
            getConversation(conversationId)
              .then((data) => {
                setConversation(data);
                setError(null);
              })
              .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
              .finally(() => setLoading(false));
          }}
        />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumb
            segments={[
              { label: 'Home', href: '/' },
              { label: projectName || 'Project', href: `/project/${projectId}` },
              { label: conversation.title || 'Untitled Conversation' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <PinButton projectId={projectId} type="conversation" refId={conversationId} />
        </div>
      </header>

      {/* Conversation workspace (chat + semantic panels) */}
      <ConversationWorkspace
        projectId={projectId}
        conversationId={conversationId}
        className="flex-1"
        {...chat}
      />
    </div>
  );
}
