'use client';

import type { Delta, DeltaSource, SemanticContent } from '@t3x-dev/core';
import { Loader2, Network } from 'lucide-react';
import { useCallback } from 'react';
import { FrameGraphView } from '@/components/frame-graph';
import { createDelta, getSemanticDraft } from '@/lib/api';

interface SemanticPanelProps {
  conversationId: string;
  snapshot: SemanticContent | null;
  deltaState?: Record<string, 'added' | 'updated' | 'removed'>;
  updatedSlots?: Record<string, string[]>;
  extracting?: boolean;
  /** Called when user edits produce a new snapshot */
  onSnapshotChange?: (snapshot: SemanticContent) => void;
}

export function SemanticPanel({
  conversationId,
  snapshot,
  deltaState,
  updatedSlots,
  extracting,
  onSnapshotChange,
}: SemanticPanelProps) {
  const handleDeltaCreated = useCallback(
    async (delta: Delta, source: DeltaSource) => {
      try {
        await createDelta(conversationId, delta, source);
        // Refetch computed draft to stay in sync
        const updatedDraft = await getSemanticDraft(conversationId);
        onSnapshotChange?.(updatedDraft);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to save delta:', err);
        }
      }
    },
    [conversationId, onSnapshotChange]
  );

  if (!snapshot && !extracting) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Network className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No semantic frames yet</p>
        <p className="text-xs mt-1">Frames will appear as the conversation progresses</p>
      </div>
    );
  }

  if (extracting && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Loader2 className="h-8 w-8 animate-spin mb-3 opacity-60" />
        <p className="text-sm">Extracting semantic frames...</p>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="h-full relative">
      {extracting && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 border text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating...
        </div>
      )}
      <FrameGraphView
        content={snapshot}
        deltaState={deltaState}
        updatedSlots={updatedSlots}
        onDeltaCreated={handleDeltaCreated}
      />
    </div>
  );
}
