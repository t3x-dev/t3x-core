'use client';

import type { Pin } from '@t3x-dev/core';
import { ChevronDown, ChevronRight, Leaf, MessageSquare, Pin as PinIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';

export interface EnrichedPin extends Pin {
  title?: string;
  assertionLessons?: string[];
  turnCount?: number;
  turnPreview?: string;
}

interface SourceMaterialPanelProps {
  pins: EnrichedPin[];
  onConfirm: (selectedPinIds: string[]) => void;
  onCancel: () => void;
}

interface PinCardProps {
  pin: EnrichedPin;
  checked: boolean;
  onToggle: (id: string) => void;
}

function PinCard({ pin, checked, onToggle }: PinCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = pin.type === 'leaf';
  const hasLessons = isLeaf && pin.assertionLessons && pin.assertionLessons.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all',
        checked
          ? 'border-[var(--stroke-default)] bg-[var(--surface-elevated)]'
          : 'border-dashed border-[var(--stroke-default)] bg-[var(--surface-elevated)] opacity-50'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(pin.id)}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border accent-[var(--status-success)] transition-colors',
            checked ? 'border-[var(--status-success)]' : 'border-[var(--stroke-default)]'
          )}
        />

        {/* Icon */}
        <div
          className={cn(
            'mt-0.5 shrink-0',
            isLeaf ? 'text-[var(--accent-leaf)]' : 'text-[var(--accent-conversation)]'
          )}
        >
          {isLeaf ? <Leaf size={13} /> : <MessageSquare size={13} />}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-xs font-medium text-[var(--text-primary)]">
              {pin.title ?? pin.ref_id}
            </span>
            <span
              className={cn(
                'shrink-0 rounded px-1 py-px text-[10px] font-medium',
                isLeaf
                  ? 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
                  : 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
              )}
            >
              {isLeaf ? 'leaf' : 'conv'}
            </span>
          </div>

          {/* Conversation preview */}
          {!isLeaf && pin.turnPreview && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">
              {pin.turnPreview}
            </p>
          )}
          {!isLeaf && pin.turnCount !== undefined && (
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              {pin.turnCount} turn{pin.turnCount !== 1 ? 's' : ''}
            </p>
          )}

          {/* Leaf assertion lessons (expandable) */}
          {hasLessons && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {pin.assertionLessons!.length} lesson
                {pin.assertionLessons!.length !== 1 ? 's' : ''}
              </button>
              {expanded && (
                <ul className="mt-1 space-y-0.5 border-l border-[var(--stroke-divider)] pl-2">
                  {pin.assertionLessons!.map((lesson, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list from API
                    <li key={i} className="text-[10px] text-[var(--text-tertiary)]">
                      {lesson}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SourceMaterialPanel({ pins, onConfirm, onCancel }: SourceMaterialPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(pins.map((p) => p.id)));

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedIds));
  }, [selectedIds, onConfirm]);

  // N = selected pins + 1 for current conversation
  const sourceCount = useMemo(() => selectedIds.size + 1, [selectedIds]);

  if (pins.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3">
      {/* Section divider */}
      <div className="mb-3 flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--stroke-divider)]" />
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <PinIcon size={10} />
          <span>Pinned Sources</span>
        </div>
        <div className="h-px flex-1 bg-[var(--stroke-divider)]" />
      </div>

      {/* Pin cards */}
      <div className="space-y-2">
        {pins.map((pin) => (
          <PinCard
            key={pin.id}
            pin={pin}
            checked={selectedIds.has(pin.id)}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-md bg-[var(--source)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] transition-opacity hover:opacity-90"
        >
          Extract with {sourceCount} source{sourceCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}
