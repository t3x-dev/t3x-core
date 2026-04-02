'use client';

/**
 * PendingChangesBar — Bottom bar showing color-coded change summary
 *
 * Green "N edits" · Red "N deletes" · Blue "N adds"
 * Commit button → commitStore.commitNodes()
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useCommandStore } from '@/store/commandStore';
import { useCommitStore } from '@/store/commitStore';
import { useDraftStore } from '@/store/draftStore';
import { usePhaseStore } from '@/store/phaseStore';

interface PendingChangesBarProps {
  onBack?: () => void;
}

export function PendingChangesBar({ onBack }: PendingChangesBarProps) {
  const { hasPending, pendingSummary } = useCommandStore();
  const commitNodes = useCommitStore((s) => s.commitNodes);
  const isCommitting = useCommitStore((s) => s.isCommitting);
  const treeCount = useDraftStore((s) => s.draft.trees.length);

  // Commit is enabled if there are manual edits OR extracted trees to commit
  const canCommit = hasPending || treeCount > 0;

  const handleCommit = useCallback(async () => {
    try {
      const result = await commitNodes('');
      toast.success('Committed', {
        description: result.hash ? `sha256:${result.hash.slice(0, 12)}...` : undefined,
      });
      // commitStore.commitNodes already calls commandStore.clearPending() internally
      usePhaseStore.getState().setPhase('idle');
    } catch {
      // Error handled by store
    }
  }, [commitNodes]);

  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--stroke-default)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      {/* Back button */}
      {onBack && (
        <button
          type="button"
          className="cursor-pointer"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--stroke-default)',
            fontSize: 10,
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--text-tertiary)',
          }}
          onClick={onBack}
        >
          &larr; Back
        </button>
      )}

      {/* Change summary */}
      <span className="flex-1 flex items-center gap-2" style={{ fontSize: 10 }}>
        {pendingSummary.edits > 0 && (
          <span className="text-green-400">
            {pendingSummary.edits} edit{pendingSummary.edits !== 1 ? 's' : ''}
          </span>
        )}
        {pendingSummary.deletes > 0 && (
          <span className="text-red-400">
            {pendingSummary.deletes} delete{pendingSummary.deletes !== 1 ? 's' : ''}
          </span>
        )}
        {pendingSummary.adds > 0 && (
          <span className="text-blue-400">
            {pendingSummary.adds} add{pendingSummary.adds !== 1 ? 's' : ''}
          </span>
        )}
        {!hasPending && treeCount > 0 && (
          <span className="text-[var(--text-tertiary)]">{treeCount} node{treeCount !== 1 ? 's' : ''} ready</span>
        )}
        {!hasPending && treeCount === 0 && <span className="text-[var(--text-tertiary)]">No changes</span>}
      </span>

      {/* Commit button */}
      <button
        type="button"
        className="cursor-pointer"
        style={{
          padding: '7px 16px',
          borderRadius: 6,
          border: 'none',
          fontSize: 11,
          fontWeight: 600,
          background: canCommit ? 'var(--accent-extract)' : 'var(--text-tertiary)',
          color: '#fff',
          opacity: isCommitting || !canCommit ? 0.6 : 1,
        }}
        disabled={isCommitting || !canCommit}
        onClick={handleCommit}
      >
        {isCommitting ? 'Committing...' : 'Commit'}
      </button>
    </div>
  );
}
