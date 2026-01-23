'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { ContextPanelWrapper } from '@/components/conversation/ContextPanelWrapper';
import { getConversation, listTurns } from '@/lib/api';
import type { Conversation, Turn } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const conversationId = params.conversationId as string;

  const [conversation, setConversation] = useState<(Conversation & { turns_count?: number }) | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load conversation and turns data
  useEffect(() => {
    if (!conversationId || !projectId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load conversation and turns in parallel
        const [convData, turnsData] = await Promise.all([
          getConversation(conversationId),
          listTurns(projectId, conversationId, 100, 0),
        ]);

        setConversation(convData);
        setTurns(turnsData.turns);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load conversation'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [conversationId, projectId]);

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
            Promise.all([
              getConversation(conversationId),
              listTurns(projectId, conversationId, 100, 0),
            ])
              .then(([convData, turnsData]) => {
                setConversation(convData);
                setTurns(turnsData.turns);
              })
              .catch(err => setError(err instanceof Error ? err : new Error(String(err))))
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/project/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              {conversation.title || 'Untitled Conversation'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {turns.length} turns | Created: {new Date(conversation.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PinButton projectId={projectId} type="conversation" refId={conversationId} />
        </div>
      </header>

      {/* Main content area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {turns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                <p>No messages yet</p>
                <p className="text-sm">Start a conversation to see messages here</p>
              </div>
            ) : (
              turns.map((turn) => (
                <TurnMessage key={turn.turn_hash} turn={turn} />
              ))
            )}
          </div>
        </main>

        {/* Context Panel Sidebar */}
        <aside className="w-64 border-l bg-muted/30 overflow-auto">
          <ContextPanelWrapper
            projectId={projectId}
            conversationId={conversationId}
          />
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// Turn Message Component
// ============================================================================

interface TurnMessageProps {
  turn: Turn;
}

function TurnMessage({ turn }: TurnMessageProps) {
  const isUser = turn.role === 'user';
  const isAssistant = turn.role === 'assistant';
  const isSystem = turn.role === 'system';
  const isTool = turn.role === 'tool';

  return (
    <div
      className={cn(
        'rounded-lg p-4',
        isUser && 'bg-primary/10 ml-8',
        isAssistant && 'bg-muted mr-8',
        isSystem && 'bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800',
        isTool && 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 font-mono text-sm'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            'text-xs font-medium px-2 py-0.5 rounded',
            isUser && 'bg-primary/20 text-primary',
            isAssistant && 'bg-muted-foreground/20 text-muted-foreground',
            isSystem && 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200',
            isTool && 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
          )}
        >
          {turn.role.toUpperCase()}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(turn.created_at).toLocaleTimeString()}
        </span>
      </div>
      <div className="whitespace-pre-wrap text-sm">{turn.content}</div>
    </div>
  );
}
