'use client';

import { AlertCircle, ChevronDown, GitCommit, Loader2, RefreshCw } from 'lucide-react';
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
    const includedReferences = manifest?.references.filter((item) => item.included).length ?? 0;
    const includedLessons = manifest?.feedback.filter((item) => item.included).length ?? 0;

    return {
      baseline: shortHash(manifest?.baseline.commit_hash),
      hasBaseline: Boolean(manifest?.baseline.commit_hash),
      includedReferences,
      includedLessons,
      tokens: manifest?.token_estimate ?? 0,
    };
  }, [manifest]);

  return (
    <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--chat-panel)] px-3 py-1.5">
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
          aria-label={isOpen ? 'Close sources' : 'Open sources'}
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
              <span className="truncate text-[var(--text-tertiary)]">Loading sources</span>
            ) : message ? (
              <span className="truncate text-[var(--status-error)]">{message}</span>
            ) : (
              <>
                <span className="shrink-0 text-xs font-semibold text-[var(--text-primary)]">
                  Sources
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--accent-commit)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-commit)]">
                  {summary.hasBaseline ? `Baseline ${summary.baseline}` : 'No baseline'}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-tertiary)]">
                  {plural(summary.includedReferences, 'included', 'included')}
                </span>
                <span className="hidden shrink-0 whitespace-nowrap text-[11px] text-[var(--text-tertiary)] sm:inline">
                  {plural(summary.includedLessons, 'lesson')}
                </span>
                <span className="hidden shrink-0 whitespace-nowrap text-[11px] text-[var(--text-tertiary)] sm:inline">
                  {summary.tokens} tokens
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
          aria-label="Reload sources"
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
