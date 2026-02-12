'use client';

import { ArrowLeft, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CommitInfo {
  hash: string;
  message?: string | null;
  branch?: string | null;
}

interface DiffHeaderProps {
  baseCommit: CommitInfo;
  targetCommit: CommitInfo;
  onClose: () => void;
}

/**
 * CommitBadge — displays label + branch + hash-pill + message
 *
 * Layout priority (when space is tight):
 *   Always visible:  label (BASE/TARGET), hash pill (8-char mono)
 *   Truncates first:  message, then branch name
 *
 * The hash is inside its own shrink-0 bg-muted pill so it never
 * overflows or merges with adjacent text.
 */
function CommitBadge({ label, commit }: { label: string; commit: CommitInfo }) {
  const shortHash = commit.hash.replace('sha256:', '').slice(0, 8);

  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
        {label}
      </span>
      {commit.branch && (
        <span className="text-xs font-medium text-foreground truncate">{commit.branch}</span>
      )}
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
        {shortHash}
      </span>
      {commit.message && (
        <span className="text-xs text-muted-foreground truncate">{commit.message}</span>
      )}
    </div>
  );
}

export function DiffHeader({ baseCommit, targetCommit, onClose }: DiffHeaderProps) {
  return (
    <div className="flex items-center gap-3 pl-6 pr-12 py-3 border-b bg-background">
      <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 shrink-0">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <div className="min-w-0 flex-1">
        <CommitBadge label="Base" commit={baseCommit} />
      </div>
      <GitCompare className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <CommitBadge label="Target" commit={targetCommit} />
      </div>
    </div>
  );
}
