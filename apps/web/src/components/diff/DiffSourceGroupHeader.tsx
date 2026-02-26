'use client';

/**
 * DiffSourceGroupHeader — Layer 2 provenance: inline source group header.
 *
 * Inserted between sentence groups in the diff body to show
 * which source conversation the following sentences come from.
 */

import { Leaf, MessageSquare } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// Types
// ============================================================================

interface DiffSourceGroupHeaderProps {
  conversationId: string;
  conversationTitle: string | null;
  sentenceCount: number;
  avgConfidence: number;
  isNewSource: boolean;
  projectId: string;
  type?: 'conversation' | 'leaf';
}

// ============================================================================
// Component
// ============================================================================

export function DiffSourceGroupHeader({
  conversationId,
  conversationTitle,
  sentenceCount,
  avgConfidence,
  isNewSource,
  projectId,
  type = 'conversation',
}: DiffSourceGroupHeaderProps) {
  const Icon = type === 'leaf' ? Leaf : MessageSquare;
  const displayTitle = conversationTitle || conversationId.slice(0, 16);
  const href = `/project/${projectId}/conversation/${conversationId}`;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-panel)] border-l-2 border-[var(--accent-conversation)] sticky top-[40px] z-[5]"
      data-source-group={conversationId}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent-conversation)]" />
      <Link
        href={href}
        className="text-sm font-medium text-[var(--text-primary)] hover:underline truncate max-w-[300px]"
      >
        {displayTitle}
      </Link>
      <span className="text-xs text-[var(--text-tertiary)]">
        · {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
      </span>
      {avgConfidence > 0 && (
        <span className="text-xs text-[var(--text-tertiary)]">
          · avg {avgConfidence.toFixed(2)}
        </span>
      )}
      {isNewSource && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--diff-added-line)]/15 text-[var(--diff-added-line)]">
          NEW SOURCE
        </span>
      )}
    </div>
  );
}
