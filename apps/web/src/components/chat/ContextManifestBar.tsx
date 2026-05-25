'use client';

import {
  AlertCircle,
  ChevronDown,
  GitBranch,
  GitCommit,
  Loader2,
  Network,
  RefreshCw,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ConversationContextManifest } from '@/types/api';
import { cn } from '@/utils/cn';
import { ContextManifestPanel, type ContextManifestSourcePicker } from './ContextManifestPanel';

interface ContextManifestBarProps {
  manifest: ConversationContextManifest | null;
  loading: boolean;
  error: Error | string | null;
  open?: boolean;
  updating?: boolean;
  sourcePicker?: ContextManifestSourcePicker;
  onOpenChange?: (open: boolean) => void;
  onReload: () => void | Promise<void>;
  onReferenceToggle: (pinId: string, included: boolean) => void | Promise<void>;
  onAssertionToggle: (
    pinId: string,
    assertionId: string,
    included: boolean
  ) => void | Promise<void>;
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return 'none';
  return hash.replace(/^sha256:/, '').slice(0, 8);
}

function plural(value: number, singular: string, compactPlural?: string): string {
  if (value === 1) return `1 ${singular}`;
  return `${value} ${compactPlural ?? `${singular}s`}`;
}

function errorMessage(error: ContextManifestBarProps['error']): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : error;
}

export function ContextManifestBar({
  manifest,
  loading,
  error,
  open,
  updating = false,
  sourcePicker,
  onOpenChange,
  onReload,
  onReferenceToggle,
  onAssertionToggle,
}: ContextManifestBarProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const panelId = useId();
  const message = errorMessage(error);
  const setOpen = (nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const summary = useMemo(() => {
    const includedFeedback = manifest?.feedback.filter((item) => item.included).length ?? 0;

    return {
      baseline: shortHash(manifest?.baseline.commit_hash),
      branch: manifest?.baseline.branch ?? null,
      nodes: manifest?.baseline.node_count ?? 0,
      relations: manifest?.baseline.relation_count ?? 0,
      includedFeedback,
    };
  }, [manifest]);

  return (
    <div className="relative shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--chat-panel)] px-3 py-1.5">
      <div className="mx-auto flex h-9 max-w-[760px] items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          className={cn(
            'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-left text-xs transition-colors',
            isOpen
              ? 'border-[var(--accent-conversation)]/35 bg-[var(--accent-conversation)]/10 text-[var(--text-primary)]'
              : 'border-[var(--stroke-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={isOpen ? 'Close context manifest' : 'Open context manifest'}
        >
          {loading ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-[var(--text-tertiary)]" />
          ) : message ? (
            <AlertCircle size={14} className="shrink-0 text-[var(--status-error)]" />
          ) : (
            <GitCommit size={14} className="shrink-0 text-[var(--accent-commit)]" />
          )}

          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {loading ? (
              <span className="truncate text-[var(--text-tertiary)]">Loading context</span>
            ) : message ? (
              <span className="truncate text-[var(--status-error)]">{message}</span>
            ) : (
              <>
                <span className="font-mono text-[11px] text-[var(--text-primary)]">
                  {summary.baseline}
                </span>
                {summary.branch && (
                  <span className="flex min-w-0 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--accent-branch)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-branch)]">
                    <GitBranch size={10} className="shrink-0" />
                    <span className="truncate">{summary.branch}</span>
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <Network size={11} />
                  {plural(summary.nodes, 'node')}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {plural(summary.relations, 'rel')}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {plural(summary.includedFeedback, 'feedback', 'feedback')}
                </span>
              </>
            )}
          </span>

          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-[var(--text-tertiary)] transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => {
            void onReload();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          aria-label="Reload context manifest"
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      {isOpen && (
        <ContextManifestPanel
          id={panelId}
          manifest={manifest}
          disabled={updating}
          sourcePicker={sourcePicker}
          onReferenceToggle={onReferenceToggle}
          onAssertionToggle={onAssertionToggle}
        />
      )}
    </div>
  );
}
