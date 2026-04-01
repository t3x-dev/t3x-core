'use client';

/**
 * PendingChangesBar — Bottom bar showing color-coded change summary
 *
 * Green "N edits" · Red "N deletes" · Blue "N adds"
 * Commit button → commitStore.commitNodes()
 */

import { useCallback } from 'react';
import { useCommandStore } from '@/store/commandStore';
import { useCommitStore } from '@/store/commitStore';

interface PendingChangesBarProps {
  onBack?: () => void;
}

export function PendingChangesBar({ onBack }: PendingChangesBarProps) {
  const { hasPending, pendingSummary } = useCommandStore();
  const commitNodes = useCommitStore((s) => s.commitNodes);
  const isCommitting = useCommitStore((s) => s.isCommitting);

  const handleCommit = useCallback(async () => {
    try {
      await commitNodes('');
      useCommandStore.getState().clearPending();
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
        {!hasPending && <span className="text-[var(--text-tertiary)]">No changes</span>}
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
          background: hasPending ? 'var(--accent-extract)' : 'var(--text-tertiary)',
          color: '#fff',
          opacity: isCommitting || !hasPending ? 0.6 : 1,
        }}
        disabled={isCommitting || !hasPending}
        onClick={handleCommit}
      >
        {isCommitting ? 'Committing...' : 'Commit'}
      </button>
    </div>
  );
}
