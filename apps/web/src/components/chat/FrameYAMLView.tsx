'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function FrameYAMLView() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const applyDelta = useExtractionPanelStore((s) => s.applyDelta);

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
        <pre className="flex-1 overflow-auto rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 font-mono text-xs text-[var(--text-primary)]">
          {yamlText || '# empty'}
        </pre>
      )}
    </div>
  );
}
