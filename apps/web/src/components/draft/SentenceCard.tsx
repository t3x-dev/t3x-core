'use client';

/**
 * SentenceCard - Single sentence in the draft workspace
 *
 * Shows checkbox (included), text, source badge, and remove button.
 */

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { DraftSentence } from '@/lib/api';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

interface SentenceCardProps {
  sentence: DraftSentence;
}

export function SentenceCard({ sentence }: SentenceCardProps) {
  const { toggleSentence, removeSentence } = useDraftWorkspaceStore();

  const originLabel = getOriginLabel(sentence);

  return (
    <div
      className={`group flex items-start gap-3 rounded-lg border p-3 transition-colors ${
        sentence.included
          ? 'border-border bg-[var(--surface-card)]'
          : 'border-border/50 bg-muted/30 opacity-60'
      }`}
    >
      {/* Include checkbox */}
      <Checkbox
        checked={sentence.included}
        onCheckedChange={() => toggleSentence(sentence.id)}
        className="mt-0.5"
        aria-label={sentence.included ? 'Exclude sentence' : 'Include sentence'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-relaxed">{sentence.text}</p>
        {originLabel && (
          <Badge variant="secondary" className="mt-1.5 text-xs">
            {originLabel}
          </Badge>
        )}
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        onClick={() => removeSentence(sentence.id)}
        aria-label="Remove sentence"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function getOriginLabel(sentence: DraftSentence): string | null {
  if (sentence.origin.type === 'manual') return 'Manual';
  if (sentence.source?.conversation_title) {
    return sentence.source.conversation_title;
  }
  if (sentence.origin.type === 'extracted') return 'Extracted';
  if (sentence.origin.type === 'selected') return 'Selected';
  return null;
}
