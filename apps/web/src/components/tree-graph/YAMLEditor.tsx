'use client';

import type { YOp, YOpsSource, TreeDiff, SemanticContent, SlotValue, TreeChangeBatch } from '@t3x-dev/core';
import { diffCommits, treeChangesToYOps } from '@t3x-dev/core';
import { treesToNodes } from '@/lib/treeCompat';
import yaml from 'js-yaml';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// ── Props ──

interface YAMLEditorProps {
  content: SemanticContent;
  onBatchCreated: (ops: YOp[], source: YOpsSource) => void;
  className?: string;
}

// ── Helpers ──

/** Convert a TreeDiff into YOp[] for the change pipeline. */
function treeDiffToYOps(diff: TreeDiff, sourceContent: SemanticContent, targetContent: SemanticContent): YOp[] | null {
  const batch: TreeChangeBatch = { changes: [] };

  // Added paths (only in target = new in edited version)
  for (const path of diff.onlyInTarget) {
    const nodes = treesToNodes(targetContent.trees);
    const node = nodes.find(f => f.id === path);
    if (node) {
      const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
      batch.changes.push({
        action: 'add',
        parent_path: parentPath,
        node: { key: node.key, slots: node.slots, children: node.children },
      });
    }
  }

  // Removed paths (only in source = deleted in edited version)
  for (const path of diff.onlyInSource) {
    batch.changes.push({ action: 'remove', target_path: path });
  }

  // Modified paths
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
    if (Object.keys(slots).length > 0) {
      batch.changes.push({ action: 'update', target_path: mod.path, slots });
    }
  }

  // Relations
  if (diff.relationsAdded.length > 0) {
    batch.new_relations = diff.relationsAdded;
  }
  if (diff.relationsRemoved.length > 0) {
    batch.remove_relations = diff.relationsRemoved;
  }

  // Return null if no changes
  if (batch.changes.length === 0 && !batch.new_relations && !batch.remove_relations) {
    return null;
  }

  return treeChangesToYOps(batch);
}

/** Minimal validation: must have a trees array. */
function looksLikeSemanticContent(value: unknown): value is SemanticContent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.trees);
}

// ── Component ──

export function YAMLEditor({ content, onBatchCreated, className }: YAMLEditorProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef(content);

  // Sync textarea when content prop changes (external update)
  useEffect(() => {
    contentRef.current = content;
    setText(yaml.dump(content, { indent: 2, lineWidth: 120, noRefs: true }));
    setError(null);
  }, [content]);

  const applyChanges = useCallback(() => {
    setError(null);

    // 1. Parse YAML
    let parsed: unknown;
    try {
      parsed = yaml.load(text);
    } catch (e) {
      setError(`Invalid YAML: ${(e as Error).message}`);
      return;
    }

    // 2. Validate shape
    if (!looksLikeSemanticContent(parsed)) {
      setError('Invalid structure: must have a "trees" array');
      return;
    }

    // Ensure relations array exists
    const edited: SemanticContent = {
      trees: parsed.trees,
      relations: parsed.relations ?? [],
    };

    // 3. Diff against original
    const diff = diffCommits(contentRef.current, edited);

    // 4. Convert to YOp[]
    const ops = treeDiffToYOps(diff, contentRef.current, edited);
    if (!ops) {
      setError('No changes detected');
      return;
    }

    // 5. Emit
    onBatchCreated(ops, 'manual');
  }, [text, onBatchCreated]);

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
        aria-label="Semantic content YAML editor"
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
