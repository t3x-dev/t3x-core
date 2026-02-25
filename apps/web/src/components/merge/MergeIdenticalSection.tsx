import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useTerminology } from '@/hooks/useTerminology';

interface MergeIdenticalSectionProps {
  sentences: { id: string; text: string }[];
}

/**
 * Collapsible section showing identical sentences (auto-kept)
 * 可折叠的部分，显示相同句子（自动保留）
 *
 * Features:
 * - Default collapsed to reduce cognitive load
 * - Green theme indicating "success/completed"
 * - Click to expand/collapse
 * - Shows count and "auto-kept" status
 */
export function MergeIdenticalSection({ sentences }: MergeIdenticalSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTerminology();

  if (sentences.length === 0) return null;

  return (
    <div className="border border-[var(--diff-added-border)] rounded-lg bg-[var(--diff-added-bg)] p-[var(--space-group)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded px-4 py-2.5 transition-colors hover:bg-[var(--hover-bg)]"
        type="button"
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--diff-added-text)]">
          <CheckCircle2 className="h-4 w-4" />
          {t('identical_sentences')} ({sentences.length}{' '}
          {sentences.length === 1 ? 'sentence' : 'sentences'}) —{t('auto_kept').toLowerCase()}
        </span>
        <span className="text-[var(--diff-added-accent)] text-lg">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ul className="mt-3 space-y-1 text-sm text-[var(--diff-added-accent)] pl-2">
          {sentences.map((s) => (
            <li key={s.id} className="py-2">
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
