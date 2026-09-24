import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useSourceThreadGeneration } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import type { WorkspaceAssistantContext } from '@/hooks/workspaces/useWorkspaceAuthoring';
import styles from './WorkspaceAssistantPanel.module.css';

export function WorkspaceAssistantPanel({
  projectId,
  conversationId: initialConversationId,
  context,
  onCreateConversation,
}: {
  projectId: string;
  conversationId?: string;
  context: WorkspaceAssistantContext;
  onCreateConversation: () => Promise<string>;
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [allowProposal, setAllowProposal] = useState(false);
  const selection = useChatModelSelection({});
  const chat = useSourceThreadGeneration({
    projectId,
    conversationId,
    provider: selection.selectedProvider ?? undefined,
    model: selection.selectedModel ?? undefined,
    workspaceAssistant: { ...context, allowProposal },
    onConversationCreated: setConversationId,
  });
  return (
    <section
      aria-label="Workspace Assistant"
      className={`${styles.panel} flex min-h-0 flex-1 flex-col gap-3 p-4`}
    >
      <div>
        <h3 className="text-sm font-semibold">Workspace Assistant</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Current Draft r{context.workspaceRevision} · selected sources · T3X tools
        </p>
      </div>
      <div
        className={`${styles.messages} min-h-24 flex-1 space-y-4 overflow-auto`}
        aria-live="polite"
      >
        {chat.messages.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Discuss a change or ask about an earlier action. Draft editing also works with Chat
            closed.
          </p>
        ) : null}
        {chat.messages.map((message) => (
          <div key={message.id} className={styles.message} data-role={message.role}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
          </div>
        ))}
        {chat.streamingContent ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {chat.streamingContent}
          </p>
        ) : null}
      </div>
      {!conversationId ? (
        <Button
          size="sm"
          disabled={starting}
          onClick={async () => {
            setStarting(true);
            setStartError(null);
            try {
              setConversationId(await onCreateConversation());
            } catch (error) {
              setStartError(error instanceof Error ? error.message : 'Cannot create source thread');
            } finally {
              setStarting(false);
            }
          }}
        >
          Start project conversation
        </Button>
      ) : null}
      {startError ? (
        <p role="alert" className="text-xs text-[var(--diff-removed-text)]">
          {startError}
        </p>
      ) : null}
      {chat.error ? (
        <p role="alert" className="text-xs text-[var(--diff-removed-text)]">
          {chat.error}
        </p>
      ) : null}
      {chat.warning ? (
        <output className="text-xs text-[var(--text-secondary)]">{chat.warning}</output>
      ) : null}
      <label className={`${styles.permission} flex items-center gap-2 text-xs`}>
        <input
          type="checkbox"
          checked={allowProposal}
          onChange={(event) => setAllowProposal(event.target.checked)}
        />
        Generate a proposal from this message
      </label>
      <Textarea
        className={styles.composer}
        aria-label="Message Workspace Assistant"
        value={chat.input}
        onChange={(event) => chat.setInput(event.target.value)}
        placeholder="Discuss this Draft…"
      />
      <div className={`${styles.actions} flex justify-end`}>
        <Button
          size="sm"
          disabled={!conversationId || !chat.input.trim() || chat.isStreaming}
          onClick={() => chat.sendMessage()}
        >
          Send
        </Button>
        {chat.isStreaming ? (
          <Button size="sm" variant="ghost" onClick={chat.stopGenerating}>
            Stop
          </Button>
        ) : null}
      </div>
    </section>
  );
}
