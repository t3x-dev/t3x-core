'use client';

/**
 * DiffGutter — line number gutter for diff rows.
 *
 * Spec: frontend-art-template §6.3
 */

export function DiffGutter({ lineNumber }: { lineNumber?: number }) {
  return (
    <div className="w-10 shrink-0 select-none border-r bg-muted/50 px-2 py-1 text-right text-[10px] font-mono text-muted-foreground/50">
      {lineNumber}
    </div>
  );
}
