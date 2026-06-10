'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { useReviewAction } from '@/hooks/shared/useReviewAction';
import type { SemanticPointAPI } from '@/types/api';
import { ExtractButton } from './ExtractButton';
import { ReadyZone } from './ReadyZone';
import { ReviewZone } from './ReviewZone';

interface DraftWorkbenchLLMProps {
  draftId: string;
  projectId: string;
  conversationId: string;
  semanticPoints: SemanticPointAPI[];
  onUpdate: (points: SemanticPointAPI[]) => void;
  onCommit: () => void;
  onRefresh: () => void;
}

export function DraftWorkbenchLLM({
  draftId,
  projectId,
  conversationId,
  semanticPoints,
  onUpdate,
  onCommit,
  onRefresh,
}: DraftWorkbenchLLMProps) {
  const readyPoints = semanticPoints.filter((p) => p.zone === 'ready');
  const reviewPoints = semanticPoints.filter((p) => p.zone === 'review');
  const { submit: submitReviewAction } = useReviewAction();

  const callReviewAction = useCallback(
    async (spId: string, action: 'accept' | 'dismiss' | 'undo' | 'edit', editedText?: string) => {
      try {
        const result = await submitReviewAction(draftId, spId, action, editedText);
        onUpdate(result.semantic_points);
      } catch (err) {
        toast.error(formatUserFacingError(err, 'Review action failed.'));
      }
    },
    [draftId, onUpdate, submitReviewAction]
  );

  const handleUndo = useCallback((id: string) => callReviewAction(id, 'undo'), [callReviewAction]);
  const handleAccept = useCallback(
    (id: string) => callReviewAction(id, 'accept'),
    [callReviewAction]
  );
  const handleDismiss = useCallback(
    (id: string) => callReviewAction(id, 'dismiss'),
    [callReviewAction]
  );
  const handleEdit = useCallback(
    (id: string, text: string) => callReviewAction(id, 'edit', text),
    [callReviewAction]
  );

  const activeReadyCount = readyPoints.filter((p) => p.status !== 'undone' && p.staged).length;

  return (
    <div className="flex flex-col gap-4">
      <ReadyZone points={readyPoints} onUndo={handleUndo} />

      <ReviewZone
        points={reviewPoints}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
        onEdit={handleEdit}
      />

      <div className="flex items-center justify-between border-t pt-3">
        <ExtractButton
          draftId={draftId}
          projectId={projectId}
          conversationId={conversationId}
          onExtracted={onRefresh}
        />
        <Button onClick={onCommit} disabled={activeReadyCount === 0}>
          Commit Ready Zone ({activeReadyCount})
        </Button>
      </div>
    </div>
  );
}
