'use client';

/**
 * DraftActionBar - Top action bar for the draft workspace
 *
 * Displays: Back button, editable title, status badge, save indicator, commit button.
 */

import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTerminology } from '@/hooks/useTerminology';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import { useProjectStore } from '@/store/projectStore';

interface DraftActionBarProps {
  onClose: () => void;
  onCommit: () => void;
  canCommit: boolean;
  projectId?: string;
}

export function DraftActionBar({ onClose, onCommit, canCommit, projectId }: DraftActionBarProps) {
  const { t } = useTerminology();
  const { draft, saveStatus, lastSavedAt, updateTitle } = useDraftWorkspaceStore();
  const projectName = useProjectStore((s) =>
    projectId ? s.getProject(projectId)?.name : undefined
  );
  const [editing, setEditing] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft) setTitleValue(draft.title);
  }, [draft]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleTitleCommit = useCallback(() => {
    setEditing(false);
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== draft?.title) {
      updateTitle(trimmed);
    } else if (draft) {
      setTitleValue(draft.title);
    }
  }, [titleValue, draft, updateTitle]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleTitleCommit();
      } else if (e.key === 'Escape') {
        setEditing(false);
        if (draft) setTitleValue(draft.title);
      }
    },
    [handleTitleCommit, draft]
  );

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2 bg-[var(--surface-card)]">
      {/* Back + Breadcrumb */}
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Breadcrumb
          segments={[
            { label: 'Home', href: '/' },
            ...(projectId
              ? [{ label: projectName || 'Project', href: `/project/${projectId}` }]
              : []),
            { label: t('draft') },
          ]}
        />
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleCommit}
            onKeyDown={handleTitleKeyDown}
            className="w-full bg-transparent text-sm font-semibold border-b border-primary outline-none px-1 py-0.5"
            maxLength={500}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold truncate max-w-md hover:underline cursor-text text-left"
            title="Click to edit title"
          >
            {draft?.title || 'Untitled Draft'}
          </button>
        )}
      </div>

      {/* Status badge */}
      <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
        {t('draft')}
      </Badge>

      {/* Save status */}
      <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />

      {/* Commit button */}
      <Button size="sm" onClick={onCommit} disabled={!canCommit}>
        {t('commitAction')}
      </Button>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function SaveStatusIndicator({
  status,
  lastSavedAt,
}: {
  status: string;
  lastSavedAt: Date | null;
}) {
  const [, setTick] = useState(0);

  // Re-render every 10s to update relative time
  useEffect(() => {
    if (!lastSavedAt || status !== 'saved') return;
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [lastSavedAt, status]);

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving...
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs text-[var(--status-success)]">
        <Check className="h-3 w-3" />
        Saved{lastSavedAt ? ` · ${formatRelativeTime(lastSavedAt)}` : ''}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-[var(--status-error)]">
        <Save className="h-3 w-3" />
        Save failed
      </span>
    );
  }

  // idle
  return null;
}
