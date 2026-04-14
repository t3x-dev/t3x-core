'use client';

import type { TreeNode, SlotValue } from '@t3x-dev/core';
import type { ReactNode } from 'react';
import type { CompatNode } from '@/domain/tree/treeCompat';

// ── Public Types ─────────────────────────────────────────────────────────────

export interface YAMLLine {
  text: string;
  treeId: string;
  slotKey: string | null;
  isNodeHeader: boolean;
  indent: number;
  isEmpty: boolean;
}

export interface YAMLRendererProps {
  /** Pre-nested trees (CompatNode[] from treeCompat) */
  nodes: CompatNode[];
  /** Optional: render custom actions per  node (e.g., Require/Exclude buttons, assertion badges) */
  renderNodeActions?: (treeId: string, treeType: string) => ReactNode;
  /** Optional: highlighted tree ID */
  highlightNodeId?: string | null;
  /** Optional: metadata per  node (change type) */
  getTreeMeta?: (treeId: string) =>
    | {
        changeType?: 'add' | 'update' | 'remove' | null;
      }
    | undefined;
  /** Optional: hover handler */
  onHoverNode?: (treeId: string | null) => void;
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
  treeId: string,
  slotKey: string
): void {
  const pad = '  '.repeat(indent);

  // Simple values: key: "value"
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      treeId,
      slotKey,
      isNodeHeader: false,
      indent,
      isEmpty: false,
    });
    return;
  }

  // SlotRef: key: *f_002
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'ref' in value) {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      treeId,
      slotKey,
      isNodeHeader: false,
      indent,
      isEmpty: false,
    });
    return;
  }

  // Content Blob: { _type: "code"|"plot"|"table"|"image"|"video", ... }
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '_type' in value &&
    typeof (value as Record<string, unknown>)._type === 'string'
  ) {
    const blob = value as Record<string, unknown>;
    const blobType = blob._type as string;

    if (blobType === 'code') {
      const lang = blob.language ?? '';
      lines.push({
        text: `${pad}${key}: [code:${lang}]`,
        treeId,
        slotKey,
        isNodeHeader: false,
        indent,
        isEmpty: false,
      });
      // Render code content as indented lines
      const content = String(blob.content ?? '');
      for (const codeLine of content.split('\n')) {
        lines.push({
          text: `${pad}  ${codeLine}`,
          treeId,
          slotKey,
          isNodeHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
      }
    } else if (blobType === 'plot') {
      const format = blob.format ?? 'chart';
      const desc = blob.description ?? '';
      lines.push({
        text: `${pad}${key}: [plot:${format}] ${desc}`,
        treeId,
        slotKey,
        isNodeHeader: false,
        indent,
        isEmpty: false,
      });
    } else if (blobType === 'table') {
      const headers = Array.isArray(blob.headers) ? blob.headers : [];
      const rows = Array.isArray(blob.rows) ? blob.rows : [];
      lines.push({
        text: `${pad}${key}: [table] ${headers.join(' | ')}`,
        treeId,
        slotKey,
        isNodeHeader: false,
        indent,
        isEmpty: false,
      });
      for (const row of rows) {
        const cells = Array.isArray(row) ? row.join(' | ') : String(row);
        lines.push({
          text: `${pad}  ${cells}`,
          treeId,
          slotKey,
          isNodeHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
      }
    } else {
      // Unknown blob type — show as labeled block
      lines.push({
        text: `${pad}${key}: [${blobType}]`,
        treeId,
        slotKey,
        isNodeHeader: false,
        indent,
        isEmpty: false,
      });
    }
    return;
  }

  // InlineNode: nested object with type + slots
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    'slots' in value
  ) {
    const inlineNode = value as { type: string; slots: Record<string, SlotValue> };
    lines.push({
      text: `${pad}${key}:`,
      treeId,
      slotKey,
      isNodeHeader: false,
      indent,
      isEmpty: false,
    });
    for (const [k, v] of Object.entries(inlineNode.slots)) {
      renderSlotLines(lines, k, v, indent + 1, treeId, slotKey);
    }
    return;
  }

  // Array — always use bullet points
  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    lines.push({
      text: `${pad}${key}:`,
      treeId,
      slotKey,
      isNodeHeader: false,
      indent,
      isEmpty: false,
    });
    for (const item of arr) {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          treeId,
          slotKey,
          isNodeHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
      } else if (typeof item === 'object' && item !== null && 'type' in item && 'slots' in item) {
        // InlineNode in array
        const inlineNode = item as { type: string; slots: Record<string, SlotValue> };
        lines.push({
          text: `${pad}  - ${inlineNode.type}:`,
          treeId,
          slotKey,
          isNodeHeader: false,
          indent: indent + 1,
          isEmpty: false,
        });
        for (const [k, v] of Object.entries(inlineNode.slots)) {
          renderSlotLines(lines, k, v, indent + 2, treeId, slotKey);
        }
      } else {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          treeId,
          slotKey,
          isNodeHeader: false,
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
    treeId,
    slotKey,
    isNodeHeader: false,
    indent,
    isEmpty: false,
  });
}

// ── Public: Build YAML Lines (pure, no React) ─────────────────────────────────

/**
 * Converts an array of Frames into a flat list of YAMLLine descriptors.
 * This is a pure function — no side effects, no store dependencies.
 */
export function buildYAMLLines(nodes: CompatNode[]): YAMLLine[] {
  const lines: YAMLLine[] = [];

  for (const node of nodes) {
    // Tree header
    lines.push({
      text: `${node.type}:`,
      treeId: node.id,
      slotKey: null,
      isNodeHeader: true,
      indent: 0,
      isEmpty: false,
    });

    // Slot lines
    for (const [key, value] of Object.entries(node.slots)) {
      renderSlotLines(lines, key, value, 1, node.id, key);
    }

    // Blank separator
    lines.push({
      text: '',
      treeId: node.id,
      slotKey: null,
      isNodeHeader: false,
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

export function YAMLRenderer({
  nodes,
  renderNodeActions,
  highlightNodeId,
  getTreeMeta,
  onHoverNode,
  className,
}: YAMLRendererProps) {
  const yamlLines = buildYAMLLines( nodes);

  if (nodes.length === 0) {
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
        No trees
      </div>
    );
  }

  // Group lines by tree for action rendering
  const _treeIds = [...new Set(nodes.map((f) => f.id))];

  // Track which trees we've rendered actions for
  const renderedActionNodes = new Set<string>();

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
          // After blank, render tree actions for this tree (once)
          const shouldRenderActions = renderNodeActions && !renderedActionNodes.has(line.treeId);
          if (shouldRenderActions) {
            renderedActionNodes.add(line.treeId);
            const node = nodes.find((f) => f.id === line.treeId);
            const actions =  node ? renderNodeActions(node.id, node.type) : null;
            if (actions) {
              return (
                <div key={i}>
                  <div data-tree-actions={line.treeId} style={{ padding: '2px 8px 4px 8px' }}>
                    {actions}
                  </div>
                  <div style={{ height: 4 }} />
                </div>
              );
            }
          }
          return <div key={i} style={{ height: 4 }} />;
        }

        const meta = getTreeMeta?.(line.treeId);
        const changeType = meta?.changeType ?? null;
        const isHighlighted = highlightNodeId != null && highlightNodeId === line.treeId;

        const borderLeft =
          line.isNodeHeader && changeType ? changeTypeBorder[changeType] : undefined;

        const bg = isHighlighted ? 'color-mix(in srgb, var(--status-info) 10%, transparent)' : 'transparent';

        return (
          <div
            key={i}
            data-tree-id={line.isNodeHeader ? line.treeId : undefined}
            onMouseEnter={() => onHoverNode?.(line.treeId)}
            onMouseLeave={() => onHoverNode?.(null)}
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
                color: line.isNodeHeader ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: line.isNodeHeader ? 600 : 400,
                whiteSpace: 'pre',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
                minWidth: 0,
              }}
            >
              {line.text}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
