'use client';

/**
 * NewSlotRow — Blue add row for adding a new slot to a node
 *
 * Two <input> fields (key + value). Enter → addSlot, Esc → cancel.
 * Only renders when editingStore.adding?.nodeId matches.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSlotActions } from '@/hooks/useSlotActions';
import { useEditingStore } from '@/store/editingStore';

interface NewSlotRowProps {
  nodeId: string;
}

export function NewSlotRow({ nodeId }: NewSlotRowProps) {
  const { addSlot } = useSlotActions();
  const stopAdding = useEditingStore((s) => s.stopAdding);
  const keyRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      keyRef.current?.focus();
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const key = keyRef.current?.value.trim();
    const value = valueRef.current?.value.trim();
    if (key && value) {
      addSlot(nodeId, key, value);
      stopAdding();
    }
  }, [nodeId, addSlot, stopAdding]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        stopAdding();
      }
    },
    [handleSubmit, stopAdding]
  );

  return (
    <div className="flex items-stretch" style={{ minHeight: 26 }}>
      <div className="shrink-0 w-1 bg-blue-400" />
      <div
        className="flex-1 flex items-center gap-1 px-2 py-0.5 bg-blue-400/5"
        style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
      >
        <span className="text-blue-400">{'  '}</span>
        <input
          ref={keyRef}
          placeholder="key"
          onKeyDown={handleKeyDown}
          className="bg-transparent border-none outline-none text-blue-400 w-20"
          style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
        />
        <span className="text-blue-400">: </span>
        <input
          ref={valueRef}
          placeholder="value"
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border-none outline-none text-blue-400"
          style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
        />
        <span className="text-[8px] text-[var(--text-tertiary)] whitespace-nowrap">
          Enter ↵ · Esc ✕
        </span>
      </div>
    </div>
  );
}
