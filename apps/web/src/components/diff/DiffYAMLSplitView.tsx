'use client';

import type { SemanticContent, TreeDiff } from '@t3x-dev/core';
import { useCallback, useRef } from 'react';
import { YAML_COLORS } from './DiffYAMLFormatters';
import {
  getTreeRelations,
  IdenticalCollapseBar,
  RelationAnnotation,
  TreeSeparator,
  useDYTheme,
} from './DiffYAMLShared';
import { type AlignedNode, buildAlignedNodes, buildAlignedSlotKeys } from './DiffYAMLUtils';
import { YAMLLine } from './YAMLLine';
import { SlotValueSpan, treeLineCount, WordDiffSpan, YAMLNodeRenderer } from './YAMLNodeRenderer';

// ── Props ──

interface DiffYAMLSplitViewProps {
  diff: TreeDiff;
  sourceContent?: SemanticContent;
  targetContent?: SemanticContent;
  activeNodeId: string | null;
  onSelectNode: (id: string) => void;
  showIdentical: boolean;
}

// ── Empty placeholder lines ──

function EmptyPlaceholderLines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, lineNumber) => lineNumber + 1).map((lineNumber) => (
        <YAMLLine key={`empty-${lineNumber}`} status="empty">
          {null}
        </YAMLLine>
      ))}
    </>
  );
}

function PlaceholderBlock({ count, label }: { count: number; label: string }) {
  const lineCount = Math.max(1, count);
  const lineNumbers = Array.from({ length: lineCount }, (_, lineNumber) => lineNumber + 1);

  return (
    <>
      {lineNumbers.map((lineNumber) => (
        <YAMLLine key={`placeholder-line-${lineNumber}`} status="empty">
          {lineNumber === 1 ? (
            <span className="inline-flex rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-app)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--text-tertiary)]">
              {label}
            </span>
          ) : null}
        </YAMLLine>
      ))}
    </>
  );
}

// ── Pane content renderer ──

/** Compute how many content lines a tree node takes on a given side */
function computeNodeHeight(af: AlignedNode, side: 'left' | 'right', _diff: TreeDiff): number {
  const node = side === 'left' ? af.leftNode : af.rightNode;
  if (!node) {
    // Placeholder side: count from the other side
    const otherNode = side === 'left' ? af.rightNode : af.leftNode;
    if (!otherNode) return 0;
    const removedSlots = af.slotDiffs?.filter((sd) => sd.type === 'removed').length ?? 0;
    return treeLineCount(otherNode, removedSlots);
  }

  if (af.type === 'modified' && af.leftNode && af.rightNode) {
    // Aligned rendering: 1 header + number of aligned slot keys
    const alignedSlots = buildAlignedSlotKeys(af.leftNode, af.rightNode);
    return 1 + alignedSlots.length;
  }

  const removedSlots = af.slotDiffs?.filter((sd) => sd.type === 'removed').length ?? 0;
  return treeLineCount(node, removedSlots);
}

function computeNodeHeightsMap(
  aligned: AlignedNode[],
  diff: TreeDiff
): Map<string, { left: number; right: number; max: number; relCount: number }> {
  const map = new Map<string, { left: number; right: number; max: number; relCount: number }>();
  for (const af of aligned) {
    const left = computeNodeHeight(af, 'left', diff);
    const right = computeNodeHeight(af, 'right', diff);
    const relCount = getTreeRelations(af.treeId, diff).length;
    // Relations may differ per side in the future, but for now same count
    const leftTotal = left + relCount;
    const rightTotal = right + relCount;
    map.set(af.treeId, {
      left: leftTotal,
      right: rightTotal,
      max: Math.max(leftTotal, rightTotal),
      relCount,
    });
  }
  return map;
}

function PaneContent({
  aligned,
  side,
  diff,
  activeNodeId,
  onSelectNode,
  showIdentical,
  heightsMap,
}: {
  aligned: AlignedNode[];
  side: 'left' | 'right';
  diff: TreeDiff;
  activeNodeId: string | null;
  onSelectNode: (id: string) => void;
  showIdentical: boolean;
  heightsMap: Map<string, { left: number; right: number; max: number; relCount: number }>;
}) {
  let lineNum = 1;

  // Separate identical trees for potential collapsing
  const nonIdentical = aligned.filter((a) => a.type !== 'identical');
  const identicalNodes = aligned.filter((a) => a.type === 'identical');

  const renderNode = (af: AlignedNode) => {
    const node = side === 'left' ? af.leftNode : af.rightNode;
    const hasNode = !!node;

    // For added nodes, left pane shows placeholder; for removed, right pane shows placeholder
    const isPlaceholder =
      (af.type === 'added' && side === 'left') || (af.type === 'removed' && side === 'right');

    // Calculate removed slot count for line counting
    const removedSlotCount =
      af.type === 'modified' && af.slotDiffs
        ? af.slotDiffs.filter((sd) => sd.type === 'removed').length
        : 0;

    // Get the tree to count lines from (the "real" side)
    const realNode =
      af.type === 'added' ? af.rightNode : af.type === 'removed' ? af.leftNode : node;

    const placeholderCount = realNode ? treeLineCount(realNode, removedSlotCount) : 0;

    // Gather relation annotations for this tree
    const relations = getTreeRelations(af.treeId, diff);

    // For placeholders, we also need to render empty lines for relation annotations
    const relationCount = relations.length;

    const startLine = lineNum;

    // Content rendering
    let content: React.ReactNode;
    if (isPlaceholder) {
      content = (
        <PlaceholderBlock
          count={placeholderCount}
          label={side === 'left' ? 'Not present in base' : 'Not present in target'}
        />
      );
    } else if (af.type === 'modified' && af.leftNode && af.rightNode) {
      // ── Modified tree: aligned slot-by-slot rendering ──
      const slotDiffMap = new Map((af.slotDiffs ?? []).map((sd) => [sd.key, sd]));
      const alignedSlots = buildAlignedSlotKeys(af.leftNode, af.rightNode);

      const lines: React.ReactNode[] = [];
      // Tree type header
      lines.push(
        <YAMLLine key="header" lineNumber={lineNum++} status="unchanged">
          <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{node!.key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>:</span>
        </YAMLLine>
      );

      for (const as of alignedSlots) {
        const sd = slotDiffMap.get(as.key);
        const inThisSide = side === 'left' ? as.inLeft : as.inRight;

        if (!inThisSide) {
          lines.push(
            <YAMLLine key={`empty-${as.key}`} lineNumber={undefined} status="empty">
              {null}
            </YAMLLine>
          );
          continue;
        }

        const value = side === 'left' ? af.leftNode.slots[as.key] : af.rightNode.slots[as.key];

        // Line status: changed slots use removed (left) / added (right) — no yellow
        let lineStatus: 'added' | 'removed' | 'modified' | 'unchanged' = 'unchanged';
        if (sd) {
          if (sd.type === 'added') lineStatus = 'added';
          else if (sd.type === 'removed') lineStatus = 'removed';
          else lineStatus = side === 'left' ? 'removed' : 'added';
        }

        // Value rendering: highlight the changed VALUE, not the line
        let valueNode: React.ReactNode;
        if (sd?.wordDiff) {
          valueNode = <WordDiffSpan wordDiff={sd.wordDiff} />;
        } else if (sd?.type === 'changed') {
          // Left side = old value (red highlight), Right side = new value (green highlight)
          const hlClass =
            side === 'left'
              ? 'bg-[var(--dy-removed-word)] rounded-sm px-[3px] py-[1px] font-medium'
              : 'bg-[var(--dy-added-word)] rounded-sm px-[3px] py-[1px] font-medium';
          valueNode = (
            <span className={hlClass}>
              <SlotValueSpan value={value} />
            </span>
          );
        } else {
          valueNode = <SlotValueSpan value={value} />;
        }

        lines.push(
          <YAMLLine key={`slot-${as.key}`} lineNumber={lineNum++} status={lineStatus}>
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{as.key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {valueNode}
          </YAMLLine>
        );
      }

      content = lines;
    } else if (hasNode) {
      content = (
        <YAMLNodeRenderer
          node={node!}
          frameStatus={af.type}
          slotDiffs={af.type === 'modified' ? af.slotDiffs : undefined}
          startLine={startLine}
        />
      );
      lineNum += treeLineCount(node!, removedSlotCount);
    } else {
      content = null;
    }

    return (
      <div key={`${side}-${af.treeId}`}>
        <TreeSeparator
          aligned={af}
          onClick={() => onSelectNode(af.treeId)}
          isActive={activeNodeId === af.treeId}
        />
        {content}
        {/* Relation annotations */}
        {isPlaceholder ? (
          <EmptyPlaceholderLines count={relationCount} />
        ) : (
          relations.map((rel, i) => <RelationAnnotation key={`${af.treeId}-rel-${i}`} rel={rel} />)
        )}
        {/* Padding to align with the other side */}
        {(() => {
          const h = heightsMap.get(af.treeId);
          if (!h) return null;
          const myHeight = side === 'left' ? h.left : h.right;
          const padCount = h.max - myHeight;
          return padCount > 0 ? <EmptyPlaceholderLines count={padCount} /> : null;
        })()}
      </div>
    );
  };

  return (
    <>
      {nonIdentical.map(renderNode)}
      {showIdentical ? (
        identicalNodes.map(renderNode)
      ) : (
        <IdenticalCollapseBar
          nodes={identicalNodes}
          onClick={() => {
            // If there are identical nodes, select the first one to trigger showing
            if (identicalNodes.length > 0) {
              onSelectNode(identicalNodes[0].treeId);
            }
          }}
        />
      )}
    </>
  );
}

// ── Main component ──

export function DiffYAMLSplitView({
  diff,
  sourceContent,
  targetContent,
  activeNodeId,
  onSelectNode,
  showIdentical,
}: DiffYAMLSplitViewProps) {
  const dyTheme = useDYTheme();
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    requestAnimationFrame(() => {
      const from = source === 'left' ? leftRef.current : rightRef.current;
      const to = source === 'left' ? rightRef.current : leftRef.current;
      if (from && to) {
        to.scrollTop = from.scrollTop;
      }
      syncingRef.current = false;
    });
  }, []);

  const aligned = buildAlignedNodes(diff, sourceContent, targetContent);
  const heightsMap = computeNodeHeightsMap(aligned, diff);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--dy-surface)]"
      style={dyTheme}
    >
      <div className="grid h-8 shrink-0 grid-cols-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] font-mono text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
        <div className="flex items-center border-r border-[var(--stroke-divider)] px-3">Base</div>
        <div className="flex items-center px-3">Target</div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left pane (base) */}
        <div
          ref={leftRef}
          className="min-w-0 flex-1 overflow-y-auto"
          style={{ borderRight: '1px solid var(--stroke-divider)' }}
          onScroll={() => handleScroll('left')}
        >
          <PaneContent
            aligned={aligned}
            side="left"
            diff={diff}
            activeNodeId={activeNodeId}
            onSelectNode={onSelectNode}
            showIdentical={showIdentical}
            heightsMap={heightsMap}
          />
        </div>

        {/* Right pane (target) */}
        <div
          ref={rightRef}
          className="min-w-0 flex-1 overflow-y-auto"
          onScroll={() => handleScroll('right')}
        >
          <PaneContent
            aligned={aligned}
            side="right"
            diff={diff}
            activeNodeId={activeNodeId}
            onSelectNode={onSelectNode}
            showIdentical={showIdentical}
            heightsMap={heightsMap}
          />
        </div>
      </div>
    </div>
  );
}
