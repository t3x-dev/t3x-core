'use client';

import { GitBranch, GitCommit, GitMerge, MessageSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { toneAccent } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

type SortField = 'date' | 'type' | 'branch' | 'sentences';
type SortDir = 'asc' | 'desc';

interface ListEntry {
  id: string;
  nodeId: string;
  type: 'conversation' | 'commit' | 'branch' | 'merge';
  title: string;
  timestamp?: string;
  branch?: string;
  hash?: string;
  sentenceCount?: number;
  projectId?: string;
}

const typeOrder = { conversation: 0, commit: 1, branch: 2, merge: 3 } as const;

const typeIcon = {
  conversation: MessageSquare,
  commit: GitCommit,
  branch: GitBranch,
  merge: GitMerge,
} as const;

const typeColor = {
  conversation: 'text-[var(--accent-conversation)]',
  commit: 'text-[var(--accent-commit)]',
  branch: 'text-[var(--accent-branch)]',
  merge: 'text-[var(--accent-commit)]',
} as const;

export function ListView({ projectId }: { projectId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const entries = useMemo(() => {
    const items: ListEntry[] = [];

    for (const node of nodes) {
      const d = node.data;
      if (d.kind !== 'unit') continue;

      const isCommitted = d.commitStatus === 'committed';
      const isMerge = d.isMergeCommit === true;
      const isBranch = d.branchType === 'branch';
      const commitData = d.commit as { sentences?: { text: string }[] } | undefined;

      items.push({
        id: node.id,
        nodeId: node.id,
        type: isCommitted ? (isMerge ? 'merge' : isBranch ? 'branch' : 'commit') : 'conversation',
        title: d.title || 'Untitled',
        timestamp: d.timestamp,
        branch: isCommitted
          ? isBranch
            ? (d.branchName as string) || 'branch'
            : 'main'
          : undefined,
        hash: d.commitHash?.slice(0, 8),
        sentenceCount: commitData?.sentences?.length,
        projectId,
      });
    }

    return items;
  }, [nodes, projectId]);

  const sorted = useMemo(() => {
    const copy = [...entries];
    const dir = sortDir === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      switch (sortField) {
        case 'date': {
          if (!a.timestamp && !b.timestamp) return 0;
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;
          return dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
        case 'type':
          return dir * (typeOrder[a.type] - typeOrder[b.type]);
        case 'branch': {
          const ab = a.branch || '';
          const bb = b.branch || '';
          return dir * ab.localeCompare(bb);
        }
        case 'sentences':
          return dir * ((a.sentenceCount || 0) - (b.sentenceCount || 0));
        default:
          return 0;
      }
    });

    return copy;
  }, [entries, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return <span className="ml-0.5">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  const handleRowClick = (entry: ListEntry) => {
    useCanvasStore.getState().openNodeModal(entry.nodeId, 'commit');
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-tertiary)]">
        No commits yet. Start a conversation to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="w-full">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--surface-panel)] border-b border-[var(--stroke-divider)]">
            <tr className="text-left text-xs text-[var(--text-tertiary)]">
              <th className="px-4 py-2.5 font-medium w-24">
                <button
                  type="button"
                  onClick={() => toggleSort('type')}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  Type{sortIndicator('type')}
                </button>
              </th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium w-32">
                <button
                  type="button"
                  onClick={() => toggleSort('branch')}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  Branch{sortIndicator('branch')}
                </button>
              </th>
              <th className="px-4 py-2.5 font-medium w-36">
                <button
                  type="button"
                  onClick={() => toggleSort('date')}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  Date{sortIndicator('date')}
                </button>
              </th>
              <th className="px-4 py-2.5 font-medium text-right w-24">
                <button
                  type="button"
                  onClick={() => toggleSort('sentences')}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  Sentences{sortIndicator('sentences')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--stroke-divider)]">
            {sorted.map((entry) => {
              const Icon = typeIcon[entry.type];
              return (
                <tr
                  key={entry.id}
                  onClick={() => handleRowClick(entry)}
                  className="cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-medium capitalize',
                        typeColor[entry.type]
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-primary)] truncate max-w-md">
                        {entry.title}
                      </span>
                      {entry.hash && (
                        <code className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0">
                          {entry.hash}
                        </code>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {entry.branch && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] gap-1',
                          entry.branch === 'main'
                            ? cn(toneAccent.commit.text, toneAccent.commit.border)
                            : cn(toneAccent.branch.text, toneAccent.branch.border)
                        )}
                      >
                        <GitBranch size={10} />
                        {entry.branch}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
                    {entry.timestamp ? formatListDate(entry.timestamp) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--text-tertiary)] tabular-nums">
                    {entry.sentenceCount !== undefined ? entry.sentenceCount : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatListDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
