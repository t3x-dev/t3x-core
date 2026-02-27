'use client';

/**
 * DraftQuickSheet - Sheet (drawer) for quick draft editing from canvas
 *
 * RFC §11 Q1: Two-level entry — Sheet quick mode + full-screen deep mode.
 * Shows simplified Draft view: sentence list with toggles, constraint count,
 * commit button, and "Open Full Draft" link.
 */

import { ExternalLink, FileEdit, Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useTerminology } from '@/hooks/useTerminology';
import type { DraftSentence, DraftV3 } from '@/lib/api';
import * as api from '@/lib/api';

interface DraftQuickSheetProps {
  open: boolean;
  onClose: () => void;
  draftId: string;
  projectId: string;
}

export function DraftQuickSheet({ open, onClose, draftId, projectId }: DraftQuickSheetProps) {
  const router = useRouter();
  const { t } = useTerminology();
  const [draft, setDraft] = useState<DraftV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const savingRef = useRef(false);

  // Load draft when sheet opens
  useEffect(() => {
    if (!open || !draftId) return;
    setLoading(true);
    api
      .getDraftV3(draftId)
      .then(setDraft)
      .catch(() => setDraft(null))
      .finally(() => setLoading(false));
  }, [open, draftId]);

  const toggleSentence = useCallback(
    async (sentenceId: string) => {
      if (!draft || savingRef.current) return;
      const sentences = draft.sentences.map((s) =>
        s.id === sentenceId ? { ...s, included: !s.included } : s
      );
      const updated = { ...draft, sentences };
      setDraft(updated);
      // Save in background with guard against rapid toggles
      savingRef.current = true;
      api
        .updateDraftV3(draftId, { sentences, if_revision: draft.revision })
        .catch(() => {
          // Revert on error
          setDraft(draft);
        })
        .finally(() => {
          savingRef.current = false;
        });
    },
    [draft, draftId]
  );

  const handleCommit = useCallback(async () => {
    if (!draft) return;
    setCommitting(true);
    try {
      await api.commitDraftV3(draftId);
      toast.success('Draft committed');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  }, [draft, draftId, onClose]);

  const handleOpenFull = useCallback(() => {
    onClose();
    router.push(`/project/${projectId}/draft/${draftId}`);
  }, [router, projectId, draftId, onClose]);

  const includedCount = draft?.sentences.filter((s) => s.included).length ?? 0;
  const totalCount = draft?.sentences.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="sm:max-w-md w-full">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-amber-500" />
            <SheetTitle className="text-base">{draft?.title || t('draft')}</SheetTitle>
          </div>
          <SheetDescription>
            {includedCount}/{totalCount} sentences included
            {(draft?.constraints.length ?? 0) > 0 && (
              <span> · {draft?.constraints.length ?? 0} constraints</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto -mx-4 px-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && draft && (
            <div className="space-y-1.5">
              {[...draft.sentences]
                .sort((a, b) => a.position - b.position)
                .map((sentence) => (
                  <QuickSentenceRow
                    key={sentence.id}
                    sentence={sentence}
                    onToggle={() => toggleSentence(sentence.id)}
                  />
                ))}
              {draft.sentences.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No sentences. Open the full draft to add content.
                </p>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={handleOpenFull}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open Full Draft
          </Button>
          <Button
            className="flex-1 gap-1.5"
            onClick={handleCommit}
            disabled={includedCount === 0 || committing || draft?.status !== 'editing'}
          >
            {committing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Commit
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function QuickSentenceRow({
  sentence,
  onToggle,
}: {
  sentence: DraftSentence;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
        sentence.included
          ? 'border-border bg-[var(--surface-card)]'
          : 'border-border/50 bg-muted/30 opacity-60'
      }`}
    >
      <Checkbox checked={sentence.included} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed line-clamp-2">{sentence.text}</p>
        {sentence.source?.conversation_title && (
          <Badge variant="secondary" className="mt-1 text-xs">
            {sentence.source.conversation_title}
          </Badge>
        )}
      </div>
    </div>
  );
}
