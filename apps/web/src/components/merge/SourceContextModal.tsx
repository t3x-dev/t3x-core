'use client';

/**
 * SourceContextModal - Shows the original conversation context
 *
 * When a user clicks on a sentence, this modal shows the
 * surrounding conversation context with the sentence highlighted.
 */

import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User, Bot, Terminal, Settings, Loader2 } from 'lucide-react';
import type { TurnWithContext } from '@/types/merge';

const roleIcons: Record<string, React.ReactNode> = {
  user: <User className="h-4 w-4" />,
  assistant: <Bot className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
  tool: <Terminal className="h-4 w-4" />,
};

const roleLabels: Record<string, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
};

function TurnBubble({ turn }: { turn: TurnWithContext }) {
  const isUser = turn.role === 'user';

  // Render content with optional highlight
  const renderContent = () => {
    if (!turn.highlight || !turn.is_target) {
      return turn.content;
    }

    const { start, end } = turn.highlight;
    const before = turn.content.slice(0, start);
    const highlighted = turn.content.slice(start, end);
    const after = turn.content.slice(end);

    return (
      <>
        {before}
        <mark className="bg-yellow-200 px-0.5 rounded">{highlighted}</mark>
        {after}
      </>
    );
  };

  return (
    <div
      className={`
        flex gap-3 p-3 rounded-lg
        ${turn.is_target ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
        ${isUser ? 'bg-blue-50' : 'bg-muted'}
      `}
    >
      {/* Role Icon */}
      <div
        className={`
          shrink-0 w-8 h-8 rounded-full flex items-center justify-center
          ${isUser ? 'bg-blue-100 text-blue-600' : 'bg-muted-foreground/20 text-muted-foreground'}
        `}
      >
        {roleIcons[turn.role] || <User className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{roleLabels[turn.role] || turn.role}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(turn.created_at).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{renderContent()}</p>
      </div>
    </div>
  );
}

export function SourceContextModal() {
  const {
    contextModalOpen,
    contextSentence,
    contextData,
    contextLoading,
    closeContext,
  } = useMergeWorkspaceStore();

  return (
    <Dialog open={contextModalOpen} onOpenChange={(open) => !open && closeContext()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Source Context</DialogTitle>
          {contextData && (
            <p className="text-sm text-muted-foreground">
              Conversation: {contextData.conversation_title || contextData.conversation_id}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {contextLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading context...</span>
            </div>
          )}

          {!contextLoading && contextData && (
            <div className="space-y-3">
              {contextData.context.map((turn, idx) => (
                <TurnBubble key={turn.turn_hash || idx} turn={turn} />
              ))}
            </div>
          )}

          {!contextLoading && !contextData && contextSentence && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Could not load conversation context.</p>
              <p className="mt-2 text-sm font-mono break-all">
                Turn: {contextSentence.source.turn_hash}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
