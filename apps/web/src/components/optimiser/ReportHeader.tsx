'use client';

import { CheckCircle, ChevronRight, Loader2, Tag, X, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ReportHeaderProps {
  runId: string;
  title: string | null;
  description: string | null;
  tags: string[];
  status: string;
  createdAt: string;
  onUpdate: (patch: { title?: string; description?: string; tags?: string[] }) => Promise<void>;
  /** Project ID for lineage breadcrumb */
  projectId?: string;
  /** Leaf title for lineage breadcrumb */
  leafTitle?: string;
  /** Leaf ID for lineage breadcrumb link */
  leafId?: string;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ReportHeader({
  runId,
  title,
  description,
  tags,
  status,
  createdAt,
  onUpdate,
  projectId,
  leafTitle,
  leafId,
}: ReportHeaderProps) {
  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title || '');
  const titleRef = useRef<HTMLInputElement>(null);

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(description || '');
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Tags editing
  const [tagInput, setTagInput] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Saving state
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync external props
  useEffect(() => {
    if (!editingTitle) setTitleValue(title || '');
  }, [title, editingTitle]);
  useEffect(() => {
    if (!editingDesc) setDescValue(description || '');
  }, [description, editingDesc]);
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  const debouncedSave = useCallback(
    (patch: { title?: string; description?: string; tags?: string[] }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await onUpdate(patch);
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [onUpdate]
  );

  // Auto-focus on edit
  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const handleTitleBlur = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed !== (title || '')) {
      debouncedSave({ title: trimmed || undefined });
    }
  }, [titleValue, title, debouncedSave]);

  const handleDescBlur = useCallback(() => {
    setEditingDesc(false);
    const trimmed = descValue.trim();
    if (trimmed !== (description || '')) {
      debouncedSave({ description: trimmed || undefined });
    }
  }, [descValue, description, debouncedSave]);

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      const tag = tagInput.trim().slice(0, 50);
      if (!tag || localTags.includes(tag) || localTags.length >= 20) return;
      const next = [...localTags, tag];
      setLocalTags(next);
      setTagInput('');
      debouncedSave({ tags: next });
    },
    [tagInput, localTags, debouncedSave]
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const next = localTags.filter((t) => t !== tag);
      setLocalTags(next);
      debouncedSave({ tags: next });
    },
    [localTags, debouncedSave]
  );

  const statusColor =
    status === 'completed'
      ? 'border-green-500/30 bg-green-500/10 text-[var(--status-success)]'
      : status === 'failed'
        ? 'border-red-500/30 bg-red-500/10 text-[var(--status-error)]'
        : status === 'running'
          ? 'border-blue-500/30 bg-blue-500/10 text-[var(--status-info)]'
          : 'border-gray-500/30 bg-gray-500/10 text-muted-foreground';

  return (
    <div className="space-y-2">
      {/* Lineage breadcrumb */}
      {projectId && (
        <nav aria-label="Lineage" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={`/project/${projectId}`} className="hover:text-foreground transition-colors">
            Project
          </Link>
          {leafId && (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <Link
                href={`/project/${projectId}/leaf/${leafId}`}
                className="hover:text-foreground transition-colors"
              >
                {leafTitle || 'Leaf'}
              </Link>
            </>
          )}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Run</span>
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-center gap-3">
        {editingTitle ? (
          <input
            ref={titleRef}
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => e.key === 'Enter' && titleRef.current?.blur()}
            maxLength={200}
            className="flex-1 border-b border-border bg-transparent text-lg font-semibold outline-none focus:border-[var(--accent-primary)]"
            placeholder="Untitled Report"
          />
        ) : (
          <h1
            onClick={() => setEditingTitle(true)}
            className={cn(
              'flex-1 cursor-pointer text-lg font-semibold hover:text-[var(--accent-primary)] transition-colors',
              !title && 'text-muted-foreground'
            )}
          >
            {title || 'Untitled Report'}
          </h1>
        )}

        {/* Status badge */}
        <Badge variant="outline" className={cn('shrink-0', statusColor)}>
          {status === 'completed' && <CheckCircle className="mr-1 h-3 w-3" />}
          {status === 'failed' && <XCircle className="mr-1 h-3 w-3" />}
          {status === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {status}
        </Badge>

        {/* Saving indicator */}
        {saving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        )}
      </div>

      {/* Run ID + time */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <code className="rounded bg-muted px-1.5 py-0.5">{runId}</code>
        <span>Created {formatRelativeTime(createdAt)}</span>
      </div>

      {/* Description */}
      {editingDesc ? (
        <textarea
          ref={descRef}
          value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          onBlur={handleDescBlur}
          maxLength={2000}
          rows={2}
          className="w-full resize-none border-b border-border bg-transparent text-sm outline-none focus:border-[var(--accent-primary)]"
          placeholder="Add a description..."
        />
      ) : (
        <p
          onClick={() => setEditingDesc(true)}
          className={cn(
            'cursor-pointer text-sm hover:text-[var(--accent-primary)] transition-colors',
            !description && 'text-muted-foreground italic'
          )}
        >
          {description || 'Add a description...'}
        </p>
      )}

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        {localTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 text-xs">
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              className="ml-0.5 hover:text-[var(--status-error)]"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {localTags.length < 20 && (
          <input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            maxLength={50}
            placeholder="Add tag..."
            className="w-20 border-none bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>
    </div>
  );
}
