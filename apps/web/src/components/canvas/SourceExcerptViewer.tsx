'use client';

import type { SourceTextBlock } from '@/types/nodes';
import { needsSpaceAfter } from './SelectableTextBlockUtils';

// Read-only viewer for committed commit's Source Excerpt
// Only shows included text (semantic selections), no keyword highlighting
interface SourceExcerptViewerProps {
  blocks: SourceTextBlock[];
}

export function SourceExcerptViewer({ blocks }: SourceExcerptViewerProps) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)] text-center text-sm text-[var(--color-text-muted)] italic">
        <span>No source excerpt recorded</span>
      </div>
    );
  }

  // Extract only included text from all blocks
  const excerptText = blocks
    .map((block) => {
      // Get only include selections
      const includeSelections = block.selections.filter((sel) => sel.type === 'include');
      if (includeSelections.length === 0) return '';

      // Build text from included tokens with proper spacing
      let result = '';
      const includedTokens = block.tokens.filter((token) =>
        includeSelections.some(
          (sel) => token.index >= sel.startIndex && token.index <= sel.endIndex
        )
      );

      for (let i = 0; i < includedTokens.length; i++) {
        const token = includedTokens[i];
        const nextToken = includedTokens[i + 1];
        result += token.text;
        if (nextToken && needsSpaceAfter(token, nextToken)) {
          result += ' ';
        }
      }

      return result;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!excerptText.trim()) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)] text-center text-sm text-[var(--color-text-muted)] italic">
        <span>No semantic content selected</span>
      </div>
    );
  }

  return (
    <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
      <div className="text-sm leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
        {excerptText}
      </div>
    </div>
  );
}
