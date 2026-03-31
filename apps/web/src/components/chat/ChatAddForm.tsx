'use client';

import type { YOp } from '@t3x-dev/core';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TextSelectionResult } from '@/hooks/useTextSelection';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

interface ChatAddFormProps {
  selection: TextSelectionResult;
  onDone: () => void;
}

export function ChatAddForm({ selection, onDone }: ChatAddFormProps) {
  const draft = useExtractionPanelStore((s) => s.draft);
  const applyYOps = useExtractionPanelStore((s) => s.applyYOps);

  const nodeOptions = useMemo(() => draft.trees.map((t) => t.key), [draft.trees]);

  const [targetNode, setTargetNode] = useState(nodeOptions[0] ?? '');
  const [slotKey, setSlotKey] = useState('');
  const [slotValue, setSlotValue] = useState(selection.text.slice(0, 80));

  function handleAdd() {
    if (!targetNode || !slotKey) return;

    const ops: YOp[] = [
      {
        set: {
          path: `${targetNode}/${slotKey}`,
          value: slotValue,
          source: selection.text,
          from: 'manual',
        },
      },
    ];

    applyYOps(ops, 'manual');
    onDone();
  }

  return (
    <div className="mx-3 my-2 p-2.5 bg-[var(--surface-panel)] border border-[rgba(96,165,250,0.3)] rounded-lg">
      <div className="flex items-center gap-1 text-[10px] font-semibold text-[rgba(96,165,250,1)] mb-1.5">
        <Plus className="w-3 h-3" />
        Add to extraction
      </div>

      <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 p-1 px-1.5 bg-[var(--surface-panel-alt)] rounded font-mono truncate">
        &quot;{selection.text.slice(0, 60)}
        {selection.text.length > 60 ? '...' : ''}&quot;
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Node:</span>
        <select
          value={targetNode}
          onChange={(e) => setTargetNode(e.target.value)}
          className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[rgba(96,165,250,1)]"
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
          className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[rgba(96,165,250,1)]"
        />
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Value:</span>
        <input
          value={slotValue}
          onChange={(e) => setSlotValue(e.target.value)}
          className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[rgba(96,165,250,1)]"
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
          className="px-2.5 py-1 rounded bg-[rgba(96,165,250,1)] text-white text-[9px] font-semibold disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
