'use client';

import type { Delta, DeltaSource, FrameDiff, SemanticContent, SlotValue } from '@t3x/core';
import { frameDiff } from '@t3x/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// ── Props ──

interface FrameYAMLEditorProps {
  content: SemanticContent;
  onDeltaCreated: (delta: Delta, source: DeltaSource) => void;
  className?: string;
}

// ── Helpers ──

/** Convert a FrameDiff into a Delta for the delta pipeline. */
function frameDiffToDelta(diff: FrameDiff): Delta | null {
  const delta: Delta = { changes: [] };

  // Added frames (only in target = new in edited version)
  for (const frame of diff.onlyInTarget) {
    delta.changes.push({ action: 'add', frame });
  }

  // Removed frames (only in source = deleted in edited version)
  for (const frame of diff.onlyInSource) {
    delta.changes.push({ action: 'remove', target: frame.id });
  }

  // Modified frames
  for (const mod of diff.modified) {
    const slots: Record<string, SlotValue | null> = {};
    for (const sd of mod.slotDiffs) {
      switch (sd.type) {
        case 'added':
          slots[sd.key] = sd.newValue ?? null;
          break;
        case 'removed':
          slots[sd.key] = null;
          break;
        case 'changed':
          slots[sd.key] = sd.newValue ?? null;
          break;
      }
    }
    // Also check if type changed — represent as remove + add
    if (mod.sourceFrame.type !== mod.targetFrame.type) {
      delta.changes.push({ action: 'remove', target: mod.frameId });
      delta.changes.push({ action: 'add', frame: mod.targetFrame });
    } else if (Object.keys(slots).length > 0) {
      delta.changes.push({ action: 'update', target: mod.frameId, slots });
    }
  }

  // Relations
  if (diff.relationsAdded.length > 0) {
    delta.new_relations = diff.relationsAdded;
  }
  if (diff.relationsRemoved.length > 0) {
    delta.remove_relations = diff.relationsRemoved;
  }

  // Return null if no changes
  if (delta.changes.length === 0 && !delta.new_relations && !delta.remove_relations) {
    return null;
  }

  return delta;
}

/** Minimal validation: must have a frames array. */
function looksLikeSemanticContent(value: unknown): value is SemanticContent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.frames);
}

// ── Component ──

export function FrameYAMLEditor({ content, onDeltaCreated, className }: FrameYAMLEditorProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef(content);

  // Sync textarea when content prop changes (external update)
  useEffect(() => {
    contentRef.current = content;
    setText(JSON.stringify(content, null, 2));
    setError(null);
  }, [content]);

  const applyChanges = useCallback(() => {
    setError(null);

    // 1. Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }

    // 2. Validate shape
    if (!looksLikeSemanticContent(parsed)) {
      setError('Invalid structure: must have a "frames" array');
      return;
    }

    // Ensure relations array exists
    const edited: SemanticContent = {
      frames: parsed.frames,
      relations: parsed.relations ?? [],
    };

    // 3. Diff against original
    const diff = frameDiff(contentRef.current, edited);

    // 4. Convert to delta
    const delta = frameDiffToDelta(diff);
    if (!delta) {
      setError('No changes detected');
      return;
    }

    // 5. Emit
    onDeltaCreated(delta, 'user_yaml_edit');
  }, [text, onDeltaCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        applyChanges();
      }
    },
    [applyChanges]
  );

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Editor */}
      <textarea
        className={cn(
          'flex-1 resize-none rounded-md border bg-muted/30 p-3 font-mono text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          error && 'border-destructive'
        )}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={applyChanges}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label="Semantic content JSON editor"
      />

      {/* Error display */}
      {error && (
        <p className="mt-1 px-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Apply button */}
      <button
        type="button"
        className={cn(
          'mt-2 self-end rounded-md border px-3 py-1.5 text-xs font-medium',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-ring'
        )}
        onClick={applyChanges}
      >
        Apply (Ctrl+Enter)
      </button>
    </div>
  );
}
