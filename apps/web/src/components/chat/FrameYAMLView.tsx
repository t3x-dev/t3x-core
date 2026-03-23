'use client';

import type { Frame, Relation, SemanticContent, SlotValue } from '@t3x-dev/core';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';
import { RELEVANCE_THRESHOLD, type RelevanceContext, relevanceScore } from '@/lib/relevanceScore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

// ── Client-side nesting from relations ──

const NESTING_RELATIONS = new Set(['elaborates', 'conditions', 'depends', 'follows', 'causes', 'contrasts']);

/**
 * Build nested tree from flat frames + relations (client-side mirror of nesterAgent).
 * Children become InlineFrame slot values in their parent.
 */
function nestFrames(content: SemanticContent): Frame[] {
  if (content.relations.length === 0 || content.frames.length <= 1) {
    return content.frames;
  }

  const frameMap = new Map<string, Frame>();
  for (const frame of content.frames) {
    frameMap.set(frame.id, frame);
  }

  const childrenMap = new Map<string, Array<{ frame: Frame; relationType: string }>>();
  const childIds = new Set<string>();

  for (const rel of content.relations) {
    if (!NESTING_RELATIONS.has(rel.type)) continue;
    if (!frameMap.has(rel.from) || !frameMap.has(rel.to)) continue;

    const childFrame = frameMap.get(rel.from);
    childIds.add(rel.from);
    const children = childrenMap.get(rel.to) ?? [];
    if (childFrame) {
      children.push({ frame: childFrame, relationType: rel.type });
      childrenMap.set(rel.to, children);
    }
  }

  const rootFrames = content.frames.filter((f) => !childIds.has(f.id));
  if (rootFrames.length === content.frames.length) return content.frames;

  function nest(frame: Frame, visited: Set<string>): Frame {
    visited.add(frame.id);
    const children = childrenMap.get(frame.id) ?? [];
    if (children.length === 0) return frame;

    const newSlots: Record<string, SlotValue> = { ...frame.slots };
    for (const { frame: childFrame } of children) {
      if (visited.has(childFrame.id)) continue;
      const nested = nest(childFrame, new Set(visited));
      let slotKey = nested.type;
      if (slotKey in newSlots) {
        let suffix = 2;
        while (`${slotKey}_${suffix}` in newSlots) suffix++;
        slotKey = `${slotKey}_${suffix}`;
      }
      newSlots[slotKey] = { type: nested.type, slots: nested.slots };
    }
    return { ...frame, slots: newSlots };
  }

  return rootFrames.map((f) => nest(f, new Set()));
}

// ── YAML Rendering Helpers ──

interface YAMLLine {
  text: string;
  frameId: string;
  slotKey: string | null;
  changeType: 'add' | 'update' | 'remove' | null;
  isAutoSelected: boolean;
  isEmpty: boolean;
  isCollapsed?: boolean;
  collapsedSlotCount?: number;
}

function formatValue(value: SlotValue): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
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
  slotKey: string,
  changeType: 'add' | 'update' | 'remove' | null,
  isAutoSelected: boolean
): void {
  const pad = '  '.repeat(indent);

  // Simple values: key: "value"
  if (typeof value === 'string' || typeof value === 'number') {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      frameId,
      slotKey,
      changeType,
      isAutoSelected,
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
      changeType,
      isAutoSelected,
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
      changeType,
      isAutoSelected,
      isEmpty: false,
    });
    for (const [k, v] of Object.entries(inlineFrame.slots)) {
      renderSlotLines(lines, k, v, indent + 1, frameId, slotKey, changeType, isAutoSelected);
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
      changeType,
      isAutoSelected,
      isEmpty: false,
    });
    for (const item of arr) {
      if (typeof item === 'string' || typeof item === 'number') {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          frameId,
          slotKey,
          changeType,
          isAutoSelected,
          isEmpty: false,
        });
      } else if (typeof item === 'object' && item !== null && 'type' in item && 'slots' in item) {
        // InlineFrame in array
        const inlineFrame = item as { type: string; slots: Record<string, SlotValue> };
        lines.push({
          text: `${pad}  - ${inlineFrame.type}:`,
          frameId,
          slotKey,
          changeType,
          isAutoSelected,
          isEmpty: false,
        });
        for (const [k, v] of Object.entries(inlineFrame.slots)) {
          renderSlotLines(lines, k, v, indent + 2, frameId, slotKey, changeType, isAutoSelected);
        }
      } else {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          frameId,
          slotKey,
          changeType,
          isAutoSelected,
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
    changeType,
    isAutoSelected,
    isEmpty: false,
  });
}

// ── Component ──

export function FrameYAMLView() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const applyDelta = useExtractionPanelStore((s) => s.applyDelta);
  const lastDeltaChanges = useExtractionPanelStore((s) => s.lastDeltaChanges);
  const deltaLog = useExtractionPanelStore((s) => s.deltaLog);
  const confirmedFrameIds = useExtractionPanelStore((s) => s.confirmedFrameIds);
  const confirmedSlotKeys = useExtractionPanelStore((s) => s.confirmedSlotKeys);
  const confirmFrame = useExtractionPanelStore((s) => s.confirmFrame);
  const unconfirmFrame = useExtractionPanelStore((s) => s.unconfirmFrame);
  const confirmSlot = useExtractionPanelStore((s) => s.confirmSlot);
  const unconfirmSlot = useExtractionPanelStore((s) => s.unconfirmSlot);
  const committedFrameIds = useExtractionPanelStore((s) => s.committedFrameIds);
  const llmHighlightedFrameIds = useExtractionPanelStore((s) => s.llmHighlightedFrameIds);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);
  const setHoveredFrameId = useExtractionPanelStore((s) => s.setHoveredFrameId);
  const hoveredTurnHash = useExtractionPanelStore((s) => s.hoveredTurnHash);
  const hoveredCharOffset = useExtractionPanelStore((s) => s.hoveredCharOffset);
  const gateIssues = useExtractionPanelStore((s) => s.gateIssues);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [expandedCollapsed, setExpandedCollapsed] = useState<Record<string, boolean>>({});

  const yamlText = toDisplayYAML(draft);

  useEffect(() => {
    if (!isEditing) setEditValue(yamlText);
  }, [yamlText, isEditing]);

  const handleEdit = useCallback(() => {
    setEditValue(yamlText);
    setIsEditing(true);
  }, [yamlText]);

  const handleSave = useCallback(() => {
    const delta = parseDisplayYAML(editValue, draft);
    const hasChanges =
      delta.changes.length > 0 ||
      (delta.new_relations?.length ?? 0) > 0 ||
      (delta.remove_relations?.length ?? 0) > 0;
    if (hasChanges) applyDelta(delta, 'manual');
    setIsEditing(false);
  }, [editValue, draft, applyDelta]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(yamlText);
  }, [yamlText]);

  // Build change map from last delta
  const changeMap = useMemo(() => {
    const map = new Map<string, 'add' | 'update' | 'remove'>();
    for (const c of lastDeltaChanges) {
      if (c.action === 'add') map.set(c.frame.id, 'add');
      else if (c.action === 'update') map.set(c.target, 'update');
      else if (c.action === 'remove') map.set(c.target, 'remove');
    }
    return map;
  }, [lastDeltaChanges]);

  // Build relevance context
  const relevanceCtx = useMemo((): RelevanceContext => {
    const turnsAgoMap: Record<string, number> = {};
    const touchCountMap: Record<string, number> = {};
    const total = deltaLog.length;
    for (let i = deltaLog.length - 1; i >= 0; i--) {
      const turnsAgo = total - 1 - i;
      for (const c of deltaLog[i].delta.changes) {
        const fid = c.action === 'add' ? c.frame.id : c.target;
        if (!(fid in turnsAgoMap)) turnsAgoMap[fid] = turnsAgo;
        touchCountMap[fid] = (touchCountMap[fid] ?? 0) + 1;
      }
    }
    const relationDegreeMap: Record<string, number> = {};
    for (const r of draft.relations) {
      relationDegreeMap[r.from] = (relationDegreeMap[r.from] ?? 0) + 1;
      relationDegreeMap[r.to] = (relationDegreeMap[r.to] ?? 0) + 1;
    }
    return {
      confirmedFrameIds,
      llmHighlightedFrameIds,
      turnsAgoMap,
      touchCountMap,
      relationDegreeMap,
    };
  }, [deltaLog, draft.relations, confirmedFrameIds, llmHighlightedFrameIds]);

  // Apply client-side nesting from relations, then sort by relevance
  const nestedFrames = useMemo(() => nestFrames(draft), [draft]);

  const sortedFrames = useMemo(() => {
    return [...nestedFrames].sort(
      (a, b) => relevanceScore(b, relevanceCtx).score - relevanceScore(a, relevanceCtx).score
    );
  }, [nestedFrames, relevanceCtx]);

  // Build per-line metadata for the YAML display
  // Each YAML line maps to a frame header or a slot line
  const yamlLines = useMemo(() => {
    const lines: YAMLLine[] = [];

    for (const frame of sortedFrames) {
      const change = changeMap.get(frame.id) ?? null;
      const score = relevanceScore(frame, relevanceCtx).score;
      const isAuto = score >= RELEVANCE_THRESHOLD;
      const isFrameCollapsed = (frame as Frame & { status?: string }).status === 'collapsed';
      const isExpanded = expandedCollapsed[frame.id];

      if (isFrameCollapsed && !isExpanded) {
        // Collapsed frame — single grey line with slot count
        const slotCount = Object.keys(frame.slots).length;
        lines.push({
          text: `▶ ${frame.type} (${slotCount} slots)`,
          frameId: frame.id,
          slotKey: null,
          changeType: null,
          isAutoSelected: false,
          isEmpty: false,
          isCollapsed: true,
          collapsedSlotCount: slotCount,
        });
        lines.push({ text: '', frameId: frame.id, slotKey: null, changeType: null, isAutoSelected: false, isEmpty: true });
        continue;
      }

      // Frame header (normal or expanded-collapsed)
      const headerPrefix = isFrameCollapsed && isExpanded ? '▼ ' : '';
      lines.push({
        text: `${headerPrefix}${frame.type}:`,
        frameId: frame.id,
        slotKey: null,
        changeType: change,
        isAutoSelected: isAuto,
        isEmpty: false,
        isCollapsed: isFrameCollapsed,
      });

      // Slot lines — render nested structures as proper YAML
      for (const [key, value] of Object.entries(frame.slots)) {
        renderSlotLines(lines, key, value, 1, frame.id, key, change, isAuto);
      }

      // Blank separator
      lines.push({
        text: '',
        frameId: frame.id,
        slotKey: null,
        changeType: null,
        isAutoSelected: false,
        isEmpty: true,
      });
    }

    return lines;
  }, [sortedFrames, changeMap, relevanceCtx, expandedCollapsed]);

  if (draft.frames.length === 0 && !isEditing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        {isExtracting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-commit)]" />
            <p className="text-xs text-[var(--text-tertiary)]">Extracting frames...</p>
          </>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">No frames yet</p>
        )}
      </div>
    );
  }

  const deltaBarColors: Record<string, string> = {
    add: '#4ade80',
    update: '#facc15',
    remove: '#f87171',
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          YAML
        </span>
        <div className="flex gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded bg-[var(--accent-commit)] px-2 py-0.5 text-xs text-white hover:opacity-90"
              >
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEdit}
              className="rounded px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1 resize-none rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
          spellCheck={false}
        />
      ) : (
        <div className="flex-1 overflow-auto rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)]">
          {yamlLines.map((line, i) => {
            // Blank separator line
            if (line.isEmpty) return <div key={i} style={{ height: 4 }} />;

            const isFrameLine = line.slotKey === null;
            const isConfirmed = isFrameLine
              ? !!confirmedFrameIds[line.frameId]
              : !!confirmedSlotKeys[line.frameId]?.[line.slotKey!];

            // Check if this row is highlighted by reverse hover (chat → YAML)
            const frame = draft.frames.find((f) => f.id === line.frameId);
            const isReverseHighlighted = (() => {
              if (!hoveredTurnHash || !frame) return false;

              // Slot-level precision: when charOffset is available, match specific slot
              if (hoveredCharOffset != null && frame.slot_sources) {
                for (const [slotKey, ref] of Object.entries(frame.slot_sources)) {
                  const hashMatch = ref.turn_hash && hoveredTurnHash === ref.turn_hash;
                  if (hashMatch && hoveredCharOffset >= ref.start_char && hoveredCharOffset < ref.end_char) {
                    // Only highlight this specific slot row (or the frame header if slotKey is null)
                    return line.slotKey === slotKey || (line.slotKey === null && line.text.includes(frame.type));
                  }
                }
                return false;
              }

              // Fallback: whole-frame highlight via frame.source
              if (!frame.source) return false;
              if (frame.source.includes(':')) {
                const hashPart = frame.source.split(':')[1];
                return hoveredTurnHash.includes(hashPart);
              }
              return false;
            })();

            // Collapsed frames get distinct grey background
            const collapsedBg = 'rgba(128, 128, 128, 0.1)';

            // Background: collapsed > reverse-highlight > confirmed > auto-selected > transparent
            const bg = line.isCollapsed && line.slotKey === null
              ? collapsedBg
              : isReverseHighlighted
                ? 'rgba(96, 165, 250, 0.15)'
                : isConfirmed
                  ? 'rgba(74, 222, 128, 0.1)'
                  : line.isAutoSelected
                    ? 'rgba(96, 165, 250, 0.06)'
                    : 'transparent';

            const handleCheck = () => {
              // Collapsed frame header — toggle expand
              if (line.isCollapsed && isFrameLine) {
                setExpandedCollapsed((prev) => ({ ...prev, [line.frameId]: !prev[line.frameId] }));
                return;
              }
              if (isFrameLine) {
                isConfirmed ? unconfirmFrame(line.frameId) : confirmFrame(line.frameId);
              } else {
                isConfirmed
                  ? unconfirmSlot(line.frameId, line.slotKey!)
                  : confirmSlot(line.frameId, line.slotKey!);
              }
            };

            return (
              <div
                key={i}
                data-frame-id={isFrameLine ? line.frameId : undefined}
                onMouseEnter={() => setHoveredFrameId(line.frameId, line.slotKey)}
                onMouseLeave={() => setHoveredFrameId(null)}
                title={
                  isFrameLine && gateIssues[line.frameId]?.length
                    ? gateIssues[line.frameId].map((i) => `[${i.severity}] ${i.description}`).join('\n')
                    : undefined
                }
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: bg,
                  minHeight: 20,
                  transition: 'background 0.15s',
                  cursor: isFrameLine ? 'pointer' : undefined,
                  borderLeft: isFrameLine && gateIssues[line.frameId]?.length
                    ? `3px solid ${gateIssues[line.frameId].some((i) => i.severity === 'error') ? '#f87171' : '#facc15'}`
                    : undefined,
                }}
              >
                {/* Checkbox column */}
                <div
                  style={{
                    width: 22,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={handleCheck}
                    style={{
                      accentColor: '#4ade80',
                      cursor: 'pointer',
                      opacity: isConfirmed ? 1 : 0.25,
                      width: 11,
                      height: 11,
                    }}
                  />
                </div>

                {/* Delta color bar */}
                <div
                  style={{
                    width: 3,
                    flexShrink: 0,
                    background: line.changeType ? deltaBarColors[line.changeType] : 'transparent',
                  }}
                />

                {/* YAML text — actual monospace, untouched */}
                <pre
                  style={{
                    margin: 0,
                    padding: '1px 6px',
                    fontSize: 11,
                    lineHeight: '18px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    color: line.isCollapsed
                      ? 'var(--text-tertiary)'
                      : isFrameLine ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: line.isCollapsed ? 400 : isFrameLine ? 600 : 400,
                    fontStyle: line.isCollapsed && line.slotKey === null && !expandedCollapsed[line.frameId] ? 'italic' : undefined,
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {isFrameLine && committedFrameIds[line.frameId] && (
                    <span
                      style={{ fontSize: 9, color: 'rgba(74, 222, 128, 0.6)', marginRight: 4 }}
                      title="Committed"
                    >
                      ✓
                    </span>
                  )}
                  {line.text}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
