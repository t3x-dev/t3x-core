'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

interface CommitBarProps {
  onCommit: (message: string) => void;
  nodeCount: number;
  slotCount: number;
  manualCount: number;
  isCommitting: boolean;
}

export function CommitBar({
  onCommit,
  nodeCount,
  slotCount,
  manualCount,
  isCommitting,
}: CommitBarProps) {
  const [showInput, setShowInput] = useState(false);
  const [message, setMessage] = useState('');

  function handleCommit() {
    onCommit(message);
    setMessage('');
    setShowInput(false);
  }

  if (showInput) {
    return (
      <div className="border-t border-[var(--stroke-default)] px-3 py-2.5 bg-[var(--surface-panel-alt)]">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommit();
            if (e.key === 'Escape') setShowInput(false);
          }}
          placeholder="Commit message (optional)"
          className="w-full px-2 py-1.5 text-[11px] bg-[var(--surface-panel)] border border-[var(--stroke-default)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] font-mono"
        />
        <div className="flex justify-end gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => setShowInput(false)}
            className="px-3 py-1 rounded-md border border-[var(--stroke-default)] text-[10px] font-semibold text-[var(--text-tertiary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={isCommitting}
            className="px-4 py-1 rounded-md bg-[var(--accent)] text-white text-[10px] font-semibold disabled:opacity-50 flex items-center gap-1"
          >
            {isCommitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Commit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-t border-[var(--stroke-default)] px-3.5 py-2.5 bg-[var(--surface-panel-alt)]">
      <div className="flex-1 text-[10px] text-[var(--text-tertiary)] leading-[1.4]">
        {nodeCount} node{nodeCount !== 1 ? 's' : ''} &middot; {slotCount} slot
        {slotCount !== 1 ? 's' : ''}
        {manualCount > 0 && (
          <>
            <br />
            <span className="text-[9px] opacity-70">{manualCount} manually added</span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowInput(true)}
        disabled={isCommitting || nodeCount === 0}
        className="px-4 py-[7px] rounded-md bg-[var(--accent)] text-white text-[11px] font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        Commit
      </button>
    </div>
  );
}
