'use client';

import type { FrameDiff, Frame, Relation, SlotDiff, SlotValue } from '@t3x-dev/core';
import { cn } from '@/lib/utils';
import { buildAlignedFrames, type AlignedFrame } from './DiffYAMLUtils';
import { YAML_COLORS, formatSlotValue } from './DiffYAMLFormatters';
import { frameLineCount } from './YAMLFrameRenderer';

// ── Props ──

interface DiffYAMLUnifiedViewProps {
  diff: FrameDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
}

// ── Relation helpers (same as split view) ──

interface FrameRelation {
  relation: Relation;
  status: 'added' | 'removed' | 'kept';
  otherId: string;
  direction: 'in' | 'out';
}

const REL_COLORS: Record<string, string> = {
  causes: '#ff9e64',
  conditions: '#e3b341',
  contrasts: '#f85149',
  elaborates: '#58a6ff',
  follows: '#7d8590',
  depends: '#d2a8ff',
};

function relColor(type: string): string {
  return REL_COLORS[type] ?? '#7d8590';
}

function getFrameRelations(frameId: string, diff: FrameDiff): FrameRelation[] {
  const results: FrameRelation[] = [];
  const seen = new Set<string>();

  for (const r of diff.relationsAdded) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === frameId) {
      results.push({ relation: r, status: 'added', otherId: r.to, direction: 'out' });
    } else if (r.to === frameId) {
      results.push({ relation: r, status: 'added', otherId: r.from, direction: 'in' });
    }
  }

  for (const r of diff.relationsRemoved) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === frameId) {
      results.push({ relation: r, status: 'removed', otherId: r.to, direction: 'out' });
    } else if (r.to === frameId) {
      results.push({ relation: r, status: 'removed', otherId: r.from, direction: 'in' });
    }
  }

  return results;
}

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
        'diff-yaml-line flex items-stretch font-mono text-[11.5px] leading-[21px]',
        status === 'unchanged' && 'opacity-[0.45] hover:opacity-80',
        isEmpty && 'diff-yaml-empty',
      )}
    >
      {/* Left gutter (base line number) */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-50',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-50',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-40',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-50',
        )}
      >
        {isEmpty ? '' : leftNum}
      </div>

      {/* Right gutter (target line number) */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-50',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-50',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-40',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-50',
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
          status === 'modified' && 'bg-[var(--dy-modified-accent)]',
        )}
      />

      {/* Content */}
      <div
        className={cn(
          'flex-1 px-[10px] whitespace-pre overflow-hidden text-ellipsis',
          status === 'added' && 'bg-[var(--dy-added-bg)]',
          status === 'removed' && 'bg-[var(--dy-removed-bg)]',
          status === 'modified' && 'bg-[var(--dy-modified-bg)]',
        )}
        style={isEmpty ? {
          background: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.015) 4px, rgba(255,255,255,0.015) 5px)',
        } : undefined}
      >
        {isEmpty ? null : children}
      </div>
    </div>
  );
}

// ── Slot value rendering (inline, same as YAMLFrameRenderer) ──

function SlotValueSpan({ value }: { value: SlotValue }) {
  if (typeof value === 'string') {
    return <span style={{ color: YAML_COLORS.string }}>&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ color: YAML_COLORS.number }}>{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: YAML_COLORS.number }}>{String(value)}</span>;
  }
  if (value !== null && typeof value === 'object' && 'ref' in value) {
    return <span style={{ color: YAML_COLORS.ref }}>*{(value as { ref: string }).ref}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span>
        <span style={{ color: YAML_COLORS.bracket }}>[</span>
        {(value as SlotValue[]).map((item, i) => (
          <span key={i}>
            {i > 0 && <span style={{ color: YAML_COLORS.bracket }}>, </span>}
            <SlotValueSpan value={item} />
          </span>
        ))}
        <span style={{ color: YAML_COLORS.bracket }}>]</span>
      </span>
    );
  }
  return <span style={{ color: YAML_COLORS.bracket }}>{JSON.stringify(value)}</span>;
}

function WordDiffSpan({ wordDiff }: { wordDiff: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }> }) {
  return (
    <>
      {wordDiff.map((seg, i) => {
        if (seg.type === 'added') {
          return <span key={i} className="bg-[var(--dy-added-word)] text-white rounded-sm px-[2px] font-medium">{seg.text}</span>;
        }
        if (seg.type === 'removed') {
          return <span key={i} className="bg-[var(--dy-removed-word)] text-white rounded-sm px-[2px] line-through" style={{ textDecorationColor: 'rgba(255,255,255,0.4)' }}>{seg.text}</span>;
        }
        return <span key={i} style={{ color: YAML_COLORS.string }}>{seg.text}</span>;
      })}
    </>
  );
}

// ── Frame separator (reused pattern) ──

function FrameSeparator({
  aligned,
  onClick,
  isActive,
}: {
  aligned: AlignedFrame;
  onClick: () => void;
  isActive: boolean;
}) {
  const statusLabel = aligned.type === 'modified' ? '~mod'
    : aligned.type === 'added' ? '+new'
    : aligned.type === 'removed' ? '-del'
    : '=';

  const statusClass = aligned.type === 'modified' ? 'text-[var(--dy-modified-accent)]'
    : aligned.type === 'added' ? 'text-[var(--dy-added-accent)]'
    : aligned.type === 'removed' ? 'text-[var(--dy-removed-accent)]'
    : 'text-[var(--text-tertiary)]';

  const frame = aligned.leftFrame ?? aligned.rightFrame;
  const frameType = frame?.type ?? aligned.frameId;

  return (
    <div
      id={`diff-frame-${aligned.frameId}`}
      className={cn(
        'flex items-center gap-[5px] text-[9px] font-medium uppercase tracking-[0.6px] select-none cursor-pointer',
        'pt-[5px] pb-[2px] opacity-60 hover:opacity-100',
        'text-[var(--text-tertiary)]',
        isActive && 'opacity-100 bg-[var(--hover-bg)]',
      )}
      style={{ paddingLeft: 'calc(72px + 4px + 10px)' }}
      onClick={onClick}
    >
      <span className={cn('text-[8px] font-semibold tracking-[0.3px]', statusClass)}>
        {statusLabel}
      </span>
      <span>{frameType}</span>
      <span className="font-mono opacity-40 text-[8px]">{aligned.frameId}</span>
      <span className="flex-1 h-px bg-[var(--stroke-divider)] opacity-50" />
    </div>
  );
}

// ── Relation annotation ──

function RelationAnnotation({ rel }: { rel: FrameRelation }) {
  const statusClass = rel.status === 'added' ? 'text-[var(--dy-added-accent)]'
    : rel.status === 'removed' ? 'text-[var(--dy-removed-accent)] line-through opacity-50'
    : 'text-[var(--text-tertiary)] opacity-40';

  const arrow = rel.direction === 'in' ? '\u2190' : '\u2192';

  return (
    <div
      className={cn(
        'flex items-center gap-1 font-mono text-[10px] min-h-[18px]',
        statusClass,
      )}
      style={{ paddingLeft: 'calc(72px + 4px + 10px)', paddingRight: '10px' }}
    >
      <span className="inline-flex items-center gap-[3px] px-1 rounded-sm text-[9px]">
        <span
          className="w-1 h-1 rounded-full shrink-0"
          style={{ background: relColor(rel.relation.type) }}
        />
      </span>
      <span className="opacity-40">{arrow}</span>
      <span>{rel.otherId}</span>
      <span className="opacity-30 text-[9px]">{rel.relation.type}</span>
    </div>
  );
}

// ── Identical collapse bar ──

function IdenticalCollapseBar({
  frames,
  onClick,
}: {
  frames: AlignedFrame[];
  onClick: () => void;
}) {
  if (frames.length === 0) return null;
  const names = frames
    .map(f => (f.leftFrame ?? f.rightFrame)?.type ?? f.frameId)
    .join(', ');
  return (
    <div
      className="flex items-center gap-[5px] font-mono text-[10px] text-[var(--text-tertiary)] cursor-pointer select-none opacity-50 hover:opacity-80 hover:bg-[var(--hover-bg)]"
      style={{ padding: '3px 10px 3px calc(72px + 4px + 10px)' }}
      onClick={onClick}
    >
      <span>{'\u25B6'}</span>
      <span>{frames.length} identical frame{frames.length > 1 ? 's' : ''}</span>
      <span className="opacity-50">({names})</span>
    </div>
  );
}

// ── Unified frame renderer ──

function UnifiedFrameContent({
  aligned,
  diff,
  leftLineRef,
  rightLineRef,
}: {
  aligned: AlignedFrame;
  diff: FrameDiff;
  leftLineRef: { current: number };
  rightLineRef: { current: number };
}) {
  const lines: React.ReactNode[] = [];

  if (aligned.type === 'added') {
    // All lines green, right gutter only
    const frame = aligned.rightFrame!;
    lines.push(
      <UnifiedLine key="header" rightNum={rightLineRef.current++} status="added">
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>,
    );
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} rightNum={rightLineRef.current++} status="added">
          {'  '}
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <SlotValueSpan value={value} />
        </UnifiedLine>,
      );
    }
  } else if (aligned.type === 'removed') {
    // All lines red with strikethrough, left gutter only
    const frame = aligned.leftFrame!;
    lines.push(
      <UnifiedLine key="header" leftNum={leftLineRef.current++} status="removed">
        <span className="line-through" style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
        <span className="line-through" style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>,
    );
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} leftNum={leftLineRef.current++} status="removed">
          {'  '}
          <span className="line-through opacity-60" style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            <SlotValueSpan value={value} />
          </span>
        </UnifiedLine>,
      );
    }
  } else if (aligned.type === 'identical') {
    // All unchanged, both gutters
    const frame = aligned.leftFrame!;
    lines.push(
      <UnifiedLine key="header" leftNum={leftLineRef.current++} rightNum={rightLineRef.current++} status="unchanged">
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>,
    );
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} leftNum={leftLineRef.current++} rightNum={rightLineRef.current++} status="unchanged">
          {'  '}
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <SlotValueSpan value={value} />
        </UnifiedLine>,
      );
    }
  } else {
    // Modified frame: show per-slot diffs
    const sourceFrame = aligned.leftFrame!;
    const targetFrame = aligned.rightFrame!;
    const slotDiffMap = new Map<string, SlotDiff>();
    if (aligned.slotDiffs) {
      for (const sd of aligned.slotDiffs) slotDiffMap.set(sd.key, sd);
    }

    // Frame type header — unchanged (both frames have same type usually)
    lines.push(
      <UnifiedLine key="header" leftNum={leftLineRef.current++} rightNum={rightLineRef.current++} status="unchanged">
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{targetFrame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>,
    );

    // Slots present in target (may be unchanged, modified, or added)
    for (const [key, value] of Object.entries(targetFrame.slots)) {
      const sd = slotDiffMap.get(key);

      if (!sd) {
        // Unchanged slot: single line, both gutters
        lines.push(
          <UnifiedLine key={`slot-${key}`} leftNum={leftLineRef.current++} rightNum={rightLineRef.current++} status="unchanged">
            {'  '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <SlotValueSpan value={value} />
          </UnifiedLine>,
        );
      } else if (sd.type === 'added') {
        // Added slot: right gutter only, green
        lines.push(
          <UnifiedLine key={`slot-add-${key}`} rightNum={rightLineRef.current++} status="added">
            {'  '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <SlotValueSpan value={value} />
          </UnifiedLine>,
        );
      } else if (sd.type === 'changed') {
        // Modified slot: removed line (left gutter) then added line (right gutter)
        lines.push(
          <UnifiedLine key={`slot-rem-${key}`} leftNum={leftLineRef.current++} status="removed">
            {'  '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff.filter(w => w.type !== 'added')} />
            ) : (
              <span className="line-through opacity-60">
                {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
              </span>
            )}
          </UnifiedLine>,
        );
        lines.push(
          <UnifiedLine key={`slot-add-${key}`} rightNum={rightLineRef.current++} status="added">
            {'  '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff.filter(w => w.type !== 'removed')} />
            ) : (
              <SlotValueSpan value={value} />
            )}
          </UnifiedLine>,
        );
      }
    }

    // Removed slots (only in source, not in target)
    const removedSlots = aligned.slotDiffs?.filter(sd => sd.type === 'removed') ?? [];
    for (const sd of removedSlots) {
      lines.push(
        <UnifiedLine key={`slot-del-${sd.key}`} leftNum={leftLineRef.current++} status="removed">
          {'  '}
          <span className="line-through opacity-60" style={{ color: YAML_COLORS.key }}>{sd.key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
          </span>
        </UnifiedLine>,
      );
    }
  }

  // Relation annotations
  const relations = getFrameRelations(aligned.frameId, diff);

  return (
    <>
      {lines}
      {relations.map((rel, i) => (
        <RelationAnnotation key={`${aligned.frameId}-rel-${i}`} rel={rel} />
      ))}
    </>
  );
}

// ── Main component ──

export function DiffYAMLUnifiedView({
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
}: DiffYAMLUnifiedViewProps) {
  const aligned = buildAlignedFrames(diff);
  const nonIdentical = aligned.filter(a => a.type !== 'identical');
  const identicalFrames = aligned.filter(a => a.type === 'identical');

  // Mutable line counters passed by ref
  const leftLineRef = { current: 1 };
  const rightLineRef = { current: 1 };

  const renderFrame = (af: AlignedFrame) => (
    <div key={`unified-${af.frameId}`}>
      <FrameSeparator
        aligned={af}
        onClick={() => onSelectFrame(af.frameId)}
        isActive={activeFrameId === af.frameId}
      />
      <UnifiedFrameContent
        aligned={af}
        diff={diff}
        leftLineRef={leftLineRef}
        rightLineRef={rightLineRef}
      />
    </div>
  );

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        '--dy-surface': '#0d1117',
        '--dy-added-bg': 'rgba(46,160,67,0.15)',
        '--dy-added-accent': '#3fb950',
        '--dy-added-word': 'rgba(46,160,67,0.45)',
        '--dy-removed-bg': 'rgba(248,81,73,0.15)',
        '--dy-removed-accent': '#f85149',
        '--dy-removed-word': 'rgba(248,81,73,0.40)',
        '--dy-modified-bg': 'rgba(210,153,34,0.10)',
        '--dy-modified-accent': '#d29922',
      } as React.CSSProperties}
    >
      {nonIdentical.map(renderFrame)}
      {showIdentical
        ? identicalFrames.map(renderFrame)
        : (
          <IdenticalCollapseBar
            frames={identicalFrames}
            onClick={() => {
              if (identicalFrames.length > 0) {
                onSelectFrame(identicalFrames[0].frameId);
              }
            }}
          />
        )
      }
    </div>
  );
}
