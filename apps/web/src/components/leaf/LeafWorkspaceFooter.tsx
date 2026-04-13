'use client';

import { GitBranch, GitCommit, Server } from 'lucide-react';
import Link from 'next/link';
import type { Leaf } from '@/types/api';
import { cn } from '@/lib/utils';

interface LeafWorkspaceFooterProps {
  leaf: Leaf;
  projectId: string;
  className?: string;
}

export function LeafWorkspaceFooter({ leaf, projectId, className }: LeafWorkspaceFooterProps) {
  const shortHash = leaf.commit_hash.replace('sha256:', '').slice(0, 8);

  return (
    <footer
      className={cn(
        'flex items-center gap-3 border-t px-6 py-2 text-[11px] text-[var(--text-tertiary)] shrink-0',
        'bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)]',
        'backdrop-blur-[4px]',
        className
      )}
    >
      {/* Provenance mini graph */}
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-conversation)]" />
        <span className="h-px w-4 bg-[var(--stroke-default)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-commit)]" />
        <span className="h-px w-4 bg-[var(--stroke-default)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-leaf)]" />
      </div>

      {/* Commit link */}
      <span className="flex items-center gap-1">
        <GitCommit className="h-2.5 w-2.5 text-[var(--accent-commit)]" />
        Commit{' '}
        <Link
          href={`/project/${projectId}?focus=${leaf.commit_hash}`}
          className="text-[var(--accent-commit)] hover:underline"
        >
          {shortHash}
        </Link>
      </span>

      <span className="text-[var(--stroke-default)]">&middot;</span>

      {/* Branch */}
      <span className="flex items-center gap-1">
        <GitBranch className="h-2.5 w-2.5" />
        main
      </span>

      <span className="text-[var(--stroke-default)]">&middot;</span>

      {/* Leaf ID & type */}
      <span>
        {leaf.id.slice(0, 11)} &middot; {leaf.type}
      </span>

      <span className="text-[var(--stroke-default)]">&middot;</span>

      {/* Created date */}
      <span>Created {new Date(leaf.created_at).toLocaleDateString()}</span>

      <span className="flex-1" />

      {/* Schema badge */}
      <span className="flex items-center gap-1">
        <Server className="h-2.5 w-2.5" />
        t3x/commit
      </span>
    </footer>
  );
}
