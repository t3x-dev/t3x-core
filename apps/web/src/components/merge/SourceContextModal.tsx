'use client';

/**
 * SourceContextModal - Shows the original conversation context
 *
 * When a user clicks on a sentence, this modal shows the
 * surrounding conversation context with the sentence highlighted.
 */

import { Loader2 } from 'lucide-react';
import { TurnBubble, type TurnBubbleData } from '@/components/shared/TurnBubble';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

export function SourceContextModal() {
  const { contextModalOpen, contextSentence, contextData, contextLoading, closeContext } =
    useMergeWorkspaceStore();

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

          {!contextLoading && !contextData && contextSentence && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Source context unavailable</p>
              <p className="mt-1 text-sm">
                The original conversation context for this sentence could not be loaded.
              </p>
              {contextSentence.source.turn_hash && (
                <p className="mt-2 text-xs text-muted-foreground/60">
                  Ref: {contextSentence.source.turn_hash.slice(0, 16)}...
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
