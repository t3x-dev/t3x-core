'use client';

/**
 * DiffContextSnippet — Layer 3 provenance: one-line context snippet.
 *
 * Shows a brief snippet of the original conversation context below
 * changed diff lines. Click to expand into full SourceContextView.
 */

import { Loader2, Paperclip } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SourceContextView } from '@/components/shared/SourceContextView';
import type { CommitSentence, TurnContextData } from '@/lib/api';
import { fetchTurnContextCached } from '@/lib/api';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface DiffContextSnippetProps {
  sentence: CommitSentence;
  onJumpToConversation?: (conversationId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function DiffContextSnippet({ sentence, onJumpToConversation }: DiffContextSnippetProps) {
  const [expanded, setExpanded] = useState(false);
  const [contextData, setContextData] = useState<TurnContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const turnHash = sentence.source_ref?.turn_hash;
  const startChar = sentence.source_ref?.start_char;
  const endChar = sentence.source_ref?.end_char;

  // Lazy-load: only fetch when visible (IntersectionObserver)
  useEffect(() => {
    if (!turnHash || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [turnHash]);

  // Fetch context when visible
  useEffect(() => {
    if (!visible || !turnHash || contextData) return;

    let cancelled = false;
    setLoading(true);

    fetchTurnContextCached(turnHash, {
      before: 1,
      after: 0,
      highlightStart: startChar,
      highlightEnd: endChar,
    })
      .then((data) => {
        if (!cancelled) setContextData(data);
      })
      .catch(() => {
        // Graceful degradation
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, turnHash, startChar, endChar, contextData]);

  const handleToggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  if (!turnHash) return null;

  // Build one-line snippet from context data
  const snippet = buildSnippet(contextData);

  return (
    <div ref={ref} className="ml-6 mr-3">
      {/* Collapsed: one-line snippet */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-1.5 py-1 text-xs text-[var(--text-secondary)] italic max-w-full cursor-pointer transition-colors',
          'hover:text-[var(--text-primary)]'
        )}
      >
        <Paperclip className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />
        ) : (
          <span className="truncate">{snippet || 'View source context...'}</span>
        )}
      </button>

      {/* Expanded: full SourceContextView */}
      {expanded && turnHash && (
        <div className="mt-1 mb-2">
          <SourceContextView
            turnHash={turnHash}
            highlightStart={startChar}
            highlightEnd={endChar}
            contextData={contextData}
            autoFetch={!contextData}
            loading={loading}
            showJumpLink={!!onJumpToConversation}
            onJumpClick={onJumpToConversation}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Build a one-line snippet from turn context data */
function buildSnippet(data: TurnContextData | null): string {
  if (!data) return '';

  const parts: string[] = [];

  // Context turns before the target (typically user question)
  const beforeTurns = data.context.filter((t) => !t.is_target);
  if (beforeTurns.length > 0) {
    const lastBefore = beforeTurns[beforeTurns.length - 1];
    if (lastBefore.content) {
      parts.push(`"${truncate(lastBefore.content, 40)}"`);
    }
  }

  // Target turn (the source)
  if (data.target_turn?.content) {
    if (parts.length > 0) {
      parts.push(`\u2192 "${truncate(data.target_turn.content, 40)}"`);
    } else {
      parts.push(`"${truncate(data.target_turn.content, 80)}"`);
    }
  }

  return parts.join(' ');
}

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen)}...`;
}
