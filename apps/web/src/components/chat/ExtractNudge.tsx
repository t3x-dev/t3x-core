'use client';

interface ExtractNudgeProps {
  turnCount: number;
}

export function ExtractNudge({ turnCount }: ExtractNudgeProps) {
  if (turnCount <= 0) return null;

  return (
    <div className="mx-3 my-2 px-3 py-2 bg-[var(--source-dim)] border border-[var(--source)]/12 rounded-md flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
      <span>
        {turnCount} new turn{turnCount > 1 ? 's' : ''} since last extraction
      </span>
    </div>
  );
}
