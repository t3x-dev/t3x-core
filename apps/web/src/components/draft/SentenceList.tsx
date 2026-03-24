'use client';

/**
 * SentenceList - Displays draft sentences with include/exclude toggles
 */

import { Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import { AddManualSentenceDialog } from './AddManualSentenceDialog';
import { SentenceCard } from './SentenceCard';

export function SentenceList() {
  const { draft, reorderSentences } = useDraftWorkspaceStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      // Make drag image semi-transparent
      if (e.currentTarget instanceof HTMLElement) {
        e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
      }
    },
    []
  );

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    []
  );

  const handleDrop = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragIndexRef.current;
      if (from != null && from !== index) {
        reorderSentences(from, index);
      }
      dragIndexRef.current = null;
      setDragOverIndex(null);
    },
    [reorderSentences]
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  if (!draft) return null;

  const sentences = [...draft.sentences].sort((a, b) => a.position - b.position);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Frames
          <span className="ml-1.5 text-muted-foreground font-normal">
            ({sentences.filter((s) => s.included).length}/{sentences.length} included)
          </span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Manually
        </Button>
      </div>

      {sentences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No sentences yet. Add sentences manually or import from conversations.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Sentence
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sentences.map((sentence, i) => (
            <SentenceCard
              key={sentence.id}
              sentence={sentence}
              isDragOver={dragOverIndex === i}
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      <AddManualSentenceDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />
    </section>
  );
}
