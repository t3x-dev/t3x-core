'use client';

import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type DraftV3, listDraftsV3 } from '@/lib/api';

interface LeafExtractToDraftProps {
  leafId: string;
  projectId: string;
  outputText: string;
}

export function LeafExtractToDraft({ leafId, projectId, outputText }: LeafExtractToDraftProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [drafts, setDrafts] = useState<DraftV3[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = useCallback(async () => {
    setExtractedText(outputText);
    setDialogOpen(true);
    setLoading(true);
    try {
      const d = await listDraftsV3(projectId, 'editing');
      setDrafts(d);
      if (d.length > 0) setSelectedDraftId(d[0].id);
    } catch {
      toast.error('Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }, [projectId, outputText]);

  const handleSubmit = useCallback(async () => {
    if (!selectedDraftId || !extractedText.trim()) return;
    setSubmitting(true);
    try {
      const { updateDraftV3, getDraftV3 } = await import('@/lib/api');
      const draft = await getDraftV3(selectedDraftId);
      const newSentence = {
        id: `s_leaf_${leafId}_${Date.now()}`,
        text: extractedText.trim(),
        included: true,
        origin: { type: 'selected' as const },
        position: draft.sentences.length,
      };
      await updateDraftV3(selectedDraftId, {
        sentences: [...draft.sentences, newSentence],
        if_revision: draft.revision,
      });
      toast.success('Added to draft');
      setDialogOpen(false);
    } catch {
      toast.error('Failed to add to draft');
    } finally {
      setSubmitting(false);
    }
  }, [selectedDraftId, extractedText, leafId]);

  if (!outputText) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" onClick={handleOpen}>
        <ArrowUpRight className="h-3.5 w-3.5" />
        Add to Draft
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extract to Draft</DialogTitle>
            <DialogDescription>
              Add knowledge from this leaf output back to a draft for further refinement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Text to extract</Label>
              <Textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Target draft</Label>
              {loading ? (
                <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading drafts...
                </div>
              ) : drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No editing drafts found. Create a draft first.
                </p>
              ) : (
                <select
                  value={selectedDraftId}
                  onChange={(e) => setSelectedDraftId(e.target.value)}
                  disabled={submitting}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title || d.id} ({d.sentences.length} sentences)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedDraftId || !extractedText.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ArrowUpRight className="h-4 w-4 mr-1" />
              )}
              Add to Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
