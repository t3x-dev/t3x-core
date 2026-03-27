'use client';

import type { Delta } from '@t3x-dev/core';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

// ── Types ──

interface TextToTreePopoverProps {
  selectedText: string;
  position: { x: number; y: number };
  onClose: () => void;
}

// ── Component ──

export function TextToTreePopover({ selectedText, position, onClose }: TextToTreePopoverProps) {
  const _applyDelta = useExtractionPanelStore((s) => s.applyDelta);

  const [treeType, setTreeType] = useState('');
  const [slotKey, setSlotKey] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAdd = () => {
    const delta: Delta = {
      changes: [
        {
          action: 'add',
          parent_path: '',
          node: {
            key: treeType || 'note',
            slots: { [slotKey || 'content']: selectedText },
            children: [],
          },
        },
      ],
    };
    useExtractionPanelStore.getState().applyDelta(delta, 'manual');
    onClose();
  };

  return (
    <div
      ref={containerRef}
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 w-64 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--stroke-default)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Add to Extraction</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Selected text quote */}
      <div className="px-3 py-2">
        <blockquote className="rounded border-l-2 border-[var(--accent-commit)] bg-[var(--hover-bg)] pl-2 pr-1 py-1">
          <p className="line-clamp-3 text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {selectedText}
          </p>
        </blockquote>
      </div>

      {/* Inputs */}
      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="ttf-tree-type"
            className="text-[10px] font-medium text-[var(--text-tertiary)]"
          >
            Tree type
          </label>
          <input
            id="ttf-tree-type"
            type="text"
            value={treeType}
            onChange={(e) => setTreeType(e.target.value)}
            placeholder="e.g., decision, requirement"
            className="w-full rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="ttf-slot-key"
            className="text-[10px] font-medium text-[var(--text-tertiary)]"
          >
            Slot key
          </label>
          <input
            id="ttf-slot-key"
            type="text"
            value={slotKey}
            onChange={(e) => setSlotKey(e.target.value)}
            placeholder="e.g., description"
            className="w-full rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="w-full rounded bg-[var(--accent-commit)] py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Add to extraction
        </button>
      </div>
    </div>
  );
}
