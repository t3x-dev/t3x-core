'use client';

/**
 * DiffSourceContextModal - Standalone source context modal for Diff page
 *
 * Same UI as merge/SourceContextModal but driven by useSourceContext hook
 * instead of mergeWorkspaceStore.
 */

import { Bot, Loader2, Settings, Terminal, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Sentence, TurnContextData, TurnWithContext } from '@/types/merge';

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

export function TurnBubble({ turn }: { turn: TurnWithContext }) {
  const isUser = turn.role === 'user';

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
      className={`flex gap-3 p-3 rounded-lg ${turn.is_target ? 'ring-2 ring-yellow-400 ring-offset-2' : ''} ${isUser ? 'bg-blue-50' : 'bg-muted'}`}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-100 text-blue-600' : 'bg-muted-foreground/20 text-muted-foreground'}`}
      >
        {roleIcons[turn.role] || <User className="h-4 w-4" />}
      </div>
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

/** Flexible sentence type that accepts both required and optional source */
interface SentenceWithOptionalSource {
  id: string;
  text: string;
  source?: {
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
  };
}

interface DiffSourceContextModalProps {
  open: boolean;
  sentence: SentenceWithOptionalSource | Sentence | null;
  data: TurnContextData | null;
  loading: boolean;
  onClose: () => void;
}

export function DiffSourceContextModal({
  open,
  sentence,
  data,
  loading,
  onClose,
}: DiffSourceContextModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Source Context</DialogTitle>
          {data && (
            <p className="text-sm text-muted-foreground">
              Conversation: {data.conversation_title || data.conversation_id}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading context...</span>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-3">
              {data.context.map((turn, idx) => (
                <TurnBubble key={turn.turn_hash || idx} turn={turn} />
              ))}
            </div>
          )}

          {!loading && !data && sentence && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Could not load conversation context.</p>
              {sentence.source?.turn_hash && (
                <p className="mt-2 text-sm font-mono break-all">
                  Turn: {sentence.source.turn_hash}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
