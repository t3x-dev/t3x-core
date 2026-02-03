import { Loader2 } from 'lucide-react';
import { useState } from 'react';
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
import { selectCanExecuteMerge, selectUnresolvedCount, useCanvasStore } from '@/store/canvasStore';
import { MergeCandidateList } from './MergeCandidateList';
import { MergeIdenticalSection } from './MergeIdenticalSection';
import { MergeSimilarPairCard } from './MergeSimilarPairCard';

/**
 * Main merge review panel integrating all merge components
 * 主合并审查面板，整合所有合并组件
 *
 * Features:
 * - Progress summary showing counts and unresolved conflicts
 * - Identical sentences section (auto-kept)
 * - Similar pairs requiring user decision
 * - Unique sentences from source/target with keep/discard options
 * - Merge message input and execute button
 * - Cancel merge option
 */
export function MergePanel() {
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
        identical: prepared.identical.length,
        similar: prepared.similarPairs.length,
        resolved: prepared.similarPairs.filter((p) => p.resolution).length,
        onlyInSource: prepared.onlyInSource.length,
        onlyInTarget: prepared.onlyInTarget.length,
      };
    })
  );

  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // A-11: Loading skeleton during prepare phase
  if (!mergeState && mergeLoading) {
    return (
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background shadow-lg border-l overflow-y-auto p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Merge Review</h2>
        </div>
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing semantic differences...
        </div>
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
    <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background shadow-lg border-l overflow-y-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Merge Review</h2>
        <button
          onClick={cancelMerge}
          className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          type="button"
          aria-label="Close merge panel"
        >
          ✕
        </button>
      </div>

      {/* Progress summary */}
      {counts && (
        <div className="mb-6 p-3 bg-gray-50 rounded-lg text-sm">
          <div className="flex justify-between mb-1">
            <span>Identical (auto-kept):</span>
            <span className="font-medium text-green-700">{counts.identical}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Similar (need decision):</span>
            <span className="font-medium text-yellow-700">
              {counts.resolved}/{counts.similar}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Only in source:</span>
            <span className="font-medium">{counts.onlyInSource}</span>
          </div>
          <div className="flex justify-between">
            <span>Only in target:</span>
            <span className="font-medium">{counts.onlyInTarget}</span>
          </div>
          {unresolvedCount > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200 text-yellow-700 font-medium">
              ⚠️ {unresolvedCount} unresolved conflict{unresolvedCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Identical section */}
      <div className="mb-4">
        <MergeIdenticalSection sentences={prepared.identical} />
      </div>

      {/* Similar pairs */}
      {prepared.similarPairs.length > 0 && (
        <div className="mb-4">
          <h3 className="font-medium mb-2 text-yellow-800">Similar Sentences (Pick One)</h3>
          <div className="space-y-3">
            {prepared.similarPairs.map((pair, index) => (
              <MergeSimilarPairCard
                key={`${pair.source.id}-${pair.target.id}`}
                pair={pair}
                index={index}
              />
            ))}
          </div>
        </div>
      )}

      {/* Only in source */}
      <div className="mb-4">
        <MergeCandidateList
          candidates={prepared.onlyInSource}
          side="source"
          title="Only in Source"
        />
      </div>

      {/* Only in target */}
      <div className="mb-4">
        <MergeCandidateList
          candidates={prepared.onlyInTarget}
          side="target"
          title="Only in Target"
        />
      </div>

      {/* Execute section */}
      <div className="mt-6 pt-6 border-t sticky bottom-0 bg-background">
        <label htmlFor="merge-message" className="block mb-2 font-medium">
          Merge Message
        </label>
        <textarea
          id="merge-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe this merge..."
          className="w-full border rounded p-2 mb-3 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background"
          disabled={mergeLoading}
        />

        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={!canExecute || mergeLoading}
            className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
              canExecute && !mergeLoading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            type="button"
          >
            {mergeLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </span>
            ) : (
              'Execute Merge'
            )}
          </button>
          <button
            onClick={cancelMerge}
            className="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
            type="button"
            disabled={mergeLoading}
          >
            Cancel
          </button>
        </div>

        {!canExecute && unresolvedCount > 0 && (
          <p className="text-sm text-yellow-700 mt-2">
            Please resolve all similar pairs before executing
          </p>
        )}
      </div>

      {/* A-10: Merge confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Merge</DialogTitle>
            <DialogDescription>
              This will create a new merge commit combining the selected sentences from both
              branches. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            <p>
              <strong>Message:</strong> {message}
            </p>
            {counts && (
              <div className="mt-2 space-y-1">
                <p>{counts.identical} identical (auto-kept)</p>
                <p>
                  {counts.resolved}/{counts.similar} conflicts resolved
                </p>
                <p>
                  {counts.onlyInSource} unique to source, {counts.onlyInTarget} unique to target
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmExecute}>Execute Merge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
