'use client';

import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { fetchWorkbenchDrafts } from '@/queries/workbenchDrafts';
import type { WorkbenchDraft } from '@/types/api';

interface LeafExtractToDraftProps {
  leafId: string;
  projectId: string;
  outputText: string;
}

export function LeafExtractToDraft({ leafId, projectId, outputText }: LeafExtractToDraftProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [drafts, setDrafts] = useState<WorkbenchDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [floatingBtn, setFloatingBtn] = useState<{
    top: number;
    left: number;
    text: string;
  } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(async () => {
    setExtractedText(outputText);
    setDialogOpen(true);
    setLoading(true);
    try {
      const d = await fetchWorkbenchDrafts(projectId, 'editing');
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
      const { updateWorkbenchDraft, getWorkbenchDraft } = await import('@/lib/api');
      const draft = await getWorkbenchDraft(selectedDraftId);
      const newNode = {
        id: `s_leaf_${leafId}_${Date.now()}`,
        text: extractedText.trim(),
        included: true,
        origin: { type: 'selected' as const },
        position: draft.nodes.length,
      };
      await updateWorkbenchDraft(selectedDraftId, {
        nodes: [...draft.nodes, newNode],
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

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !outputRef.current) {
      setFloatingBtn(null);
      return;
    }
    if (!outputRef.current.contains(sel.anchorNode)) {
      setFloatingBtn(null);
      return;
    }
    const selectedText = sel.toString().trim();
    if (!selectedText) {
      setFloatingBtn(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = outputRef.current.getBoundingClientRect();
    setFloatingBtn({
      top: rect.top - containerRect.top - 32,
      left: rect.left - containerRect.left + rect.width / 2,
      text: selectedText,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const handleFloatingClick = useCallback(() => {
    if (!floatingBtn) return;
    setExtractedText(floatingBtn.text);
    setFloatingBtn(null);
    setDialogOpen(true);
    setLoading(true);
    fetchWorkbenchDrafts(projectId, 'editing')
      .then((d) => {
        setDrafts(d);
        if (d.length > 0) setSelectedDraftId(d[0].id);
      })
      .catch(() => toast.error('Failed to load drafts'))
      .finally(() => setLoading(false));
  }, [floatingBtn, projectId]);

  if (!outputText) return null;

  return (
    <>
      <div ref={outputRef} className="relative">
        {floatingBtn && (
          <button
            type="button"
            className="absolute z-10 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs shadow-md hover:bg-accent transition-colors"
            style={{ top: floatingBtn.top, left: floatingBtn.left, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleFloatingClick}
          >
            <ArrowUpRight className="h-3 w-3" />
            Add to Draft
          </button>
        )}
      </div>
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
                      {d.title || d.id} ({d.nodes.length} nodes)
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
