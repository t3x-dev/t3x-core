'use client';

import { GitBranch, GitCommitHorizontal, Leaf } from 'lucide-react';
import { useMemo } from 'react';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { cn } from '@/utils/cn';
import { useCanvasStore } from '@/store/canvasStore';

/**
 * CanvasStatusBar — VS Code-style status bar at the bottom of the Canvas page.
 *
 * Spec: frontend-art-template §4.1 / §4.3
 * Height: h-7 (28px), shrink-0, border-t
 * Style: bg-muted/80 backdrop-blur-sm text-xs text-muted-foreground
 * Segments separated by border-r px-3
 */

function Segment({ children, border = true }: { children: React.ReactNode; border?: boolean }) {
  return (
    <div className={cn('flex items-center gap-1.5 px-3', border && 'border-r border-border/50')}>
      {children}
    </div>
  );
}

export function CanvasStatusBar() {
  const nodes = useCanvasStore((s) => s.nodes);
  const { t } = useTerminology();

  const stats = useMemo(() => {
    let commits = 0;
    let staging = 0;
    let leaves = 0;
    const branches = new Set<string>();

    // main is always present as a branch concept
    branches.add('main');

    for (const node of nodes) {
      if (node.data.kind === 'unit') {
        if (node.data.commitStatus === 'committed') {
          commits++;
        } else {
          staging++;
        }
        if (node.data.branchType === 'branch' && node.data.branchName) {
          branches.add(node.data.branchName);
        }
        if (node.data.leaves) {
          leaves += node.data.leaves.length;
        }
      }
    }

    return { commits, staging, branches: branches.size, leaves };
  }, [nodes]);

  return (
    <footer className="flex h-7 shrink-0 items-center border-t border-border/50 bg-muted/80 text-xs text-muted-foreground backdrop-blur-sm">
      <Segment>
        <GitBranch className="h-3 w-3" />
        <span>
          {stats.branches} {t(stats.branches === 1 ? 'branch' : 'branches').toLowerCase()}
        </span>
      </Segment>
      <Segment>
        <GitCommitHorizontal className="h-3 w-3" />
        <span>
          {stats.commits} {t(stats.commits === 1 ? 'commit' : 'commits').toLowerCase()}
        </span>
      </Segment>
      {stats.staging > 0 && (
        <Segment>
          <span className="text-[var(--accent-pending)]">
            {stats.staging} {t('pending').toLowerCase()}
          </span>
        </Segment>
      )}
      <Segment border={false}>
        <Leaf className="h-3 w-3" />
        <span>
          {stats.leaves} {stats.leaves === 1 ? 'leaf' : 'leaves'}
        </span>
      </Segment>
    </footer>
  );
}
