import { useState } from 'react';

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

  if (sentences.length === 0) return null;

  return (
    <div className="border border-green-200 rounded-lg bg-green-50 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex justify-between items-center w-full cursor-pointer hover:bg-green-100 rounded px-2 py-1 transition-colors"
        type="button"
      >
        <span className="font-medium text-green-800">
          ✓ Identical ({sentences.length} {sentences.length === 1 ? 'sentence' : 'sentences'}) — auto-kept
        </span>
        <span className="text-green-600 text-lg">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ul className="mt-3 space-y-1 text-sm text-green-700 pl-2">
          {sentences.map((s) => (
            <li key={s.id} className="py-1">
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
