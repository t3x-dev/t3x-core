'use client';

import type { SemanticContent, SlotDiff, TreeDiff } from '@t3x-dev/core';
import { cn } from '@/utils/cn';
import { formatSlotValue, YAML_COLORS } from './DiffYAMLFormatters';
import {
  getTreeRelations,
  IdenticalCollapseBar,
  RelationAnnotation,
  TreeSeparator,
  useDYTheme,
} from './DiffYAMLShared';
import { type AlignedNode, buildAlignedNodes } from './DiffYAMLUtils';
import { SlotValueSpan, WordDiffSpan } from './YAMLNodeRenderer';

// ── Props ──

interface DiffYAMLUnifiedViewProps {
  diff: TreeDiff;
  sourceContent?: SemanticContent;
  targetContent?: SemanticContent;
  activeNodeId: string | null;
  onSelectNode: (id: string) => void;
  showIdentical: boolean;
}

// ── Unified padding constant ──

const UNIFIED_PADDING = 'calc(72px + 4px + 10px)';

// ── Unified line with dual gutters ──

type UnifiedLineStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'empty';

function UnifiedLine({
  leftNum,
  rightNum,
  status,
  children,
}: {
  leftNum?: number;
  rightNum?: number;
  status: UnifiedLineStatus;
  children: React.ReactNode;
}) {
  const isEmpty = status === 'empty';

  return (
    <div
      className={cn(
        'diff-yaml-line flex items-stretch font-mono text-[12px] leading-[22px] text-[var(--dy-text-secondary)]',
        status === 'unchanged' && 'opacity-90 hover:opacity-100',
        isEmpty && 'diff-yaml-empty'
      )}
    >
      {/* Left gutter (base line number) */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-70',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-70',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-65',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-65'
        )}
      >
        {isEmpty ? '' : leftNum}
      </div>

      {/* Right gutter (target line number) */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-70',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-70',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-65',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-65'
        )}
      >
        {isEmpty ? '' : rightNum}
      </div>

      {/* Marker strip */}
      <div
        className={cn(
          'w-1 min-w-1 shrink-0',
          status === 'added' && 'bg-[var(--dy-added-accent)]',
          status === 'removed' && 'bg-[var(--dy-removed-accent)]',
          status === 'modified' && 'bg-[var(--dy-modified-accent)]'
        )}
      />

      {/* Content */}
      <div
        className={cn(
          'flex-1 px-[10px] whitespace-pre overflow-hidden text-ellipsis',
          status === 'added' && 'bg-[var(--dy-added-bg)] text-[var(--diff-added-text)]',
          status === 'removed' && 'bg-[var(--dy-removed-bg)] text-[var(--diff-removed-text)]',
          status === 'modified' && 'bg-[var(--dy-modified-bg)] text-[var(--diff-modified-text)]'
        )}
        style={
          isEmpty
            ? {
                background: 'var(--surface-app)',
              }
            : undefined
        }
      >
        {isEmpty ? null : children}
      </div>
    </div>
  );
}

// ── Unified tree renderer ──

function UnifiedNodeContent({
  aligned,
  diff,
  leftLineRef,
  rightLineRef,
}: {
  aligned: AlignedNode;
  diff: TreeDiff;
  leftLineRef: { current: number };
  rightLineRef: { current: number };
}) {
  const lines: React.ReactNode[] = [];

  if (aligned.type === 'added') {
    // All lines green, right gutter only
    const node = aligned.rightNode!;
    lines.push(
      <UnifiedLine key="header" rightNum={rightLineRef.current++} status="added">
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{node.key}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>
    );
    for (const [key, value] of Object.entries(node.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} rightNum={rightLineRef.current++} status="added">
          {'    '}
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <SlotValueSpan value={value} />
        </UnifiedLine>
      );
    }
  } else if (aligned.type === 'removed') {
    // All lines red with strikethrough, left gutter only
    const node = aligned.leftNode!;
    lines.push(
      <UnifiedLine key="header" leftNum={leftLineRef.current++} status="removed">
        <span className="line-through" style={{ color: YAML_COLORS.type, fontWeight: 600 }}>
          {node.key}
        </span>
        <span className="line-through" style={{ color: YAML_COLORS.bracket }}>
          :
        </span>
      </UnifiedLine>
    );
    for (const [key, value] of Object.entries(node.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} leftNum={leftLineRef.current++} status="removed">
          {'    '}
          <span className="line-through opacity-60" style={{ color: YAML_COLORS.key }}>
            {key}
          </span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            <SlotValueSpan value={value} />
          </span>
        </UnifiedLine>
      );
    }
  } else if (aligned.type === 'identical') {
    // All unchanged, both gutters
    const node = aligned.leftNode!;
    lines.push(
      <UnifiedLine
        key="header"
        leftNum={leftLineRef.current++}
        rightNum={rightLineRef.current++}
        status="unchanged"
      >
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{node.key}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>
    );
    for (const [key, value] of Object.entries(node.slots)) {
      lines.push(
        <UnifiedLine
          key={`slot-${key}`}
          leftNum={leftLineRef.current++}
          rightNum={rightLineRef.current++}
          status="unchanged"
        >
          {'    '}
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <SlotValueSpan value={value} />
        </UnifiedLine>
      );
    }
  } else {
    // Modified tree: show per-slot diffs
    const targetNode = aligned.rightNode!;
    const slotDiffMap = new Map<string, SlotDiff>();
    if (aligned.slotDiffs) {
      for (const sd of aligned.slotDiffs) slotDiffMap.set(sd.key, sd);
    }

    // Tree type header — unchanged (both trees have same type usually)
    lines.push(
      <UnifiedLine
        key="header"
        leftNum={leftLineRef.current++}
        rightNum={rightLineRef.current++}
        status="unchanged"
      >
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{targetNode.key}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>
    );

    // Slots present in target (may be unchanged, modified, or added)
    for (const [key, value] of Object.entries(targetNode.slots)) {
      const sd = slotDiffMap.get(key);

      if (!sd) {
        // Unchanged slot: single line, both gutters
        lines.push(
          <UnifiedLine
            key={`slot-${key}`}
            leftNum={leftLineRef.current++}
            rightNum={rightLineRef.current++}
            status="unchanged"
          >
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <SlotValueSpan value={value} />
          </UnifiedLine>
        );
      } else if (sd.type === 'added') {
        // Added slot: right gutter only, green
        lines.push(
          <UnifiedLine key={`slot-add-${key}`} rightNum={rightLineRef.current++} status="added">
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <SlotValueSpan value={value} />
          </UnifiedLine>
        );
      } else if (sd.type === 'changed') {
        // Modified slot: removed line (left gutter) then added line (right gutter)
        lines.push(
          <UnifiedLine key={`slot-rem-${key}`} leftNum={leftLineRef.current++} status="removed">
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff.filter((w) => w.type !== 'added')} />
            ) : (
              <span className="line-through opacity-60">
                {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
              </span>
            )}
          </UnifiedLine>
        );
        lines.push(
          <UnifiedLine key={`slot-add-${key}`} rightNum={rightLineRef.current++} status="added">
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff.filter((w) => w.type !== 'removed')} />
            ) : (
              <SlotValueSpan value={value} />
            )}
          </UnifiedLine>
        );
      }
    }

    // Removed slots (only in source, not in target)
    const removedSlots = aligned.slotDiffs?.filter((sd) => sd.type === 'removed') ?? [];
    for (const sd of removedSlots) {
      lines.push(
        <UnifiedLine key={`slot-del-${sd.key}`} leftNum={leftLineRef.current++} status="removed">
          {'    '}
          <span className="line-through opacity-60" style={{ color: YAML_COLORS.key }}>
            {sd.key}
          </span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
          </span>
        </UnifiedLine>
      );
    }
  }

  // Relation annotations
  const relations = getTreeRelations(aligned.treeId, diff);

  return (
    <>
      {lines}
      {relations.map((rel, i) => (
        <RelationAnnotation
          key={`${aligned.treeId}-rel-${i}`}
          rel={rel}
          paddingLeft={UNIFIED_PADDING}
        />
      ))}
    </>
  );
}

// ── Main component ──

export function DiffYAMLUnifiedView({
  diff,
  sourceContent,
  targetContent,
  activeNodeId,
  onSelectNode,
  showIdentical,
}: DiffYAMLUnifiedViewProps) {
  const dyTheme = useDYTheme();
  const aligned = buildAlignedNodes(diff, sourceContent, targetContent);
  const nonIdentical = aligned.filter((a) => a.type !== 'identical');
  const identicalNodes = aligned.filter((a) => a.type === 'identical');

  // Mutable line counters passed by ref
  const leftLineRef = { current: 1 };
  const rightLineRef = { current: 1 };

  const renderNode = (af: AlignedNode) => (
    <div key={`unified-${af.treeId}`}>
      <TreeSeparator
        aligned={af}
        onClick={() => onSelectNode(af.treeId)}
        isActive={activeNodeId === af.treeId}
        paddingLeft={UNIFIED_PADDING}
      />
      <UnifiedNodeContent
        aligned={af}
        diff={diff}
        leftLineRef={leftLineRef}
        rightLineRef={rightLineRef}
      />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--dy-surface)]" style={dyTheme}>
      {nonIdentical.map(renderNode)}
      {showIdentical ? (
        identicalNodes.map(renderNode)
      ) : (
        <IdenticalCollapseBar
          nodes={identicalNodes}
          paddingLeft={UNIFIED_PADDING}
          onClick={() => {
            if (identicalNodes.length > 0) {
              onSelectNode(identicalNodes[0].treeId);
            }
          }}
        />
      )}
    </div>
  );
}
