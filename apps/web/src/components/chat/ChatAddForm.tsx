'use client';

/**
 * ChatAddForm — Add selected chat text to YAML extraction.
 *
 * Two paths:
 *  - Short text (< 40 chars, no comma): manual form (node + key + value)
 *  - Long text (>= 40 chars or has comma): LLM-assist with structured preview
 *
 * TODO(undo-redo): yops_log is append-only; undo is deferred to a future PR.
 * Execute currently routes directly (no undo stack).
 */

import type { YOp } from '@t3x-dev/core';
import { Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TextSelectionResult } from '@/hooks/useTextSelection';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface ChatAddFormProps {
  selection: TextSelectionResult;
  onDone: () => void;
}

export function ChatAddForm({ selection, onDone }: ChatAddFormProps) {
  const draft = useWorkspaceStore((s) => s.tree);
  // TODO(undo-redo): yops_log is append-only; undo is deferred to a future PR.
  // Replace with goldEditBuilder dispatch when wired.
  const execute = (_ops: YOp[]) => {};

  const nodeOptions = useMemo(() => draft.trees.map((t) => t.key), [draft.trees]);

  const [targetNode, setTargetNode] = useState(nodeOptions[0] ?? '');
  const [slotKey, setSlotKey] = useState('');
  const [slotValue, setSlotValue] = useState(selection.text.slice(0, 80));

  // LLM-assist detection
  const isLongText = selection.text.length >= 40 || selection.text.includes(',');
  const [forcedManual, setForcedManual] = useState(false);
  const showLlmAssist = isLongText && !forcedManual;

  // TODO: LLM structuring API call (placeholder)
  const [llmSuggestion, _setLlmSuggestion] = useState<{ yaml: string; ops: YOp[] } | null>(null);

  function handleAdd() {
    if (!targetNode || !slotKey) return;
    const ops: YOp[] = [
      {
        set: {
          path: `${targetNode}/${slotKey}`,
          value: slotValue,
        },
      },
    ];
    execute(ops);
    onDone();
  }

  function handleAddAll() {
    if (!llmSuggestion) return;
    execute(llmSuggestion.ops);
    onDone();
  }

  return (
    <div className="mx-3 my-2 p-2.5 bg-[var(--surface-panel)] border border-[var(--status-info)]/30 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--status-info)] mb-1.5">
        <Plus className="w-3 h-3" />
        Add to extraction
        {showLlmAssist && (
          <span className="ml-auto text-[8px] px-1.5 py-px rounded bg-[var(--accent-pending)]/15 text-[var(--accent-pending)]">
            AI suggested
          </span>
        )}
      </div>

      {/* Selected text preview */}
      <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 p-1 px-1.5 bg-[var(--surface-panel-alt)] rounded font-mono truncate">
        &quot;{selection.text.slice(0, 60)}
        {selection.text.length > 60 ? '...' : ''}&quot;
      </div>

      {showLlmAssist ? (
        /* LLM-assist path */
        <div>
          {llmSuggestion ? (
            <>
              <pre className="text-[10px] font-mono leading-[1.8] p-1.5 bg-[var(--surface-panel-alt)] border border-[var(--stroke-default)] rounded mb-2 whitespace-pre-wrap">
                {llmSuggestion.yaml}
              </pre>
              <div className="flex gap-1 justify-end">
                <button
                  type="button"
                  onClick={onDone}
                  className="px-2.5 py-1 rounded border border-[var(--stroke-default)] text-[9px] font-semibold text-[var(--text-tertiary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setForcedManual(true)}
                  className="px-2.5 py-1 rounded border border-[var(--stroke-default)] text-[9px] font-semibold text-[var(--text-tertiary)]"
                >
                  Edit manually
                </button>
                <button
                  type="button"
                  onClick={handleAddAll}
                  className="px-2.5 py-1 rounded bg-[var(--status-info)] text-white text-[9px] font-semibold"
                >
                  Add all
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-[var(--text-tertiary)] mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-pulse" />
                Analyzing text structure...
              </div>
              <div className="flex gap-1 justify-end">
                <button
                  type="button"
                  onClick={onDone}
                  className="px-2.5 py-1 rounded border border-[var(--stroke-default)] text-[9px] font-semibold text-[var(--text-tertiary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setForcedManual(true)}
                  className="px-2.5 py-1 rounded border border-[var(--stroke-default)] text-[9px] font-semibold text-[var(--text-tertiary)]"
                >
                  Edit manually
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Manual path */
        <>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Node:</span>
            <select
              value={targetNode}
              onChange={(e) => setTargetNode(e.target.value)}
              className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--status-info)]"
            >
              {nodeOptions.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Key:</span>
            <input
              value={slotKey}
              onChange={(e) => setSlotKey(e.target.value)}
              placeholder="slot_key"
              className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--status-info)]"
            />
          </div>

          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Value:</span>
            <input
              value={slotValue}
              onChange={(e) => setSlotValue(e.target.value)}
              className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--status-info)]"
            />
          </div>

          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={onDone}
              className="px-2.5 py-1 rounded border border-[var(--stroke-default)] text-[9px] font-semibold text-[var(--text-tertiary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!targetNode || !slotKey}
              className="px-2.5 py-1 rounded bg-[var(--status-info)] text-white text-[9px] font-semibold disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}
