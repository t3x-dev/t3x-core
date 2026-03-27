'use client';

import { GitBranch, GitCommit, GitMerge, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useTerminology } from '@/hooks/useTerminology';
import { toneAccent } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

interface TimelineEntry {
  id: string;
  type: 'conversation' | 'commit' | 'branch' | 'merge';
  title: string;
  subtitle?: string;
  timestamp?: string;
  branch?: string;
  hash?: string;
  fullHash?: string;
  nodeCount?: number;
  conversationId?: string;
  commitStatus?: string;
}

export function TimelineView({ projectId }: { projectId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const { t } = useTerminology();
  const router = useRouter();

  const entries = useMemo(() => {
    const items: TimelineEntry[] = [];

    for (const node of nodes) {
      const d = node.data;
      if (d.kind !== 'unit') continue;

      const isCommitted = d.commitStatus === 'committed';
      const isMerge = d.isMergeCommit === true;
      const isBranch = d.branchType === 'branch';

      if (!isCommitted) {
        // Staging/pending = active conversation
        items.push({
          id: node.id,
          type: 'conversation',
          title: d.title || 'Untitled Conversation',
          timestamp: d.timestamp,
          conversationId: d.conversationId,
          commitStatus: d.commitStatus,
        });
      } else {
        // Committed node
        const commitData = d.commit as { nodes?: { text: string }[] } | undefined;
        items.push({
          id: node.id,
          type: isMerge ? 'merge' : isBranch ? 'branch' : 'commit',
          title: d.title || 'Untitled',
          subtitle: t('committed'),
          timestamp: d.timestamp,
          branch: isBranch ? (d.branchName as string) || 'branch' : 'main',
          hash: d.commitHash?.slice(0, 8),
          fullHash: d.commitHash,
          nodeCount: commitData?.nodes?.length,
        });
      }
    }

    // Sort: conversations first (in progress), then by timestamp descending
    items.sort((a, b) => {
      // Active conversations always on top
      if (a.type === 'conversation' && b.type !== 'conversation') return -1;
      if (a.type !== 'conversation' && b.type === 'conversation') return 1;

      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return items;
  }, [nodes, t]);

  const handleClick = (entry: TimelineEntry) => {
    if (entry.type === 'conversation' && entry.conversationId) {
      // STAGING → chat page
      router.push(`/chat/${entry.conversationId}`);
    } else if (entry.fullHash) {
      // Committed → commit detail page
      router.push(`/project/${projectId}/commit/${encodeURIComponent(entry.fullHash)}`);
    }
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
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--stroke-divider)]" />

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="relative flex gap-4 pb-6 cursor-pointer group"
              onClick={() => handleClick(entry)}
            >
              {/* Timeline dot */}
              <div
                className={cn(
                  'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-110',
                  entry.type === 'conversation' &&
                    'border-[var(--accent-conversation)] bg-[var(--accent-conversation)]/10',
                  entry.type === 'commit' &&
                    'border-[var(--accent-commit)] bg-[var(--accent-commit)]/10',
                  entry.type === 'branch' &&
                    'border-[var(--accent-branch)] bg-[var(--accent-branch)]/10',
                  entry.type === 'merge' &&
                    'border-[var(--accent-commit)] bg-[var(--accent-commit)]/10'
                )}
              >
                {entry.type === 'conversation' && (
                  <MessageSquare className="h-4 w-4 text-[var(--accent-conversation)]" />
                )}
                {entry.type === 'commit' && (
                  <GitCommit className="h-4 w-4 text-[var(--accent-commit)]" />
                )}
                {entry.type === 'branch' && (
                  <GitBranch className="h-4 w-4 text-[var(--accent-branch)]" />
                )}
                {entry.type === 'merge' && (
                  <GitMerge className="h-4 w-4 text-[var(--accent-commit)]" />
                )}
              </div>

              {/* Content card */}
              <div
                className={cn(
                  'flex-1 rounded-lg border p-4 transition-all',
                  'group-hover:shadow-[var(--fx-shadow-sm)]',
                  entry.type === 'conversation'
                    ? 'border-[var(--accent-conversation)]/30 bg-[var(--accent-conversation)]/5 group-hover:border-[var(--accent-conversation)]/50'
                    : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] group-hover:border-[var(--stroke-strong)]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{entry.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.hash && (
                        <code className="text-xs text-[var(--text-tertiary)] font-mono">
                          {entry.hash}
                        </code>
                      )}
                      {entry.nodeCount !== undefined && entry.nodeCount > 0 && (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {entry.nodeCount} node{entry.nodeCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {entry.timestamp && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {formatTimelineDate(entry.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.type === 'conversation' && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          toneAccent.conversation.text,
                          toneAccent.conversation.border
                        )}
                      >
                        In Progress
                      </Badge>
                    )}
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
                  </div>
                </div>

                {/* Action hint */}
                <div className="mt-2 text-[10px] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
                  {entry.type === 'conversation'
                    ? 'Click to continue chat →'
                    : 'Click to view details →'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTimelineDate(iso: string): string {
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
