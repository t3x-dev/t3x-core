'use client';

import { ExternalLink, GitMerge, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConflictCandidate } from '@/lib/api/commits';
import { cn } from '@/lib/utils';

interface CommitConflictPanelProps {
  conflicts: ConflictCandidate[];
  onClose: () => void;
  onGoToCommit?: (commitHash: string) => void;
  onStartMerge?: (commitHash: string) => void;
}

export function CommitConflictPanel({
  conflicts,
  onClose,
  onGoToCommit,
  onStartMerge,
}: CommitConflictPanelProps) {
  return (
    <div className="w-[400px] border-l bg-background flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-medium">Conflicts ({conflicts.length})</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        This commit has nodes that may conflict with existing knowledge.
      </p>
      <div className="flex-1 overflow-auto px-4 py-2 space-y-3">
        {conflicts.map((c, i) => {
          const cosine = c.cosine ?? 0;
          const simColor =
            cosine >= 0.8
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
          return (
            <div
              key={`conflict-${c.new_node_id}-${c.existing_node_id}`}
              className="rounded-md border p-3 space-y-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Conflict {i + 1}</span>
                <span className={cn('text-xs px-1.5 py-0.5 rounded', simColor)}>
                  similarity: {(cosine * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">This commit:</p>
                <p className="text-sm">&ldquo;{c.new_node_text}&rdquo;</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Existing (commit {c.existing_commit_hash.slice(0, 7)}):
                </p>
                <p className="text-sm">&ldquo;{c.existing_node_text}&rdquo;</p>
              </div>
              <div className="flex gap-2 pt-1">
                {onGoToCommit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onGoToCommit(c.existing_commit_hash)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Go to commit
                  </Button>
                )}
                {onStartMerge && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onStartMerge(c.existing_commit_hash)}
                  >
                    <GitMerge className="h-3 w-3 mr-1" />
                    Start merge
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t">
        <p className="text-xs text-muted-foreground">
          These conflicts don&apos;t block your commit. Consider merging if the knowledge has
          genuinely changed.
        </p>
      </div>
    </div>
  );
}
