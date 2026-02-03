'use client';

/**
 * ViewSourceLink - Link to jump to conversation page with highlight
 *
 * Generates a URL with query params for turn and highlight position,
 * allowing users to see the source context in the full conversation.
 *
 * @see docs/specification/commit-source-context-presentation.md
 */

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

export interface ViewSourceLinkProps {
  /** Project ID */
  projectId: string;
  /** Conversation ID */
  conversationId: string;
  /** Turn hash to scroll to */
  turnHash: string;
  /** Start character position for highlight (optional) */
  startChar?: number;
  /** End character position for highlight (optional) */
  endChar?: number;
  /** Custom link text (default: "View Source") */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Show external link icon (default: true) */
  showIcon?: boolean;
}

/**
 * Build the conversation URL with highlight parameters
 */
export function buildSourceUrl(
  projectId: string,
  conversationId: string,
  turnHash: string,
  startChar?: number,
  endChar?: number
): string {
  const basePath = `/project/${projectId}/conversation/${conversationId}`;
  const params = new URLSearchParams();

  params.set('turn', turnHash);

  if (startChar !== undefined && endChar !== undefined) {
    params.set('highlight', `${startChar}-${endChar}`);
  }

  return `${basePath}?${params.toString()}`;
}

/**
 * Link component that navigates to conversation page with turn highlight
 */
export function ViewSourceLink({
  projectId,
  conversationId,
  turnHash,
  startChar,
  endChar,
  children,
  className,
  showIcon = true,
}: ViewSourceLinkProps) {
  const href = buildSourceUrl(projectId, conversationId, turnHash, startChar, endChar);

  return (
    <Link
      href={href}
      className={
        className ||
        'inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline'
      }
    >
      {children || 'View Source'}
      {showIcon && <ExternalLink className="h-3 w-3" />}
    </Link>
  );
}

/**
 * Parse highlight parameter from URL
 * @param highlight - String in format "start-end" (e.g., "16-44")
 * @returns Object with start and end, or null if invalid
 */
export function parseHighlightParam(
  highlight: string | null
): { start: number; end: number } | null {
  if (!highlight) return null;

  const match = highlight.match(/^(\d+)-(\d+)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end <= start) {
    return null;
  }

  return { start, end };
}
