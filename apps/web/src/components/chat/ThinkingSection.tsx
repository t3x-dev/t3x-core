'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ThinkingSectionProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingSection({ content, isStreaming }: ThinkingSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {isStreaming ? 'Thinking...' : 'Thought process'}
      </button>
      {expanded && (
        <div className="mt-1 pl-4 border-l-2 border-[var(--border-primary)] text-xs text-[var(--text-tertiary)] leading-relaxed whitespace-pre-wrap italic max-h-60 overflow-y-auto">
          {content}
          {isStreaming && (
            <span
              className="inline-block w-0.5 h-[1em] ml-0.5 rounded-sm"
              style={{
                background: 'var(--text-tertiary)',
                animation: 'blink 1s step-end infinite',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
