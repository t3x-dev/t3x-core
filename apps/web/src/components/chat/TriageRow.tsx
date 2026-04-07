'use client';

import type { TreeNode } from '@t3x-dev/core';
import { Check, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import type { SourceTag } from '@/lib/sourceTag';

interface TriageRowProps {
  node: TreeNode;
  sourceTag: SourceTag;
  status: 'accepted' | 'dismissed' | 'pending';
  onAccept: () => void;
  onDismiss: () => void;
  slotStates?: Record<string, boolean>;
  onToggleSlot?: (slotKey: string) => void;
}

const SOURCE_TAG_STYLES: Record<SourceTag, { bg: string; text: string; label: string }> = {
  user: { bg: 'bg-[var(--source-dim)]', text: 'text-[var(--source)]', label: 'USER' },
  llm: { bg: 'bg-[var(--slot-dim)]', text: 'text-[var(--slot)]', label: 'LLM' },
  both: { bg: 'bg-[var(--status-warning)]/15', text: 'text-[var(--status-warning)]', label: 'BOTH' },
};

function slotPreview(node: TreeNode, maxSlots = 2): string {
  return Object.entries(node.slots)
    .slice(0, maxSlots)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 16)}`)
    .join(', ');
}

export function TriageRow({
  node,
  sourceTag,
  status,
  onAccept,
  onDismiss,
  slotStates,
  onToggleSlot,
}: TriageRowProps) {
  const [expanded, setExpanded] = useState(false);
  const slotCount = Object.keys(node.slots).length;
  const tag = SOURCE_TAG_STYLES[sourceTag];

  const barColor =
    status === 'accepted'
      ? 'bg-[var(--status-success)]'
      : status === 'dismissed'
        ? 'bg-[var(--status-error)] opacity-40'
        : 'bg-[var(--stroke-light)]';

  return (
    <div>
      <div
        className={`flex items-center min-h-[36px] border-b border-[var(--stroke-divider)] transition-all cursor-pointer hover:bg-[var(--hover-bg)] ${
          status === 'accepted' ? 'bg-[var(--status-success)]/[0.02]' : ''
        } ${status === 'dismissed' ? 'opacity-20' : ''}`}
      >
        <div className={`w-1 self-stretch shrink-0 ${barColor}`} />
        <div
          className="flex-1 flex items-center gap-2 px-2.5 py-1.5 min-w-0"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight
            className={`w-[10px] h-[10px] text-[var(--text-tertiary)] transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
          />
          <span
            className={`text-[11px] font-semibold font-mono whitespace-nowrap ${
              status === 'dismissed'
                ? 'text-[var(--text-tertiary)] line-through'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {node.key}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] overflow-hidden text-ellipsis whitespace-nowrap flex-1 font-mono">
            {slotPreview(node)}
          </span>
          <span
            className={`text-[7px] font-bold px-[5px] py-px rounded-[3px] tracking-wider shrink-0 ${tag.bg} ${tag.text}`}
          >
            {tag.label}
          </span>
          <span className="text-[9px] text-[var(--text-tertiary)] shrink-0">{slotCount}</span>
        </div>
        <div className="flex gap-px pr-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAccept();
            }}
            className={`w-[26px] h-[26px] flex items-center justify-center rounded-[5px] text-xs transition-all ${
              status === 'accepted'
                ? 'text-[var(--status-success)] opacity-100'
                : 'text-[var(--status-success)] opacity-40 hover:opacity-100 hover:bg-[var(--status-success)]/15'
            }`}
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-[5px] text-xs text-[var(--status-error)] opacity-20 hover:opacity-70 hover:bg-[var(--status-error)]/15 transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="py-0 pl-3.5 border-b border-[var(--stroke-divider)] bg-[var(--hover-bg)]/25">
          {Object.entries(node.slots).map(([slotKey, slotValue]) => {
            const isOn = slotStates ? slotStates[slotKey] !== false : true;
            return (
              <div
                key={slotKey}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-mono cursor-pointer rounded-[3px] hover:bg-[var(--hover-bg)] ${
                  isOn ? '' : 'opacity-30'
                }`}
                onClick={() => onToggleSlot?.(slotKey)}
              >
                <div
                  className={`w-3 h-3 rounded-[3px] flex items-center justify-center text-[7px] shrink-0 ${
                    isOn
                      ? 'bg-[var(--status-success)] border-[var(--status-success)] text-white'
                      : 'border border-[var(--stroke-light)]'
                  }`}
                >
                  {isOn && '✓'}
                </div>
                <span className={`text-[var(--text-tertiary)] ${!isOn ? 'line-through' : ''}`}>
                  {slotKey}:
                </span>
                <span className={`text-[var(--text-secondary)] ${!isOn ? 'line-through' : ''}`}>
                  {String(slotValue).slice(0, 50)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
