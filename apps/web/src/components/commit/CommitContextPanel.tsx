'use client';

/**
 * CommitContextPanel — right side context panel for a selected sentence.
 *
 * Collapsible sections:
 * - Source Turn: fetched from API via SourceContextView
 * - History: commit history for this sentence across versions
 * - Related Sentences: semantically similar sentences in the same commit
 */

import { ChevronDown, Eye, GitCommit, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { SourceContextView } from '@/components/shared/SourceContextView';
import type { CommitV4 } from '@/lib/api';
import { ConfidenceBadge, shortHash } from './CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

interface CommitContextPanelProps {
  /** Currently selected sentence ID */
  activeSentenceId: string | null;
  /** The commit data */
  commit: CommitV4;
  /** Commit history (ancestor chain) */
  commitHistory: CommitV4[];
  /** Project ID for links */
  projectId: string;
  /** Ref for connection lines */
  panelRef: RefObject<HTMLDivElement | null>;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  sectionKey: string;
  glowing?: boolean;
}

// ============================================================================
// CollapsibleSection
// ============================================================================

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
  sectionKey,
  glowing = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    if (!open || !contentRef.current) {
      setHeight(0);
      return;
    }
    setHeight(contentRef.current.scrollHeight);
    const observer = new ResizeObserver(() => {
      if (contentRef.current) setHeight(contentRef.current.scrollHeight);
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [open]);

  return (
    <div
      data-context-section={sectionKey}
      className="border-b border-[var(--stroke-divider)] last:border-b-0"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide transition-all duration-300 ${
          glowing
            ? 'text-[var(--accent-commit)] section-header-glow'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        }`}
      >
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-300 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div
        style={{ height: height === 'auto' ? 'auto' : `${height}px` }}
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
      >
        <div ref={contentRef} className="px-4 pb-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function CommitContextPanel({
  activeSentenceId,
  commit,
  commitHistory,
  projectId,
  panelRef,
}: CommitContextPanelProps) {
  const router = useRouter();
  const sentence = useMemo(
    () => commit.content.sentences.find((s) => s.id === activeSentenceId),
    [commit, activeSentenceId]
  );
  const hasContent = activeSentenceId !== null && sentence !== undefined;

  // Build: simple neighbor list (sentences in same commit, excluding self)
  const neighbors = useMemo(() => {
    if (!activeSentenceId) return [];
    return commit.content.sentences
      .filter((s) => s.id !== activeSentenceId)
      .slice(0, 5)
      .map((s) => ({ id: s.id, text: s.text, confidence: s.confidence }));
  }, [activeSentenceId, commit]);

  return (
    <aside
      ref={panelRef}
      className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[var(--stroke-divider)] glass-panel lg:block"
    >
      {!hasContent ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full bg-[var(--surface-card)] p-4">
            <Eye size={24} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="text-[13px] text-[var(--text-tertiary)]">
            Select a sentence to view context
          </div>
          <div className="text-[11px] text-[var(--text-tertiary)] opacity-60">
            Use{' '}
            <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1 py-0.5 font-mono text-[9px]">
              j
            </kbd>
            /
            <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1 py-0.5 font-mono text-[9px]">
              k
            </kbd>{' '}
            to navigate
          </div>
        </div>
      ) : (
        <div className="panel-content-enter">
          {/* Panel header */}
          <div className="sticky top-0 z-10 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]/80 backdrop-blur-sm px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--accent-commit)]">
                {activeSentenceId}
              </span>
              {sentence?.confidence != null && <ConfidenceBadge value={sentence.confidence} />}
            </div>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              {sentence?.text}
            </p>
          </div>

          {/* Source Turn */}
          <CollapsibleSection
            sectionKey="source"
            title="Source Turn"
            icon={<MessageSquare size={11} />}
            glowing={hasContent}
          >
            {sentence?.source_ref?.turn_hash ? (
              <SourceContextView
                turnHash={sentence.source_ref.turn_hash}
                highlightStart={sentence.source_ref.start_char}
                highlightEnd={sentence.source_ref.end_char}
                mode="compact"
                highlightColor="green"
                showHeader
                showJumpLink
                onJumpClick={(convId) => {
                  router.push(`/chat/${convId}`);
                }}
              />
            ) : (
              <div className="text-[12px] text-[var(--text-tertiary)] italic">
                Source context unavailable
              </div>
            )}
          </CollapsibleSection>

          {/* History */}
          <CollapsibleSection
            sectionKey="history"
            title="History"
            icon={<GitCommit size={11} />}
            defaultOpen={true}
            glowing={hasContent}
          >
            {commitHistory.length > 0 ? (
              <div className="relative pl-4">
                <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[var(--stroke-divider)]" />
                {commitHistory.map((h, i) => (
                  <div key={h.hash} className="relative mb-3 last:mb-0">
                    <div
                      className={`absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 ${
                        i === 0
                          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]'
                          : 'border-[var(--stroke-default)] bg-[var(--surface-panel)]'
                      }`}
                    />
                    <Link
                      href={`/project/${projectId}/commit/${encodeURIComponent(h.hash)}`}
                      className="block hover:text-[var(--text-primary)] transition-colors"
                    >
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">
                        {h.message || 'No message'}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {shortHash(h.hash)} &middot; {new Date(h.committed_at).toLocaleDateString()}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--text-tertiary)] italic">
                No history available
              </div>
            )}
          </CollapsibleSection>

          {/* Neighbors */}
          <CollapsibleSection
            sectionKey="neighbors"
            title="Related Sentences"
            icon={<Sparkles size={11} />}
            defaultOpen={true}
            glowing={hasContent}
          >
            {neighbors.length > 0 ? (
              <div className="space-y-2">
                {neighbors.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="w-full text-left rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2 hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                        {n.id}
                      </span>
                      {n.confidence != null && <ConfidenceBadge value={n.confidence} />}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {n.text}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--text-tertiary)] italic">
                No related sentences
              </div>
            )}
          </CollapsibleSection>
        </div>
      )}
    </aside>
  );
}
