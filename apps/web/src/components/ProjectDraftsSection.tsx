'use client';

/**
 * ProjectDraftsSection - Sidebar section showing editing drafts for current project
 *
 * Shown when user is on a /project/[id]/* route.
 * Expanded mode: list of draft links with title + node count + relative time
 * Collapsed mode: FileEdit icon with badge count
 */

import { FileEdit } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { WorkbenchDraft } from '@/lib/api';
import { listWorkbenchDrafts } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ProjectDraftsSectionProps {
  projectId: string;
  collapsed: boolean;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ProjectDraftsSection({ projectId, collapsed }: ProjectDraftsSectionProps) {
  const [drafts, setDrafts] = useState<WorkbenchDraft[]>([]);

  useEffect(() => {
    if (!projectId) return;

    let stale = false;

    const fetchDrafts = () => {
      listWorkbenchDrafts(projectId, 'editing')
        .then((list) => {
          if (!stale) setDrafts(list);
        })
        .catch(() => {
          // Silently fail — sidebar should not break
        });
    };

    fetchDrafts();

    // Refresh every 30s
    const interval = setInterval(fetchDrafts, 30000);
    return () => {
      stale = true;
      clearInterval(interval);
    };
  }, [projectId]);

  if (drafts.length === 0) return null;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex h-10 w-10 items-center justify-center">
            <FileEdit className="h-5 w-5 text-amber-500" />
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {drafts.length}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <div className="space-y-1">
            <p className="font-medium text-sm">Drafts ({drafts.length})</p>
            {drafts.slice(0, 5).map((d) => (
              <p key={d.id} className="text-xs text-muted-foreground truncate max-w-40">
                {d.title || 'Untitled'}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-1">
        <FileEdit className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Drafts ({drafts.length})
        </span>
      </div>
      {drafts.map((d) => (
        <Link
          key={d.id}
          href={`/project/${projectId}/draft/${d.id}`}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
            'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
            'transition-colors duration-[var(--motion-base)]'
          )}
        >
          <span className="truncate flex-1">{d.title || 'Untitled'}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {d.nodes.length} · {relativeTime(d.updated_at)}
          </span>
        </Link>
      ))}
    </div>
  );
}
