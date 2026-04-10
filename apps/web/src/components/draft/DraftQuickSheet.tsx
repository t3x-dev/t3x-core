'use client';

/**
 * DraftQuickSheet - Sheet (drawer) for quick draft editing from canvas
 *
 * RFC §11 Q1: Two-level entry — Sheet quick mode + full-screen deep mode.
 * Shows simplified Draft view: node list with toggles, constraint count,
 * commit button, and "Open Full Draft" link.
 */

import { AlertTriangle, ExternalLink, FileEdit, Loader2, Send } from 'lucide-react';
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
import type { DraftNode, WorkbenchDraft } from '@/lib/api';
import * as api from '@/lib/api';
import { useCanvasStore } from '@/store/canvasStore';

interface DraftQuickSheetProps {
  open: boolean;
  onClose: () => void;
  draftId: string;
  projectId: string;
}

export function DraftQuickSheet({ open, onClose, draftId, projectId }: DraftQuickSheetProps) {
  const router = useRouter();
  const { t } = useTerminology();
  const [draft, setDraft] = useState<WorkbenchDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const savingRef = useRef(false);

  // Load draft when sheet opens
  useEffect(() => {
    if (!open || !draftId) return;
    setLoading(true);
    api
      .getWorkbenchDraft(draftId)
      .then(setDraft)
      .catch(() => setDraft(null))
      .finally(() => setLoading(false));
  }, [open, draftId]);

  const toggleNode = useCallback(
    async (nodeId: string) => {
      if (!draft || savingRef.current || draft.status === 'auto') return;
      const nodes = draft.nodes.map((s) =>
        s.id === nodeId ? { ...s, included: !s.included } : s
      );
      const updated = { ...draft, nodes };
      setDraft(updated);
      // Save in background with guard against rapid toggles
      savingRef.current = true;
      api
        .updateWorkbenchDraft(draftId, { nodes, if_revision: draft.revision })
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
      const result = await api.commitWorkbenchDraft(draftId);
      const commitHash = result.commit.hash as string;

      if (commitHash) {
      }

      toast.success(t('draft_committed'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('commit_failed'));
    } finally {
      setCommitting(false);
    }
  }, [draft, draftId, onClose, t]);

  const handlePromote = useCallback(async () => {
    setPromoting(true);
    try {
      const updated = await api.promoteDraft(draftId);
      setDraft(updated);
      toast.success('Draft promoted to editing');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setPromoting(false);
    }
  }, [draftId]);

  const handleOpenFull = useCallback(() => {
    onClose();
    router.push(`/project/${projectId}/draft/${draftId}`);
  }, [router, projectId, draftId, onClose]);

  const includedCount = draft?.nodes.filter((s) => s.included).length ?? 0;
  const totalCount = draft?.nodes.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="sm:max-w-md w-full">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-amber-500" />
            <SheetTitle className="text-base">{draft?.title || t('draft')}</SheetTitle>
          </div>
          <SheetDescription>
            {includedCount}/{totalCount} nodes included
            {(draft?.constraints.length ?? 0) > 0 && (
              <span> · {draft?.constraints.length ?? 0} constraints</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Auto-draft banner */}
        {draft?.status === 'auto' && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="flex-1 text-amber-800 dark:text-amber-200">
              Auto-extracted draft — read-only until promoted.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePromote}
              disabled={promoting}
              className="shrink-0"
            >
              {promoting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              Start Editing
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto -mx-4 px-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && draft && (
            <div className="space-y-1.5">
              {[...draft.nodes]
                .sort((a, b) => a.position - b.position)
                .map((node) => (
                  <QuickNodeRow
                    key={node.id}
                    node={node}
                    onToggle={() => toggleNode(node.id)}
                  />
                ))}
              {draft.nodes.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No nodes. Open the full draft to add content.
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
            {t('commitAction')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function QuickNodeRow({
  node,
  onToggle,
}: {
  node: DraftNode;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
        node.included
          ? 'border-border bg-[var(--surface-card)]'
          : 'border-border/50 bg-muted/30 opacity-60'
      }`}
    >
      <Checkbox checked={node.included} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed line-clamp-2">{node.text}</p>
        {node.source?.conversation_title && (
          <Badge variant="secondary" className="mt-1 text-xs">
            {node.source.conversation_title}
          </Badge>
        )}
      </div>
    </div>
  );
}
