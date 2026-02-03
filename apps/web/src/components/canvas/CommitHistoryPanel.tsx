'use client';

import { Bot, GitCommit, GitCompare, History, Loader2, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DiffFullScreen } from '@/components/diff/DiffFullScreen';
import { EmptyStateInline } from '@/components/ui/empty-state';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { CommitV4, DiffResultRaw } from '@/lib/api';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';

interface CommitHistoryPanelProps {
  /** Hash of the commit to show history for */
  commitHash: string | null;
  open: boolean;
  onClose: () => void;
  /** Called when user clicks a commit row (for diff view) */
  onSelectCommit?: (hash: string, parentHash: string | null) => void;
}

export function CommitHistoryPanel({
  commitHash,
  open,
  onClose,
  onSelectCommit,
}: CommitHistoryPanelProps) {
  const [history, setHistory] = useState<CommitV4[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  // Diff state
  const [diffBaseHash, setDiffBaseHash] = useState<string | null>(null);
  const [diffTargetHash, setDiffTargetHash] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffResultRaw | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [showDiffFullScreen, setShowDiffFullScreen] = useState(false);

  useEffect(() => {
    if (!open || !commitHash) {
      setHistory([]);
      setSelectedHash(null);
      setDiffData(null);
      setDiffBaseHash(null);
      setDiffTargetHash(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getCommitV4History(commitHash, 100)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, commitHash]);

  const handleRowClick = useCallback(
    async (hash: string, index: number) => {
      setSelectedHash(hash);

      // Find the parent commit (next in BFS order)
      const parentHash = index < history.length - 1 ? history[index + 1].hash : null;
      onSelectCommit?.(hash, parentHash);

      // No parent = root commit, cannot diff
      if (!parentHash) {
        setDiffData(null);
        setDiffBaseHash(null);
        setDiffTargetHash(null);
        setDiffError(null);
        return;
      }

      // Load diff: base = parent (old), target = selected (new)
      setDiffLoading(true);
      setDiffError(null);
      setDiffData(null);
      setDiffBaseHash(parentHash);
      setDiffTargetHash(hash);

      try {
        const raw = await api.diffRaw(parentHash, hash);
        setDiffData(raw);
      } catch (err) {
        setDiffError(err instanceof Error ? err.message : 'Failed to load diff');
      } finally {
        setDiffLoading(false);
      }
    },
    [history, onSelectCommit]
  );

  const shortHash = (hash: string) => {
    const clean = hash.replace(/^sha256:/, '');
    return clean.slice(0, 8);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <GitCommit className="size-4" />
              Commit History
            </SheetTitle>
            <SheetDescription>
              {commitHash ? `From ${shortHash(commitHash)}` : 'Select a commit'}
              {' · Click a commit to view diff with its parent'}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {!loading && !error && history.length === 0 && (
              <EmptyStateInline
                icon={History}
                message="No commits in this history chain. Commits will appear here once created."
              />
            )}

            {!loading && !error && history.length > 0 && (
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

                <div className="space-y-1">
                  {history.map((commit, index) => {
                    const isHead = index === 0;
                    const isSelected = selectedHash === commit.hash;
                    const isRoot = index === history.length - 1;
                    const authorName = commit.author?.name || commit.author?.type || 'unknown';
                    const isAgent = commit.author?.type === 'agent';

                    return (
                      <button
                        type="button"
                        key={commit.hash}
                        onClick={() => handleRowClick(commit.hash, index)}
                        className={cn(
                          'relative w-full text-left pl-8 pr-3 py-2 rounded-md transition-colors',
                          'hover:bg-muted/50',
                          isSelected && 'bg-muted ring-1 ring-border',
                          isHead && !isSelected && 'bg-muted/30'
                        )}
                      >
                        {/* Timeline dot */}
                        <div
                          className={cn(
                            'absolute left-1.5 top-3 size-3 rounded-full border-2',
                            isHead
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/40 bg-background'
                          )}
                        />

                        {/* Commit info */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <code className="text-xs font-mono text-muted-foreground">
                                {shortHash(commit.hash)}
                              </code>
                              {isHead && (
                                <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                                  HEAD
                                </span>
                              )}
                              {isRoot && !isHead && (
                                <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  ROOT
                                </span>
                              )}
                              {commit.branch && (
                                <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                  {commit.branch}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-sm truncate text-foreground">
                              {commit.message || 'No message'}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              {isAgent ? <Bot className="size-3" /> : <User className="size-3" />}
                              <span>{authorName}</span>
                              <span>·</span>
                              <span>{formatTime(commit.committed_at)}</span>
                              <span>·</span>
                              <span>{commit.content?.sentences?.length ?? 0} sentences</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Diff summary section */}
            {selectedHash && (
              <div className="mt-4 border-t pt-4">
                {diffLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading diff...
                  </div>
                )}

                {diffError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {diffError}
                  </div>
                )}

                {!diffLoading && !diffError && !diffData && diffBaseHash === null && (
                  <div className="text-sm text-muted-foreground">
                    Root commit — no parent to compare with.
                  </div>
                )}

                {!diffLoading && !diffError && diffData && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-foreground">
                        Changes from {shortHash(diffBaseHash!)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDiffFullScreen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <GitCompare className="size-3" />
                        View full diff
                      </button>
                    </div>

                    {/* Stats summary */}
                    <div className="flex gap-3 text-xs">
                      {diffData.stats.sameCount > 0 && (
                        <span className="text-muted-foreground">
                          {diffData.stats.sameCount} unchanged
                        </span>
                      )}
                      {diffData.stats.addedCount > 0 && (
                        <span className="text-green-600">+{diffData.stats.addedCount} added</span>
                      )}
                      {diffData.stats.removedCount > 0 && (
                        <span className="text-red-600">-{diffData.stats.removedCount} removed</span>
                      )}
                      {diffData.stats.modifiedCount > 0 && (
                        <span className="text-amber-600">
                          ~{diffData.stats.modifiedCount} modified
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Full-screen diff view */}
      {showDiffFullScreen && diffData && diffBaseHash && diffTargetHash && (
        <DiffFullScreen
          open={showDiffFullScreen}
          onClose={() => setShowDiffFullScreen(false)}
          baseCommitHash={diffBaseHash}
          targetCommitHash={diffTargetHash}
          diffData={diffData}
        />
      )}
    </>
  );
}
