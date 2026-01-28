'use client';

/**
 * DiffSourceContextModal - Shows the original conversation context for a diff sentence
 *
 * When a user clicks "trace to source" on a sentence in the diff view,
 * this modal shows the surrounding conversation context with the sentence highlighted.
 *
 * @see https://github.com/t3x-dev/T3X/issues/220
 */

import { Loader2, MapPin } from 'lucide-react';
import { TurnBubble, type TurnBubbleData } from '@/components/shared/TurnBubble';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TurnContextData } from '@/lib/api';

/** Sentence with source info */
interface SentenceWithSource {
  id: string;
  text: string;
  source?: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

interface DiffSourceContextModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The sentence being traced */
  sentence: SentenceWithSource | null;
  /** The fetched context data */
  contextData: TurnContextData | null;
  /** Whether context is loading */
  loading: boolean;
}

export function DiffSourceContextModal({
  open,
  onOpenChange,
  sentence,
  contextData,
  loading,
}: DiffSourceContextModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600" />
            Source Context
          </DialogTitle>
          {contextData && (
            <DialogDescription>
              Conversation: {contextData.conversation_title || contextData.conversation_id}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading context...</span>
            </div>
          )}

          {/* Context loaded successfully */}
          {!loading && contextData && (
            <div className="space-y-3">
              {contextData.context.map((turn, idx) => {
                // Convert TurnWithContext to TurnBubbleData
                const turnBubbleData: TurnBubbleData = {
                  turn_hash: turn.turn_hash,
                  role: turn.role,
                  content: turn.content,
                  created_at: turn.created_at,
                  is_target: turn.is_target,
                  highlight: turn.highlight,
                };
                return (
                  <TurnBubble
                    key={turn.turn_hash || idx}
                    turn={turnBubbleData}
                    highlightColor="yellow"
                    showTargetRing={true}
                  />
                );
              })}
            </div>
          )}

          {/* Error state - couldn't load context */}
          {!loading && !contextData && sentence && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Could not load conversation context.</p>
              {sentence.source?.turn_hash && (
                <p className="mt-2 text-sm font-mono break-all opacity-60">
                  Turn: {sentence.source.turn_hash.slice(0, 16)}...
                </p>
              )}
              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-left">
                <p className="text-xs text-slate-500 mb-1">Sentence text:</p>
                <p className="text-sm text-slate-700">{sentence.text}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
