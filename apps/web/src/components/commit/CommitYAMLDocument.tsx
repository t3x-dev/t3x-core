'use client';

/**
 * CommitYAMLDocument — renders all frames from a commit as one continuous,
 * nested YAML document where relations define the hierarchy.
 *
 * Frames related via elaborates/conditions/depends/follows are nested
 * under their parent frame. Root frames (not a child of anything) appear
 * at the top level.
 */

import type { SemanticContent, SlotValue } from '@t3x-dev/core';
import { useCallback, useMemo } from 'react';
import { type Frame, treesToFrames } from '@/lib/treeCompat';

// ============================================================================
// Props
// ============================================================================

export interface CommitYAMLDocumentProps {
  content: SemanticContent;
  className?: string;
  onSlotClick?: (frameId: string, slotKey: string) => void;
}

// ============================================================================
// Tree-building helpers
// ============================================================================

interface FrameTreeNode {
  frame: Frame;
  displayName: string;
  relationType?: string;
  children: FrameTreeNode[];
}

/** Build display names with _2, _3 suffixes for duplicate types (scoped per parent). */
function buildDisplayNames(frames: Frame[]): Map<string, string> {
  const counts = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const frame of frames) {
    const count = (counts.get(frame.type) ?? 0) + 1;
    counts.set(frame.type, count);
    const displayName = count === 1 ? frame.type : `${frame.type}_${count}`;
    nameMap.set(frame.id, displayName);
  }
  return nameMap;
}

function buildFrameTree(content: SemanticContent): FrameTreeNode[] {
  const frames = treesToFrames(content.trees);
  const frameMap = new Map<string, Frame>();
  for (const frame of frames) {
    frameMap.set(frame.id, frame);
  }

  // children map: parentId → [{ childId, relationType }]
  const childrenMap = new Map<string, Array<{ childId: string; relationType: string }>>();
  const childIds = new Set<string>();

  for (const rel of content.relations) {
    // relation: { from: A, to: B } means A elaborates/conditions/depends/follows B
    // so A is a child of B
    if (!frameMap.has(rel.from) || !frameMap.has(rel.to)) continue;
    childIds.add(rel.from);
    const existing = childrenMap.get(rel.to) ?? [];
    existing.push({ childId: rel.from, relationType: rel.type });
    childrenMap.set(rel.to, existing);
  }

  // Root frames: not a child of anyone
  const rootFrames = frames.filter((f) => !childIds.has(f.id));

  // Build display name map across all frames
  const nameMap = buildDisplayNames(frames);

  // Recursive builder (with visited set to avoid cycles)
  function buildNode(frame: Frame, relationType?: string, visited?: Set<string>): FrameTreeNode {
    const vis = visited ?? new Set<string>();
    vis.add(frame.id);

    const children: FrameTreeNode[] = [];
    const childEntries = childrenMap.get(frame.id) ?? [];
    for (const { childId, relationType: childRelType } of childEntries) {
      if (vis.has(childId)) continue;
      const childFrame = frameMap.get(childId);
      if (childFrame) {
        children.push(buildNode(childFrame, childRelType, new Set(vis)));
      }
    }

    return {
      frame,
      displayName: nameMap.get(frame.id) ?? frame.type,
      relationType,
      children,
    };
  }

  return rootFrames.map((f) => buildNode(f));
}

// ============================================================================
// Line model — each visual line gets its own element
// ============================================================================

interface YAMLLine {
  key: string;
  indent: number;
  elements: React.ReactNode[];
  frameId?: string;
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
  return <span style={{ color: '#4b5563' }}>{text}</span>;
}

function YAMLKey({ text }: { text: string }) {
  return <span style={{ color: '#7aa2f7' }}>{text}</span>;
}

function Colon() {
  return <span style={{ color: '#89ddff' }}>:&nbsp;</span>;
}

function StringValue({ text }: { text: string }) {
  return <span style={{ color: '#9ece6a' }}>"{text}"</span>;
}

function NumberValue({ value }: { value: number }) {
  return <span style={{ color: '#ff9e64' }}>{value}</span>;
}

function RefValue({ ref: refId }: { ref: string }) {
  return <span style={{ color: '#bb9af7' }}>*{refId}</span>;
}

function ArrayDash() {
  return <span style={{ color: '#89ddff' }}>- </span>;
}

// ============================================================================
// Slot value → lines
// ============================================================================

function renderSlotValueLines(
  value: SlotValue,
  indent: number,
  frameId: string,
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
      frameId,
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
      frameId,
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
        frameId,
        slotKey,
      });
      return;
    }
    if ('type' in value && 'slots' in value) {
      const inlineFrame = value as { type: string; slots: Record<string, SlotValue> };
      // Render inline frame as nested keys
      lines.push({
        key: lineKeyPrefix,
        indent,
        elements: [
          ...(isArrayItem ? [<ArrayDash key="dash" />] : []),
          <YAMLKey key="k" text={inlineFrame.type} />,
          <Colon key="c" />,
        ],
        frameId,
        slotKey,
      });
      for (const [k, v] of Object.entries(inlineFrame.slots)) {
        renderSlotEntry(k, v, indent + 1, frameId, slotKey, lines, `${lineKeyPrefix}-if-${k}`);
      }
      return;
    }
  }

  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    for (let i = 0; i < arr.length; i++) {
      renderSlotValueLines(arr[i], indent, frameId, slotKey, lines, `${lineKeyPrefix}-${i}`, true);
    }
    return;
  }

  // Fallback
  lines.push({
    key: lineKeyPrefix,
    indent,
    elements: [
      <span key="v" style={{ color: '#89ddff' }}>
        {JSON.stringify(value)}
      </span>,
    ],
    frameId,
    slotKey,
  });
}

function renderSlotEntry(
  key: string,
  value: SlotValue,
  indent: number,
  frameId: string,
  slotKey: string,
  lines: YAMLLine[],
  lineKeyPrefix: string
): void {
  // For arrays and inline frames, the key goes on its own line
  if (
    Array.isArray(value) ||
    (typeof value === 'object' && value !== null && 'type' in value && 'slots' in value)
  ) {
    lines.push({
      key: `${lineKeyPrefix}-key`,
      indent,
      elements: [<YAMLKey key="k" text={key} />, <Colon key="c" />],
      frameId,
      slotKey,
    });
    renderSlotValueLines(value, indent + 1, frameId, slotKey, lines, lineKeyPrefix);
  } else {
    // Simple value: key: value on one line
    const valueLine: YAMLLine = {
      key: lineKeyPrefix,
      indent,
      elements: [<YAMLKey key="k" text={key} />, <Colon key="c" />],
      frameId,
      slotKey,
    };
    // Add inline value elements
    const valueLines: YAMLLine[] = [];
    renderSlotValueLines(value, indent, frameId, slotKey, valueLines, `${lineKeyPrefix}-val`);
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

function treeToLines(nodes: FrameTreeNode[], baseIndent: number, lines: YAMLLine[]): void {
  for (const node of nodes) {
    const { frame, displayName, relationType, children } = node;

    // Frame header line: type_name:  # f_001 · 85%  (elaborates → parent)
    const commentParts: string[] = [];
    commentParts.push(`# ${frame.id}`);
    if (frame.confidence != null) {
      commentParts.push(` · ${confidencePercent(frame.confidence)}`);
    }
    if (relationType) {
      commentParts.push(`  (${relationType})`);
    }

    lines.push({
      key: `frame-${frame.id}`,
      indent: baseIndent,
      elements: [
        <YAMLKey key="k" text={displayName} />,
        <Colon key="c" />,
        <span key="pad" className="flex-1" />,
        <Comment key="comment" text={commentParts.join('')} />,
      ],
      frameId: frame.id,
    });

    // Slots
    const slotEntries = Object.entries(frame.slots);
    for (const [slotKey, slotValue] of slotEntries) {
      renderSlotEntry(
        slotKey,
        slotValue,
        baseIndent + 1,
        frame.id,
        slotKey,
        lines,
        `slot-${frame.id}-${slotKey}`
      );
    }

    // Children (nested frames)
    if (children.length > 0) {
      treeToLines(children, baseIndent + 1, lines);
    }
  }
}

// ============================================================================
// Component
// ============================================================================

export function CommitYAMLDocument({ content, className, onSlotClick }: CommitYAMLDocumentProps) {
  const tree = useMemo(() => buildFrameTree(content), [content]);

  const lines = useMemo(() => {
    const result: YAMLLine[] = [];
    treeToLines(tree, 0, result);
    return result;
  }, [tree]);

  const handleClick = useCallback(
    (frameId?: string, slotKey?: string) => {
      if (onSlotClick && frameId && slotKey) {
        onSlotClick(frameId, slotKey);
      }
    },
    [onSlotClick]
  );

  if (content.trees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)] italic">No frames in this commit.</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg bg-[var(--surface-code,#0d1117)] px-6 py-5 font-mono text-[13px] leading-[1.9] ${className ?? ''}`}
    >
      {lines.map((line, i) => {
        // Add spacing before top-level frame headers (indent 0, not first line)
        const isFrameHeader = line.indent === 0 && line.key.startsWith('frame-');
        const needsTopGap = isFrameHeader && i > 0;

        return (
          <div
            key={line.key}
            className={`flex items-baseline transition-colors ${
              line.slotKey ? 'cursor-pointer hover:bg-white/5 rounded-sm px-2 -mx-2' : ''
            } ${needsTopGap ? 'mt-3 pt-3 border-t border-white/5' : ''}`}
            style={{ paddingLeft: `${line.indent * 24}px` }}
            onClick={line.slotKey ? () => handleClick(line.frameId, line.slotKey) : undefined}
          >
            {line.elements}
          </div>
        );
      })}
    </div>
  );
}
