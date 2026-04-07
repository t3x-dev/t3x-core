'use client';

/**
 * SourceHighlight — Chat-side extracted text span with 4 visual states.
 *
 * States:
 *  1. Default:  green underline (border-bottom)
 *  2. Hover:    bright green + tooltip with YAML path + edit/delete buttons
 *  3. Active:   purple background (YAML side hover matching this slot)
 *  4. Deleted:  strikethrough + faded (pending unset/drop YOp)
 *
 * Hover triggers workspaceStore.select() → YAML side highlights.
 * Tooltip shows YAML path + ✏ (edit) + ✕ (delete) action buttons.
 */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface SourceHighlightProps {
  /** The display text (verbatim from chat message) */
  text: string;
  /** YAML node ID this text maps to */
  nodeId: string;
  /** YAML slot key */
  slotKey: string;
  /** Whether YAML side is hovering this exact slot */
  isActive?: boolean;
  /** Whether this slot has a pending delete (unset/drop YOp) */
  isDeleted?: boolean;
  /** Called when user clicks ✏ in tooltip */
  onEdit?: (nodeId: string, slotKey: string) => void;
  /** Called when user clicks ✕ in tooltip */
  onDelete?: (nodeId: string, slotKey: string) => void;
}

export function SourceHighlight({
  text,
  nodeId,
  slotKey,
  isActive = false,
  isDeleted = false,
  onEdit,
  onDelete,
}: SourceHighlightProps) {
  const yamlPath = `${nodeId}.${slotKey}`;

  // State 4: deleted — no tooltip, just visual feedback
  if (isDeleted) {
    return (
      <span
        style={{
          textDecoration: 'line-through',
          opacity: 0.4,
          color: 'inherit',
        }}
      >
        {text}
      </span>
    );
  }

  // State 3: active (purple) — YAML side is hovering this slot
  // State 2: hover — bright green + tooltip
  // State 1: default — green underline
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            style={{
              borderBottom: isActive ? '2px solid var(--accent, #8b5cf6)' : '2px solid #4ade80',
              background: isActive ? 'var(--source-dim)' : 'color-mix(in srgb, var(--status-success) 12%, transparent)',
              padding: '0 1px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: 'inherit',
            }}
            onMouseEnter={() => {
              useWorkspaceStore.getState().select('chat', { nodePath: nodeId, slotKey });
            }}
            onMouseLeave={() => useWorkspaceStore.getState().clearSelection()}
          >
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          <span style={{ color: 'var(--accent, #8b5cf6)' }}>{yamlPath}</span>
          <span style={{ color: 'var(--text-tertiary)', margin: '0 2px' }}>·</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(nodeId, slotKey);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 3px',
              color: 'var(--accent, #8b5cf6)',
              fontSize: 11,
            }}
            title="Edit value"
          >
            ✏
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(nodeId, slotKey);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 3px',
              color: 'var(--status-error, #f87171)',
              fontSize: 11,
            }}
            title="Delete"
          >
            ✕
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
