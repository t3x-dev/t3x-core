'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

const CHANGE_COLORS: Record<string, string> = {
  add: '#4ade80',
  update: '#facc15',
  remove: '#f87171',
};

const CHANGE_PREFIX: Record<string, string> = {
  add: '+',
  update: '~',
  remove: '-',
};

export function FrameYAMLView() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const applyDelta = useExtractionPanelStore((s) => s.applyDelta);
  const lastDeltaChanges = useExtractionPanelStore((s) => s.lastDeltaChanges);
  const confirmedFrameIds = useExtractionPanelStore((s) => s.confirmedFrameIds);
  const confirmFrame = useExtractionPanelStore((s) => s.confirmFrame);
  const unconfirmFrame = useExtractionPanelStore((s) => s.unconfirmFrame);
  const removedFrames = useExtractionPanelStore((s) => s.removedFrames);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const yamlText = toDisplayYAML(draft);

  // Reset edit value when draft changes (and not actively editing)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(yamlText);
    }
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

    if (hasChanges) {
      applyDelta(delta, 'user_yaml_edit');
    }
    setIsEditing(false);
  }, [editValue, draft, applyDelta]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(yamlText);
  }, [yamlText]);

  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);

  // Build changeMap from lastDeltaChanges
  const changeMap = new Map<string, 'add' | 'update' | 'remove'>();
  for (const c of lastDeltaChanges) {
    if (c.action === 'add') changeMap.set(c.frame.id, 'add');
    else if (c.action === 'update') changeMap.set(c.target, 'update');
    else if (c.action === 'remove') changeMap.set(c.target, 'remove');
  }

  // Collect all frames to display: active frames + removed frames (for delta display)
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

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Header row */}
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
        <div className="flex-1 overflow-auto rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 font-mono text-xs text-[var(--text-primary)]">
          {[...draft.frames, ...removedFramesInDelta].map((frame) => {
            const changeType = changeMap.get(frame.id);
            const borderColor = changeType ? CHANGE_COLORS[changeType] : 'transparent';
            const prefix = changeType ? CHANGE_PREFIX[changeType] : ' ';
            const isRemoved = changeType === 'remove';
            const isConfirmed = !!confirmedFrameIds[frame.id];

            return (
              <div
                key={frame.id}
                style={{
                  borderLeft: `3px solid ${borderColor}`,
                  paddingLeft: '6px',
                  marginBottom: '8px',
                  opacity: isRemoved ? 0.5 : 1,
                  textDecoration: isRemoved ? 'line-through' : 'none',
                }}
              >
                {/* Frame header row: prefix + checkbox + type label */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}
                >
                  <span
                    style={{
                      color: borderColor === 'transparent' ? 'var(--text-tertiary)' : borderColor,
                      fontWeight: 'bold',
                      width: '10px',
                      flexShrink: 0,
                    }}
                  >
                    {prefix}
                  </span>
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => {
                      if (e.target.checked) {
                        confirmFrame(frame.id);
                      } else {
                        unconfirmFrame(frame.id);
                      }
                    }}
                    style={{ accentColor: '#4ade80', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {frame.type}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                    {frame.id}
                  </span>
                </div>
                {/* Slots */}
                {Object.keys(frame.slots).length > 0 && (
                  <pre
                    style={{
                      paddingLeft: '20px',
                      margin: 0,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {Object.entries(frame.slots)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')}
                  </pre>
                )}
              </div>
            );
          })}
          {draft.frames.length === 0 && removedFramesInDelta.length === 0 && (
            <span style={{ color: 'var(--text-tertiary)' }}># empty</span>
          )}
        </div>
      )}
    </div>
  );
}
