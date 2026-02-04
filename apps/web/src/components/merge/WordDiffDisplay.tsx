import type { WordDiffSegment } from '@/types/merge';

interface WordDiffDisplayProps {
  segments: WordDiffSegment[];
}

/**
 * Displays word-level diff with color coding
 * 显示带颜色编码的词级差异
 *
 * - unchanged: normal text
 * - added: green background
 * - removed: red background with strikethrough
 *
 * @example
 * <WordDiffDisplay segments={[
 *   { type: 'unchanged', text: 'Budget is' },
 *   { type: 'removed', text: '$3000' },
 *   { type: 'added', text: '$3500' }
 * ]} />
 *
 * Renders: "Budget is [-$3000-] [+$3500+]"
 */
export function WordDiffDisplay({ segments }: WordDiffDisplayProps) {
  return (
    <span className="font-mono text-sm">
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'unchanged':
            return <span key={i}>{segment.text}</span>;
          case 'removed':
            return (
              <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 line-through px-1 rounded">
                {segment.text}
              </span>
            );
          case 'added':
            return (
              <span key={i} className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-1 rounded ml-1">
                {segment.text}
              </span>
            );
        }
      })}
    </span>
  );
}
