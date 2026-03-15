'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';
import { relevanceScore, RELEVANCE_THRESHOLD, type RelevanceContext } from '@/lib/relevanceScore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

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
  const llmHighlightedFrameIds = useExtractionPanelStore((s) => s.llmHighlightedFrameIds);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);
  const setHoveredFrameId = useExtractionPanelStore((s) => s.setHoveredFrameId);
  const hoveredTurnHash = useExtractionPanelStore((s) => s.hoveredTurnHash);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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
    if (hasChanges) applyDelta(delta, 'user_yaml_edit');
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
    return { confirmedFrameIds, llmHighlightedFrameIds, turnsAgoMap, touchCountMap, relationDegreeMap };
  }, [deltaLog, draft.relations, confirmedFrameIds, llmHighlightedFrameIds]);

  // Sort frames by relevance
  const sortedFrames = useMemo(() => {
    return [...draft.frames].sort((a, b) =>
      relevanceScore(b, relevanceCtx).score - relevanceScore(a, relevanceCtx).score
    );
  }, [draft.frames, relevanceCtx]);

  // Build per-line metadata for the YAML display
  // Each YAML line maps to a frame header or a slot line
  const yamlLines = useMemo(() => {
    const lines: Array<{
      text: string;
      frameId: string;
      slotKey: string | null;
      changeType: 'add' | 'update' | 'remove' | null;
      isAutoSelected: boolean;
      isEmpty: boolean;
    }> = [];

    for (const frame of sortedFrames) {
      const change = changeMap.get(frame.id) ?? null;
      const score = relevanceScore(frame, relevanceCtx).score;
      const isAuto = score >= RELEVANCE_THRESHOLD;

      // Frame header
      lines.push({
        text: `${frame.type}:`,
        frameId: frame.id,
        slotKey: null,
        changeType: change,
        isAutoSelected: isAuto,
        isEmpty: false,
      });

      // Slot lines
      for (const [key, value] of Object.entries(frame.slots)) {
        let display: string;
        if (Array.isArray(value)) display = JSON.stringify(value);
        else if (typeof value === 'number') display = String(value);
        else display = `"${String(value)}"`;

        lines.push({
          text: `  ${key}: ${display}`,
          frameId: frame.id,
          slotKey: key,
          changeType: change,
          isAutoSelected: isAuto,
          isEmpty: false,
        });
      }

      // Blank separator
      lines.push({ text: '', frameId: frame.id, slotKey: null, changeType: null, isAutoSelected: false, isEmpty: true });
    }

    return lines;
  }, [sortedFrames, changeMap, relevanceCtx]);

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
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">YAML</span>
        <div className="flex gap-1">
          {isEditing ? (
            <>
              <button type="button" onClick={handleCancel} className="rounded px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button type="button" onClick={handleSave} className="rounded bg-[var(--accent-commit)] px-2 py-0.5 text-xs text-white hover:opacity-90">Save</button>
            </>
          ) : (
            <button type="button" onClick={handleEdit} className="rounded px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Edit</button>
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
              : !!(confirmedSlotKeys[line.frameId]?.[line.slotKey!]);

            // Check if this row's frame is highlighted by reverse hover (chat → YAML)
            const frame = draft.frames.find((f) => f.id === line.frameId);
            const isReverseHighlighted = (() => {
              if (!hoveredTurnHash || !frame?.source) return false;
              const source = frame.source;
              // Match "T3" by checking if hoveredTurnHash is the Nth turn
              // Match "T3:abc12345" by checking hash prefix
              if (source.includes(':')) {
                const hashPart = source.split(':')[1];
                return hoveredTurnHash.includes(hashPart);
              }
              return false;
            })();

            // Background: reverse-highlight > confirmed > auto-selected > transparent
            const bg = isReverseHighlighted
              ? 'rgba(96, 165, 250, 0.15)'
              : isConfirmed
                ? 'rgba(74, 222, 128, 0.1)'
                : line.isAutoSelected
                  ? 'rgba(96, 165, 250, 0.06)'
                  : 'transparent';

            const handleCheck = () => {
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
                onMouseEnter={() => setHoveredFrameId(line.frameId, line.slotKey)}
                onMouseLeave={() => setHoveredFrameId(null)}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: bg,
                  minHeight: 20,
                  transition: 'background 0.15s',
                  cursor: isFrameLine ? 'pointer' : undefined,
                }}
              >
                {/* Checkbox column */}
                <div style={{
                  width: 22,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
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
                <div style={{
                  width: 3,
                  flexShrink: 0,
                  background: line.changeType ? deltaBarColors[line.changeType] : 'transparent',
                }} />

                {/* YAML text — actual monospace, untouched */}
                <pre style={{
                  margin: 0,
                  padding: '1px 6px',
                  fontSize: 11,
                  lineHeight: '18px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  color: isFrameLine ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isFrameLine ? 600 : 400,
                  whiteSpace: 'pre',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                  minWidth: 0,
                }}>
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
