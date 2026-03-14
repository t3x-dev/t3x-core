'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';
import { relevanceScore, RELEVANCE_THRESHOLD, type RelevanceContext } from '@/lib/relevanceScore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

const CHANGE_COLORS: Record<string, string> = {
  add: '#4ade80',
  update: '#facc15',
  remove: '#f87171',
};

const CHANGE_PREFIX: Record<string, string> = {
  add: '+ ',
  update: '~ ',
  remove: '- ',
};

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
  const removedFrames = useExtractionPanelStore((s) => s.removedFrames);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);

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

  // Build change map
  const changeMap = useMemo(() => {
    const map = new Map<string, 'add' | 'update' | 'remove'>();
    for (const c of lastDeltaChanges) {
      if (c.action === 'add') map.set(c.frame.id, 'add');
      else if (c.action === 'update') map.set(c.target, 'update');
      else if (c.action === 'remove') map.set(c.target, 'remove');
    }
    return map;
  }, [lastDeltaChanges]);

  // Build relevance context for sorting
  const turnsAgoMap = useMemo(() => {
    const map: Record<string, number> = {};
    const totalEntries = deltaLog.length;
    for (let i = deltaLog.length - 1; i >= 0; i--) {
      const entry = deltaLog[i];
      const turnsAgo = totalEntries - 1 - i;
      for (const c of entry.delta.changes) {
        const fid = c.action === 'add' ? c.frame.id : c.target;
        if (!(fid in map)) map[fid] = turnsAgo;
      }
    }
    return map;
  }, [deltaLog]);

  const touchCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of deltaLog) {
      for (const c of entry.delta.changes) {
        const fid = c.action === 'add' ? c.frame.id : c.target;
        map[fid] = (map[fid] ?? 0) + 1;
      }
    }
    return map;
  }, [deltaLog]);

  const relationDegreeMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of draft.relations) {
      map[r.from] = (map[r.from] ?? 0) + 1;
      map[r.to] = (map[r.to] ?? 0) + 1;
    }
    return map;
  }, [draft.relations]);

  // Sort frames by relevance score (highest first)
  const sortedFrames = useMemo(() => {
    const ctx: RelevanceContext = {
      confirmedFrameIds,
      llmHighlightedFrameIds,
      turnsAgoMap,
      touchCountMap,
      relationDegreeMap,
    };
    return [...draft.frames].sort((a, b) => {
      const sa = relevanceScore(a, ctx);
      const sb = relevanceScore(b, ctx);
      return sb.score - sa.score;
    });
  }, [draft.frames, confirmedFrameIds, llmHighlightedFrameIds, turnsAgoMap, touchCountMap, relationDegreeMap]);

  const removedFramesInDelta = removedFrames.filter((f) => changeMap.get(f.id) === 'remove');

  if (draft.frames.length === 0 && removedFramesInDelta.length === 0 && !isEditing) {
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

  const renderFrameYAML = (frame: typeof draft.frames[0], isRemoved: boolean) => {
    const changeType = changeMap.get(frame.id);
    const borderColor = changeType ? CHANGE_COLORS[changeType] : undefined;
    const prefix = changeType ? CHANGE_PREFIX[changeType] : '  ';
    const isConfirmed = !!confirmedFrameIds[frame.id];
    const frameSlotConfirms = confirmedSlotKeys[frame.id] ?? {};
    const opacity = isRemoved ? 0.4 : 1;

    return (
      <div
        key={frame.id}
        style={{
          borderLeft: `3px solid ${borderColor ?? 'transparent'}`,
          paddingLeft: 6,
          marginBottom: 2,
          opacity,
        }}
      >
        {/* Frame type line: checkbox + YAML key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: '20px' }}>
          <span style={{ color: borderColor ?? 'var(--text-tertiary)', fontWeight: 600, width: 14, flexShrink: 0, fontSize: 11 }}>
            {prefix}
          </span>
          <input
            type="checkbox"
            checked={isConfirmed}
            onChange={() => isConfirmed ? unconfirmFrame(frame.id) : confirmFrame(frame.id)}
            style={{ accentColor: '#4ade80', cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{
            fontWeight: 600,
            color: 'var(--text-primary)',
            textDecoration: isRemoved ? 'line-through' : 'none',
          }}>
            {frame.type}:
          </span>
        </div>
        {/* Slots as YAML key-value lines with individual checkboxes */}
        {Object.entries(frame.slots).map(([key, value]) => {
          const isSlotConfirmed = !!frameSlotConfirms[key];
          const displayValue = typeof value === 'string' ? value
            : Array.isArray(value) ? `[${(value as string[]).join(', ')}]`
            : JSON.stringify(value);

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 4,
                paddingLeft: 22,
                lineHeight: '18px',
                textDecoration: isRemoved ? 'line-through' : 'none',
              }}
            >
              <input
                type="checkbox"
                checked={isSlotConfirmed}
                onChange={() => isSlotConfirmed ? unconfirmSlot(frame.id, key) : confirmSlot(frame.id, key)}
                style={{ accentColor: '#4ade80', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-primary)' }}>{key}</span>: {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          YAML
        </span>
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

      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1 resize-none rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
          spellCheck={false}
        />
      ) : (
        <div className="flex-1 overflow-auto rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 font-mono text-xs text-[var(--text-primary)]">
          {sortedFrames.map((frame) => renderFrameYAML(frame, false))}
          {removedFramesInDelta.map((frame) => renderFrameYAML(frame, true))}
          {sortedFrames.length === 0 && removedFramesInDelta.length === 0 && (
            <span style={{ color: 'var(--text-tertiary)' }}># empty</span>
          )}
        </div>
      )}
    </div>
  );
}
