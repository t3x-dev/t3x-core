'use client';

/**
 * CommitProvenanceGraph — bottom panel showing the provenance chain:
 *   Conversation(s) → Commit → Leaf(ves)
 *
 * Also includes ConnectionLines — SVG overlay drawing bezier curves
 * from the active sentence card to the right context panel.
 */

import { ChevronDown, GitCommit, Leaf as LeafIcon, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { type MutableRefObject, type RefObject, useEffect, useState } from 'react';
import type { CommitV4, Leaf } from '@/lib/api';
import { relativeTime, shortHash } from './CommitDetailHelpers';

// ============================================================================
// ConnectionLines — SVG bezier overlay
// ============================================================================

interface ConnectionLinesProps {
  activeSentenceId: string | null;
  sentenceRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  rightPanelRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
}

export function ConnectionLines({
  activeSentenceId,
  sentenceRefs,
  rightPanelRef,
  containerRef,
}: ConnectionLinesProps) {
  const [paths, setPaths] = useState<{ d: string; key: string }[]>([]);

  useEffect(() => {
    if (!activeSentenceId || !containerRef.current || !rightPanelRef.current) {
      setPaths([]);
      return;
    }

    const compute = () => {
      const container = containerRef.current;
      const sentenceEl = sentenceRefs.current[activeSentenceId];
      const rightPanel = rightPanelRef.current;
      if (!container || !sentenceEl || !rightPanel) {
        setPaths([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const sentenceRect = sentenceEl.getBoundingClientRect();
      const rightRect = rightPanel.getBoundingClientRect();

      const sx = sentenceRect.right - containerRect.left;
      const sy = sentenceRect.top + sentenceRect.height / 2 - containerRect.top;
      const ex = rightRect.left - containerRect.left + 4;

      const sections = rightPanel.querySelectorAll('[data-context-section]');
      const newPaths: { d: string; key: string }[] = [];

      sections.forEach((section, i) => {
        const sRect = section.getBoundingClientRect();
        const ey = sRect.top + 16 - containerRect.top;
        const cpx1 = sx + 40;
        const cpx2 = ex - 40;
        newPaths.push({
          d: `M ${sx} ${sy} C ${cpx1} ${sy}, ${cpx2} ${ey}, ${ex} ${ey}`,
          key: `line-${i}`,
        });
      });

      setPaths(newPaths);
    };

    compute();
    const timer = setTimeout(compute, 100);
    return () => clearTimeout(timer);
  }, [activeSentenceId, sentenceRefs, rightPanelRef, containerRef]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 overflow-visible connection-lines-enter"
      role="presentation"
    >
      <defs>
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--accent-commit)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent-commit)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          className="connection-line-animated"
        />
      ))}
    </svg>
  );
}

// ============================================================================
// ProvenanceGraph — bottom collapsible panel
// ============================================================================

interface ProvenanceGraphProps {
  activeSentenceId: string | null;
  commit: CommitV4;
  leaves: Leaf[];
  projectId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ProvenanceGraph({
  activeSentenceId,
  commit,
  leaves,
  projectId,
  collapsed,
  onToggleCollapse,
}: ProvenanceGraphProps) {
  const isConnected = activeSentenceId !== null;
  const sourceConversations =
    commit.source_refs?.filter((ref) => ref.type === 'conversation') ?? [];
  const sourceLeaves = commit.source_refs?.filter((ref) => ref.type === 'leaf') ?? [];
  const totalSources = sourceConversations.length + sourceLeaves.length;

  return (
    <div
      className={`shrink-0 border-t border-[var(--stroke-divider)] bottom-glass transition-all duration-300 ${collapsed ? 'h-10' : ''}`}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-2 px-[var(--space-page)] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <ChevronDown
          size={12}
          className={`transition-transform duration-300 ${collapsed ? '-rotate-180' : ''}`}
        />
        Provenance Graph
        <span className="font-normal normal-case text-[var(--text-tertiary)]">
          &middot; {totalSources} source{totalSources !== 1 ? 's' : ''} &rarr; 1 commit &rarr;{' '}
          {leaves.length} lea{leaves.length !== 1 ? 'ves' : 'f'}
        </span>
      </button>
      {!collapsed && (
        <div className="relative flex items-center justify-center gap-0 py-4 px-8 overflow-hidden">
          {/* Source nodes (conversations + leaf sources) */}
          <div className="flex flex-col gap-2">
            {sourceConversations.map((src) => (
              <Link
                key={src.id}
                href={`/project/${projectId}/conversation/${src.id}`}
                className={`provenance-node flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-all duration-500 hover:bg-[var(--hover-bg)] ${
                  isConnected
                    ? 'border-[var(--accent-conversation)]/40 bg-[var(--accent-conversation)]/8 node-pulse-conversation'
                    : 'border-[var(--stroke-divider)] bg-[var(--surface-card)]'
                }`}
              >
                <MessageSquare size={14} className="text-[var(--accent-conversation)]" />
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {src.title || src.id}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-tertiary)]">{src.id}</div>
                </div>
              </Link>
            ))}
            {sourceLeaves.map((src) => (
              <Link
                key={src.id}
                href={`/project/${projectId}/leaf/${src.id}`}
                className={`provenance-node flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-all duration-500 hover:bg-[var(--hover-bg)] ${
                  isConnected
                    ? 'border-[var(--accent-leaf)]/40 bg-[var(--accent-leaf)]/8 node-pulse-leaf'
                    : 'border-[var(--stroke-divider)] bg-[var(--surface-card)]'
                }`}
              >
                <LeafIcon size={14} className="text-[var(--accent-leaf)]" />
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {src.title || src.id}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-tertiary)]">{src.id}</div>
                </div>
              </Link>
            ))}
            {totalSources === 0 && (
              <div className="provenance-node flex items-center gap-2 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2 text-[12px] text-[var(--text-tertiary)] italic">
                No sources
              </div>
            )}
          </div>

          {/* Edge: sources -> commit */}
          <div className="flex flex-col items-center shrink-0 mx-2">
            <svg
              width="100"
              height="24"
              viewBox="0 0 100 24"
              className="shrink-0"
              role="presentation"
            >
              <path
                d="M 0 12 L 92 12"
                fill="none"
                stroke="var(--accent-commit)"
                strokeOpacity="0.5"
                strokeWidth="2"
                strokeDasharray="6 3"
                className={isConnected ? 'edge-flow-animated' : ''}
              />
              <polygon points="92,8 100,12 92,16" fill="var(--accent-commit)" opacity="0.7" />
            </svg>
            <span className="text-[9px] text-[var(--text-tertiary)] whitespace-nowrap -mt-1">
              {commit.content.sentences.length} sentences
            </span>
          </div>

          {/* Commit node (center, prominent) */}
          <Link
            href={`/project/${projectId}/commit/${encodeURIComponent(commit.hash)}`}
            className={`provenance-node relative flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-[12px] font-medium transition-all duration-500 hover:bg-[var(--hover-bg)] ${
              isConnected
                ? 'border-[var(--accent-commit)]/60 bg-[var(--accent-commit)]/10 node-pulse-commit'
                : 'border-[var(--accent-commit)]/30 bg-[var(--surface-card)]'
            }`}
          >
            <GitCommit size={16} className="text-[var(--accent-commit)]" />
            <div>
              <div className="text-[var(--text-primary)]">{shortHash(commit.hash)}</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-normal flex items-center gap-1.5">
                <span>{commit.author?.name || commit.author?.type || 'unknown'}</span>
                <span>&middot;</span>
                <span>{relativeTime(commit.committed_at)}</span>
              </div>
            </div>
            {isConnected && (
              <div className="absolute -inset-1 rounded-lg border border-[var(--accent-commit)]/20 animate-ping opacity-20 pointer-events-none" />
            )}
          </Link>

          {/* Edge: commit -> leaves fan-out */}
          {leaves.length > 0 && (
            <div className="flex flex-col items-center shrink-0 mx-2">
              <svg
                width="100"
                height="24"
                viewBox="0 0 100 24"
                className="shrink-0"
                role="presentation"
              >
                {leaves.map((_, i) => {
                  const targetY =
                    leaves.length === 1
                      ? 12
                      : (i / (leaves.length - 1)) * 16 + 4;
                  return (
                    <g key={`edge-${i}`}>
                      <path
                        d={
                          leaves.length === 1
                            ? `M 0 12 L 92 12`
                            : `M 0 12 C 35 12, 65 ${targetY}, 92 ${targetY}`
                        }
                        fill="none"
                        stroke="var(--accent-leaf)"
                        strokeOpacity="0.6"
                        strokeWidth="2"
                        strokeDasharray="6 3"
                        className={isConnected ? 'edge-flow-animated' : ''}
                      />
                      <polygon
                        points={`92,${targetY - 4} 100,${targetY} 92,${targetY + 4}`}
                        fill="var(--accent-leaf)"
                        opacity="0.7"
                      />
                    </g>
                  );
                })}
              </svg>
              {(() => {
                const totalPassed = leaves.reduce(
                  (sum, l) => sum + (l.assertions?.filter((a) => a.passed).length ?? 0),
                  0
                );
                const totalAssertions = leaves.reduce(
                  (sum, l) => sum + (l.assertions?.length ?? 0),
                  0
                );
                return totalAssertions > 0 ? (
                  <span className="text-[9px] text-[var(--text-tertiary)] whitespace-nowrap -mt-1">
                    {totalPassed}/{totalAssertions} passed
                  </span>
                ) : null;
              })()}
            </div>
          )}

          {/* Leaf nodes */}
          {leaves.length > 0 && (
            <div className="flex flex-col gap-2">
              {leaves.map((leaf) => {
                const passedCount = leaf.assertions?.filter((a) => a.passed).length ?? 0;
                const totalCount = leaf.assertions?.length ?? 0;
                const allPassed = totalCount > 0 && passedCount === totalCount;
                return (
                  <Link
                    key={leaf.id}
                    href={`/project/${projectId}/leaf/${leaf.id}`}
                    className={`provenance-node flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] transition-all duration-500 hover:bg-[var(--hover-bg)] ${
                      isConnected
                        ? 'border-[var(--accent-leaf)]/40 bg-[var(--accent-leaf)]/6 node-pulse-leaf'
                        : 'border-[var(--stroke-divider)] bg-[var(--surface-card)]'
                    }`}
                  >
                    <LeafIcon size={12} className="text-[var(--accent-leaf)]" />
                    <span className="text-[var(--text-primary)] font-medium truncate max-w-[160px]">
                      {leaf.title || leaf.id}
                    </span>
                    {totalCount > 0 && (
                      <span
                        className={`ml-1 font-mono text-[10px] ${allPassed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}`}
                      >
                        {passedCount}/{totalCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
