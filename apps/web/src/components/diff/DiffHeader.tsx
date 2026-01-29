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

function CommitBadge({ label, commit }: { label: string; commit: CommitInfo }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-md">
        {commit.branch && (
          <span className="text-xs font-medium text-foreground">{commit.branch}</span>
        )}
        <span className="text-xs font-mono text-muted-foreground">
          {commit.hash.replace('sha256:', '').slice(0, 8)}
        </span>
      </div>
      {commit.message && (
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {commit.message}
        </span>
      )}
    </div>
  );
}

export function DiffHeader({ baseCommit, targetCommit, onClose }: DiffHeaderProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b bg-background">
      <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <CommitBadge label="Base" commit={baseCommit} />
        <GitCompare className="h-4 w-4 text-muted-foreground shrink-0" />
        <CommitBadge label="Target" commit={targetCommit} />
      </div>
    </div>
  );
}
