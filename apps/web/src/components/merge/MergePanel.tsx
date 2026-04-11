import { GitMerge, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { useTerminology } from '@/hooks/useTerminology';
import { selectCanExecuteMerge, selectUnresolvedCount, useCanvasStore } from '@/store/canvasStore';

/**
 * Main merge review panel integrating all merge components
 *
 * Features:
 * - Progress summary showing counts and unresolved conflicts
 * - Identical nodes section (auto-kept)
 * - Similar pairs requiring user decision
 * - Unique nodes from source/target with keep/discard options
 * - Merge message input and execute button
 * - Cancel merge option
 */
export function MergePanel() {
  const { t } = useTerminology();
  const mergeState = useCanvasStore((s) => s.mergeState);
  const executeMerge = useCanvasStore((s) => s.executeMerge);
  const cancelMerge = useCanvasStore((s) => s.cancelMerge);
  const mergeLoading = useCanvasStore((s) => s.mergeLoading);
  const canExecute = useCanvasStore(selectCanExecuteMerge);
  const unresolvedCount = useCanvasStore(selectUnresolvedCount);
  const counts = useCanvasStore(
    useShallow((state) => {
      if (!state.mergeState) return null;
      const { prepared } = state.mergeState;
      return {
        identical: prepared.autoKept.length,
        similar: prepared.conflicts.length,
        resolved: 0, // Resolution tracking is in mergeWorkspaceStore
        onlyInSource: prepared.onlyInSource.length,
        onlyInTarget: prepared.onlyInTarget.length,
        // B-19: Resolution breakdown for confirm dialog
        keptSource: 0,
        keptTarget: 0,
        keptSourceCandidates: prepared.onlyInSource.length,
        keptTargetCandidates: prepared.onlyInTarget.length,
      };
    })
  );

  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // B-12: Multi-step progress during merge preparation
  const preparing = !mergeState && mergeLoading;
  const [prepareStep, setPrepareStep] = useState(0);

  useEffect(() => {
    if (!preparing) return;
    const interval = setInterval(() => {
      setPrepareStep((prev) => (prev + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, [preparing]);

  const preparePhases = [
    { label: 'Analyzing branches...', detail: 'Comparing source and target commits' },
    {
      label: 'Computing diffs...',
      detail: 'Identifying identical, modified, and unique nodes',
    },
    { label: 'Building merge plan...', detail: 'Preparing resolution options' },
  ];

  // A-11: Loading skeleton during prepare phase
  if (preparing) {
    return (
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background elevation-3 border-l overflow-y-auto p-[var(--space-group)] sm:p-[var(--space-page)]">
        <div className="flex justify-between items-center mb-[var(--space-group)]">
          <h2 className="text-xl font-bold">{t('mergeReview')}</h2>
        </div>

        {/* B-12: Multi-step progress indicator */}
        <div className="mb-[var(--space-section)] p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">{preparePhases[prepareStep].label}</span>
          </div>
          <p className="text-xs text-muted-foreground ml-6">{preparePhases[prepareStep].detail}</p>
          <div className="flex gap-1.5 mt-3 ml-6">
            {preparePhases.map((_, i) => (
              <div
                key={`phase-${i}`}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-[var(--duration-slow)] ${
                  i <= prepareStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Skeleton mimicking stats bar and sections */}
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <SkeletonText lines={3} />
          <Skeleton className="h-20 w-full rounded-lg" />
          <SkeletonText lines={2} />
        </div>
      </div>
    );
  }

  if (!mergeState) return null;

  const { prepared } = mergeState;

  const handleExecute = async () => {
    if (!message.trim()) {
      // A-12: Replace alert() with toast
      toast.warning('Please enter a merge message');
      return;
    }

    // A-10: Show confirmation dialog
    setShowConfirm(true);
  };

  const handleConfirmExecute = async () => {
    setShowConfirm(false);
    try {
      await executeMerge(message);
      setMessage('');
    } catch (_error) {
      // Error handled by store notifyCallback
    }
  };

  return (
    <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background elevation-3 border-l overflow-y-auto p-[var(--space-group)] sm:p-[var(--space-page)]">
      {/* Header */}
      <div className="flex justify-between items-center mb-[var(--space-group)]">
        <h2 className="text-xl font-bold">{t('mergeReview')}</h2>
        <button
          onClick={cancelMerge}
          className="text-muted-foreground hover:text-foreground text-2xl leading-none"
          type="button"
          aria-label="Close merge panel"
        >
          ✕
        </button>
      </div>

      {/* Progress summary */}
      {counts && (
        <div className="mb-[var(--space-section)] p-3 bg-muted/50 rounded-lg text-sm">
          <div className="flex justify-between mb-1">
            <span>
              {t('identical_nodes')} ({t('auto_kept').toLowerCase()}):
            </span>
            <span className="font-medium text-[var(--diff-added-accent)]">{counts.identical}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>
              {t('modified_nodes')} ({t('unresolved').toLowerCase()}):
            </span>
            <span className="font-medium text-[var(--diff-modified-accent)]">
              {counts.resolved}/{counts.similar}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span>{t('only_in_source')}:</span>
            <span className="font-medium">{counts.onlyInSource}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('only_in_target')}:</span>
            <span className="font-medium">{counts.onlyInTarget}</span>
          </div>
          {unresolvedCount > 0 && (
            <div className="mt-2 pt-2 border-t border-border text-[var(--diff-modified-accent)] font-medium">
              ⚠️ {unresolvedCount} {t('unresolved').toLowerCase()} {t('conflicts').toLowerCase()}
            </div>
          )}
        </div>
      )}

      {/* Auto-kept section */}
      <div className="mb-[var(--space-group)]">
        <h3 className="font-medium mb-[var(--space-item)] text-[var(--diff-added-accent)]">
          {t('identical_nodes')} ({prepared.autoKept.length})
        </h3>
        <div className="text-sm text-muted-foreground">
          {prepared.autoKept.length} nodes auto-kept (identical in both branches)
        </div>
      </div>

      {/* Conflicts */}
      {prepared.conflicts.length > 0 && (
        <div className="mb-[var(--space-group)]">
          <h3 className="font-medium mb-[var(--space-item)] text-[var(--diff-modified-accent)]">
            {t('modified_nodes')} ({prepared.conflicts.length} conflicts)
          </h3>
          <div className="text-sm text-muted-foreground">
            Resolve conflicts in the merge workspace
          </div>
        </div>
      )}

      {/* Only in source */}
      <div className="mb-[var(--space-group)]">
        <h3 className="font-medium mb-[var(--space-item)]">
          {t('only_in_source')} ({prepared.onlyInSource.length})
        </h3>
        <div className="space-y-1 text-sm text-muted-foreground">
          {prepared.onlyInSource.map((path: string) => (
            <div key={path} className="font-mono text-xs">{path}</div>
          ))}
        </div>
      </div>

      {/* Only in target */}
      <div className="mb-[var(--space-group)]">
        <h3 className="font-medium mb-[var(--space-item)]">
          {t('only_in_target')} ({prepared.onlyInTarget.length})
        </h3>
        <div className="space-y-1 text-sm text-muted-foreground">
          {prepared.onlyInTarget.map((path: string) => (
            <div key={path} className="font-mono text-xs">{path}</div>
          ))}
        </div>
      </div>

      {/* Execute section */}
      <div className="mt-[var(--space-section)] pt-[var(--space-section)] border-t sticky bottom-0 bg-background">
        <label htmlFor="merge-message" className="block mb-[var(--space-item)] font-medium">
          Merge Message
        </label>
        <textarea
          id="merge-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe this merge..."
          className="w-full border rounded p-2 mb-3 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--status-info)] bg-background"
          disabled={mergeLoading}
        />

        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={!canExecute || mergeLoading}
            className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
              canExecute && !mergeLoading
                ? 'bg-[var(--status-info)] text-white hover:bg-[var(--status-info)]/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
            type="button"
          >
            {mergeLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </span>
            ) : (
              t('mergeConfirm')
            )}
          </button>
          <button
            onClick={cancelMerge}
            className="px-4 py-2 border rounded hover:bg-muted/50 transition-colors"
            type="button"
            disabled={mergeLoading}
          >
            Cancel
          </button>
        </div>

        {!canExecute && unresolvedCount > 0 && (
          <p className="text-sm text-[var(--diff-modified-accent)] mt-2">
            Please resolve all similar pairs before executing
          </p>
        )}
      </div>

      {/* A-10 + B-19: Merge confirmation dialog with polished UI */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          {/* B-19: Icon circle */}
          <div className="flex justify-center mb-2">
            <div className="rounded-full bg-primary/10 p-3">
              <GitMerge className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-center">{t('mergeConfirm')}</DialogTitle>
            <DialogDescription className="text-center">
              This will create a new merge commit combining the selected nodes from both
              branches. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            <p>
              <strong>Message:</strong> {message}
            </p>

            {/* B-19: Resolution counts grid */}
            {counts && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-lg font-semibold text-foreground">{counts.identical}</div>
                  <div className="text-xs text-muted-foreground">Identical (auto-kept)</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-lg font-semibold text-foreground">
                    {counts.resolved}/{counts.similar}
                  </div>
                  <div className="text-xs text-muted-foreground">Conflicts resolved</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-lg font-semibold text-foreground">
                    {counts.keptSource}/{counts.similar}
                  </div>
                  <div className="text-xs text-muted-foreground">Kept from source</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-lg font-semibold text-foreground">
                    {counts.keptTarget}/{counts.similar}
                  </div>
                  <div className="text-xs text-muted-foreground">Kept from target</div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmExecute}>
              <GitMerge className="h-4 w-4 mr-2" />
              {t('mergeConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
