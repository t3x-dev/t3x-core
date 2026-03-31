'use client';

import type { YOp, YOpsSource, TreeDiff, SemanticContent, SlotValue } from '@t3x-dev/core';
import { diffCommits } from '@t3x-dev/core';
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

/** Convert a TreeDiff into YOp[] directly. */
function treeDiffToYOps(diff: TreeDiff, _sourceContent: SemanticContent, targetContent: SemanticContent): YOp[] | null {
  const ops: YOp[] = [];

  // Added paths (only in target = new in edited version)
  for (const path of diff.onlyInTarget) {
    const nodes = treesToNodes(targetContent.trees);
    const node = nodes.find((f) => f.id === path);
    if (node) {
      const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
      ops.push({
        add: {
          parent: parentPath,
          node: { [node.key]: Object.fromEntries(Object.entries(node.slots)) },
          source: {},
          from: 'manual',
        },
      });
    }
  }

  // Removed paths (only in source = deleted in edited version)
  for (const path of diff.onlyInSource) {
    ops.push({ drop: { path } });
  }

  // Modified paths — emit set/unset per slot
  for (const mod of diff.modified) {
    for (const sd of mod.slotDiffs) {
      if (sd.type === 'removed') {
        ops.push({ unset: { path: `${mod.path}/${sd.key}` } });
      } else {
        const value = sd.newValue;
        if (value !== undefined) {
          ops.push({
            set: {
              path: `${mod.path}/${sd.key}`,
              value,
              source: String(value),
              from: 'manual',
            },
          });
        }
      }
    }
  }

  // Relations
  for (const rel of diff.relationsAdded) {
    ops.push({ relate: { from: rel.from, to: rel.to, type: rel.type } });
  }
  for (const rel of diff.relationsRemoved) {
    ops.push({ unrelate: { from: rel.from, to: rel.to, type: rel.type } });
  }

  return ops.length > 0 ? ops : null;
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
