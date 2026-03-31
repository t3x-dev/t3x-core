'use client';

/**
 * CommitYAMLDocument — renders all trees from a commit as one continuous,
 * nested YAML document where relations define the hierarchy.
 *
 * Frames related via elaborates/conditions/depends/follows are nested
 * under their parent node. Root trees (not a child of anything) appear
 * at the top level.
 */

import type { SemanticContent, SlotValue } from '@t3x-dev/core';
import { useCallback, useMemo } from 'react';
import { type CompatNode, treesToNodes } from '@/lib/treeCompat';

// ============================================================================
// Props
// ============================================================================

export interface CommitYAMLDocumentProps {
  content: SemanticContent;
  className?: string;
  onSlotClick?: (treeId: string, slotKey: string) => void;
}

// ============================================================================
// Tree-building helpers
// ============================================================================

interface TreeGraphNode {
  node: CompatNode;
  displayName: string;
  relationType?: string;
  children: TreeGraphNode[];
}

/** Build display names with _2, _3 suffixes for duplicate types (scoped per parent). */
function buildDisplayNames(nodes: CompatNode[]): Map<string, string> {
  const counts = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const node of nodes) {
    const count = (counts.get(node.type) ?? 0) + 1;
    counts.set(node.type, count);
    const displayName = count === 1 ? node.type : `${node.type}_${count}`;
    nameMap.set(node.id, displayName);
  }
  return nameMap;
}

function buildTreeGraph(content: SemanticContent): TreeGraphNode[] {
  const nodes = treesToNodes(content.trees);
  const treeMap = new Map<string, CompatNode>();
  for (const node of nodes) {
    treeMap.set(node.id, node);
  }

  // children map: parentId → [{ childId, relationType }]
  const childrenMap = new Map<string, Array<{ childId: string; relationType: string }>>();
  const childIds = new Set<string>();

  for (const rel of content.relations) {
    // relation: { from: A, to: B } means A elaborates/conditions/depends/follows B
    // so A is a child of B
    if (!treeMap.has(rel.from) || !treeMap.has(rel.to)) continue;
    childIds.add(rel.from);
    const existing = childrenMap.get(rel.to) ?? [];
    existing.push({ childId: rel.from, relationType: rel.type });
    childrenMap.set(rel.to, existing);
  }

  // Root nodes: not a child of anyone
  const rootNodes = nodes.filter((f) => !childIds.has(f.id));

  // Build display name map across all trees
  const nameMap = buildDisplayNames( nodes);

  // Recursive builder (with visited set to avoid cycles)
  function buildNode(node: CompatNode, relationType?: string, visited?: Set<string>): TreeGraphNode {
    const vis = visited ?? new Set<string>();
    vis.add(node.id);

    const children: TreeGraphNode[] = [];
    const childEntries = childrenMap.get(node.id) ?? [];
    for (const { childId, relationType: childRelType } of childEntries) {
      if (vis.has(childId)) continue;
      const childNode = treeMap.get(childId);
      if (childNode) {
        children.push(buildNode(childNode, childRelType, new Set(vis)));
      }
    }

    return {
      node,
      displayName: nameMap.get(node.id) ?? node.type,
      relationType,
      children,
    };
  }

  return rootNodes.map((f) => buildNode(f));
}

// ============================================================================
// Line model — each visual line gets its own element
// ============================================================================

interface YAMLLine {
  key: string;
  indent: number;
  elements: React.ReactNode[];
  treeId?: string;
  slotKey?: string;
}

// ============================================================================
// Rendering helpers
// ============================================================================

function confidencePercent(c?: number): string {
  if (c == null) return '';
  return `${Math.round(c * 100)}%`;
}

function Comment({ text }: { text: string }) {
  return <span className="text-[var(--yaml-comment,#6b7280)]">{text}</span>;
}

function YAMLKey({ text }: { text: string }) {
  return <span className="text-[var(--yaml-key,#2563eb)]">{text}</span>;
}

function Colon() {
  return <span className="text-[var(--yaml-punctuation,#6b7280)]">:&nbsp;</span>;
}

function StringValue({ text }: { text: string }) {
  return <span className="text-[var(--yaml-string,#16a34a)]">"{text}"</span>;
}

function NumberValue({ value }: { value: number }) {
  return <span className="text-[var(--yaml-number,#d97706)]">{value}</span>;
}

function RefValue({ ref: refId }: { ref: string }) {
  return <span className="text-[var(--yaml-ref,#7c3aed)]">*{refId}</span>;
}

function ArrayDash() {
  return <span className="text-[var(--yaml-punctuation,#6b7280)]">- </span>;
}

// ============================================================================
// Slot value → lines
// ============================================================================

function renderSlotValueLines(
  value: SlotValue,
  indent: number,
  treeId: string,
  slotKey: string,
  lines: YAMLLine[],
  lineKeyPrefix: string,
  isArrayItem?: boolean
): void {
  if (typeof value === 'string') {
    lines.push({
      key: lineKeyPrefix,
      indent,
      elements: [
        ...(isArrayItem ? [<ArrayDash key="dash" />] : []),
        <StringValue key="v" text={value} />,
      ],
      treeId,
      slotKey,
    });
    return;
  }

  if (typeof value === 'number') {
    lines.push({
      key: lineKeyPrefix,
      indent,
      elements: [
        ...(isArrayItem ? [<ArrayDash key="dash" />] : []),
        <NumberValue key="v" value={value} />,
      ],
      treeId,
      slotKey,
    });
    return;
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if ('ref' in value && typeof (value as { ref: string }).ref === 'string') {
      lines.push({
        key: lineKeyPrefix,
        indent,
        elements: [
          ...(isArrayItem ? [<ArrayDash key="dash" />] : []),
          <RefValue key="v" ref={(value as { ref: string }).ref} />,
        ],
        treeId,
        slotKey,
      });
      return;
    }
    if ('type' in value && 'slots' in value) {
      const inlineNode = value as { type: string; slots: Record<string, SlotValue> };
      // Render inline node as nested keys
      lines.push({
        key: lineKeyPrefix,
        indent,
        elements: [
          ...(isArrayItem ? [<ArrayDash key="dash" />] : []),
          <YAMLKey key="k" text={inlineNode.type} />,
          <Colon key="c" />,
        ],
        treeId,
        slotKey,
      });
      for (const [k, v] of Object.entries(inlineNode.slots)) {
        renderSlotEntry(k, v, indent + 1, treeId, slotKey, lines, `${lineKeyPrefix}-if-${k}`);
      }
      return;
    }
  }

  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    for (let i = 0; i < arr.length; i++) {
      renderSlotValueLines(arr[i], indent, treeId, slotKey, lines, `${lineKeyPrefix}-${i}`, true);
    }
    return;
  }

  // Fallback
  lines.push({
    key: lineKeyPrefix,
    indent,
    elements: [
      <span key="v" className="text-[var(--yaml-punctuation,#6b7280)]">
        {JSON.stringify(value)}
      </span>,
    ],
    treeId,
    slotKey,
  });
}

function renderSlotEntry(
  key: string,
  value: SlotValue,
  indent: number,
  treeId: string,
  slotKey: string,
  lines: YAMLLine[],
  lineKeyPrefix: string
): void {
  // For arrays and inline nodes, the key goes on its own line
  if (
    Array.isArray(value) ||
    (typeof value === 'object' && value !== null && 'type' in value && 'slots' in value)
  ) {
    lines.push({
      key: `${lineKeyPrefix}-key`,
      indent,
      elements: [<YAMLKey key="k" text={key} />, <Colon key="c" />],
      treeId,
      slotKey,
    });
    renderSlotValueLines(value, indent + 1, treeId, slotKey, lines, lineKeyPrefix);
  } else {
    // Simple value: key: value on one line
    const valueLine: YAMLLine = {
      key: lineKeyPrefix,
      indent,
      elements: [<YAMLKey key="k" text={key} />, <Colon key="c" />],
      treeId,
      slotKey,
    };
    // Add inline value elements
    const valueLines: YAMLLine[] = [];
    renderSlotValueLines(value, indent, treeId, slotKey, valueLines, `${lineKeyPrefix}-val`);
    if (valueLines.length === 1) {
      valueLine.elements.push(...valueLines[0].elements);
      lines.push(valueLine);
    } else {
      // Multi-line (shouldn't happen for simple values, but safety)
      lines.push(valueLine);
      lines.push(...valueLines);
    }
  }
}

// ============================================================================
// Tree → lines
// ============================================================================

function treeToLines(nodes: TreeGraphNode[], baseIndent: number, lines: YAMLLine[]): void {
  for (const graphNode of nodes) {
    const { node, displayName, relationType, children } = graphNode;

    // Tree header line: type_name:  # f_001 · 85%  (elaborates → parent)
    const commentParts: string[] = [];
    commentParts.push(`# ${node.id}`);
    if (node.confidence != null) {
      commentParts.push(` · ${confidencePercent(node.confidence)}`);
    }
    if (relationType) {
      commentParts.push(`  (${relationType})`);
    }

    lines.push({
      key: `tree-${node.id}`,
      indent: baseIndent,
      elements: [
        <YAMLKey key="k" text={displayName} />,
        <Colon key="c" />,
        <span key="pad" className="flex-1" />,
        <Comment key="comment" text={commentParts.join('')} />,
      ],
      treeId: node.id,
    });

    // Slots
    const slotEntries = Object.entries(node.slots);
    for (const [slotKey, slotValue] of slotEntries) {
      renderSlotEntry(
        slotKey,
        slotValue as SlotValue,
        baseIndent + 1,
        node.id,
        slotKey,
        lines,
        `slot-${node.id}-${slotKey}`
      );
    }

    // Children (nested nodes)
    if (children.length > 0) {
      treeToLines(children, baseIndent + 1, lines);
    }
  }
}

// ============================================================================
// Component
// ============================================================================

export function CommitYAMLDocument({ content, className, onSlotClick }: CommitYAMLDocumentProps) {
  const tree = useMemo(() => buildTreeGraph(content), [content]);

  const lines = useMemo(() => {
    const result: YAMLLine[] = [];
    treeToLines(tree, 0, result);
    return result;
  }, [tree]);

  const handleClick = useCallback(
    (treeId?: string, slotKey?: string) => {
      if (onSlotClick && treeId && slotKey) {
        onSlotClick(treeId, slotKey);
      }
    },
    [onSlotClick]
  );

  if (content.trees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)] italic">No trees in this commit.</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg bg-[var(--surface-panel)] border border-[var(--stroke-divider)] px-6 py-5 font-mono text-[13px] leading-[1.9] text-[var(--text-primary)] ${className ?? ''}`}
    >
      {lines.map((line, i) => {
        // Add spacing before top-level tree headers (indent 0, not first line)
        const isNodeHeader = line.indent === 0 && line.key.startsWith('tree-');
        const needsTopGap = isNodeHeader && i > 0;

        return (
          <div
            key={`${line.key}-${i}`}
            className={`flex items-baseline transition-colors ${
              line.slotKey ? 'cursor-pointer hover:bg-[var(--hover-bg)] rounded-sm px-2 -mx-2' : ''
            } ${needsTopGap ? 'mt-3 pt-3 border-t border-[var(--stroke-divider)]' : ''}`}
            style={{ paddingLeft: `${line.indent * 24}px` }}
            onClick={line.slotKey ? () => handleClick(line.treeId, line.slotKey) : undefined}
          >
            {line.elements}
          </div>
        );
      })}
    </div>
  );
}
