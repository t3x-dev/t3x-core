// @ts-nocheck — tree-primary migration: needs rework
'use client';

import type { TreeNode, SlotValue } from '@t3x-dev/core';
import type { ReactNode } from 'react';
import type { Frame } from '@/lib/treeCompat';

// ── Public Types ─────────────────────────────────────────────────────────────

export interface YAMLLine {
  text: string;
  frameId: string;
  slotKey: string | null;
  isFrameHeader: boolean;
  indent: number;
  isEmpty: boolean;
}

export interface FrameYAMLRendererProps {
  /** Pre-nested frames (output of nestFrames()) */
  frames: TreeNode[];
  /** Optional: render custom actions per frame (e.g., Require/Exclude buttons, assertion badges) */
  renderFrameActions?: (frameId: string, frameType: string) => ReactNode;
  /** Optional: highlighted frame ID */
  highlightFrameId?: string | null;
  /** Optional: metadata per frame (confidence, change type) */
  getFrameMeta?: (frameId: string) =>
    | {
        confidence?: number;
        changeType?: 'add' | 'update' | 'remove' | null;
      }
    | undefined;
  /** Optional: hover handler */
  onHoverFrame?: (frameId: string | null) => void;
  /** Optional: CSS class */
  className?: string;
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function formatValue(value: SlotValue): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value !== null && 'ref' in value) {
    return `*${(value as { ref: string }).ref}`;
  }
  return String(value);
}

function renderSlotLines(
  lines: YAMLLine[],
  key: string,
  value: SlotValue,
  indent: number,
  frameId: string,
  slotKey: string
): void {
  const pad = '  '.repeat(indent);

  // Simple values: key: "value"
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      frameId,
      slotKey,
      isFrameHeader: false,
      indent,
      isEmpty: false,
    });
    return;
  }

  // SlotRef: key: *f_002
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'ref' in value) {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      frameId,
      slotKey,
      isFrameHeader: false,
      indent,
      isEmpty: false,
    });
    return;
  }

  // InlineFrame: nested object with type + slots
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    'slots' in value
  ) {
    const inlineFrame = value as { type: string; slots: Record<string, SlotValue> };
    lines.push({
      text: `${pad}${key}:`,
      frameId,
      slotKey,
      isFrameHeader: false,
      indent,
      isEmpty: false,
    });
    for (const [k, v] of Object.entries(inlineFrame.slots)) {
      renderSlotLines(lines, k, v, indent + 1, frameId, slotKey);
    }
    return;
  }

  // Array — always use bullet points
  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    lines.push({
      text: `${pad}${key}:`,
      frameId,
      slotKey,
      isFrameHeader: false,
      indent,
      isEmpty: false,
    });
    for (const item of arr) {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          frameId,
          slotKey,
          isFrameHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
      } else if (typeof item === 'object' && item !== null && 'type' in item && 'slots' in item) {
        // InlineFrame in array
        const inlineFrame = item as { type: string; slots: Record<string, SlotValue> };
        lines.push({
          text: `${pad}  - ${inlineFrame.type}:`,
          frameId,
          slotKey,
          isFrameHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
        for (const [k, v] of Object.entries(inlineFrame.slots)) {
          renderSlotLines(lines, k, v, indent + 2, frameId, slotKey);
        }
      } else {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          frameId,
          slotKey,
          isFrameHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
      }
    }
    return;
  }

  // Fallback
  lines.push({
    text: `${pad}${key}: ${JSON.stringify(value)}`,
    frameId,
    slotKey,
    isFrameHeader: false,
    indent,
    isEmpty: false,
  });
}

// ── Public: Build YAML Lines (pure, no React) ─────────────────────────────────

/**
 * Converts an array of Frames into a flat list of YAMLLine descriptors.
 * This is a pure function — no side effects, no store dependencies.
 */
export function buildYAMLLines(frames: TreeNode[]): YAMLLine[] {
  const lines: YAMLLine[] = [];

  for (const frame of frames) {
    // Frame header
    lines.push({
      text: `${frame.type}:`,
      frameId: frame.id,
      slotKey: null,
      isFrameHeader: true,
      indent: 0,
      isEmpty: false,
    });

    // Slot lines
    for (const [key, value] of Object.entries(frame.slots)) {
      renderSlotLines(lines, key, value, 1, frame.id, key);
    }

    // Blank separator
    lines.push({
      text: '',
      frameId: frame.id,
      slotKey: null,
      isFrameHeader: false,
      indent: 0,
      isEmpty: true,
    });
  }

  return lines;
}

// ── Change type border colors ─────────────────────────────────────────────────

const changeTypeBorder: Record<string, string> = {
  add: '2px solid #4ade80',
  update: '2px solid #facc15',
  remove: '2px solid #f87171',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FrameYAMLRenderer({
  frames,
  renderFrameActions,
  highlightFrameId,
  getFrameMeta,
  onHoverFrame,
  className,
}: FrameYAMLRendererProps) {
  const yamlLines = buildYAMLLines(frames);

  if (frames.length === 0) {
    return (
      <div
        className={className}
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          background: 'var(--surface-panel)',
          border: '1px solid var(--stroke-default)',
          borderRadius: 4,
          padding: '8px',
          color: 'var(--text-tertiary)',
          fontSize: 11,
        }}
      >
        No frames
      </div>
    );
  }

  // Group lines by frame for action rendering
  const _frameIds = [...new Set(frames.map((f) => f.id))];

  // Track which frames we've rendered actions for
  const renderedActionFrames = new Set<string>();

  return (
    <div
      className={className}
      style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        background: 'var(--surface-panel)',
        border: '1px solid var(--stroke-default)',
        borderRadius: 4,
        overflow: 'auto',
      }}
    >
      {yamlLines.map((line, i) => {
        // Blank separator
        if (line.isEmpty) {
          // After blank, render frame actions for this frame (once)
          const shouldRenderActions = renderFrameActions && !renderedActionFrames.has(line.frameId);
          if (shouldRenderActions) {
            renderedActionFrames.add(line.frameId);
            const frame = frames.find((f) => f.id === line.frameId);
            const actions = frame ? renderFrameActions(frame.id, frame.type) : null;
            if (actions) {
              return (
                <div key={i}>
                  <div data-frame-actions={line.frameId} style={{ padding: '2px 8px 4px 8px' }}>
                    {actions}
                  </div>
                  <div style={{ height: 4 }} />
                </div>
              );
            }
          }
          return <div key={i} style={{ height: 4 }} />;
        }

        const meta = getFrameMeta?.(line.frameId);
        const changeType = meta?.changeType ?? null;
        const confidence = line.isFrameHeader ? (meta?.confidence ?? null) : null;
        const isHighlighted = highlightFrameId != null && highlightFrameId === line.frameId;

        const borderLeft =
          line.isFrameHeader && changeType ? changeTypeBorder[changeType] : undefined;

        const bg = isHighlighted ? 'rgba(96, 165, 250, 0.1)' : 'transparent';

        return (
          <div
            key={i}
            data-frame-id={line.isFrameHeader ? line.frameId : undefined}
            onMouseEnter={() => onHoverFrame?.(line.frameId)}
            onMouseLeave={() => onHoverFrame?.(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              minHeight: 20,
              background: bg,
              borderLeft,
              transition: 'background 0.15s',
            }}
          >
            <pre
              style={{
                margin: 0,
                padding: '1px 8px',
                fontSize: 11,
                lineHeight: '18px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: line.isFrameHeader ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: line.isFrameHeader ? 600 : 400,
                whiteSpace: 'pre',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
                minWidth: 0,
              }}
            >
              {line.text}
              {confidence != null && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                    fontWeight: 400,
                  }}
                >
                  {Math.round(confidence * 100)}%
                </span>
              )}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
