'use client';

/**
 * YAMLDiff - Tree-based diff visualization
 *
 * Renders a TreeDiff (from @t3x-dev/core) in a YAML-like monospace layout
 * with color-coded sections for identical, modified, added, and removed nodes.
 *
 * Single-column inline view:
 * - Identical nodes: dimmed/collapsed with a count badge
 * - Modified nodes: slot-level diff with green (added), red (removed), old→new (changed)
 * - Only in source (removed): red background, strikethrough
 * - Only in target (added): green background
 * - Relation changes: section at bottom
 */

import type {
  Relation,
  SemanticContent,
  SlotDiff,
  SlotValue,
  TreeDiff,
  TreeNode,
} from '@t3x-dev/core';
import { ChevronDown, ChevronRight, Equal, Minus, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { type CompatNode, treesToNodes } from '@/domain/tree/treeCompat';
import { cn } from '@/utils/cn';
import { formatRelation, formatSlotValue, renderNodeSlots } from './DiffYAMLFormatters';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface YAMLDiffProps {
  diff: TreeDiff;
  sourceContent?: SemanticContent;
  targetContent?: SemanticContent;
  className?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Collapsible section for identical paths */
function IdenticalSection({ paths }: { paths: string[] }) {
  const [expanded, setExpanded] = useState(false);

  if (paths.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-[var(--surface-card)] transition-colors w-full text-left"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Equal size={12} />
        <span>
          {paths.length} identical tree{paths.length !== 1 ? 's' : ''}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 opacity-50">
          {paths.map((path) => (
            <div key={path} className="px-2 py-0.5">
              <pre
                className="m-0 text-[11px] leading-[18px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {path}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render a single slot diff entry */
function SlotDiffLine({ slotDiff }: { slotDiff: SlotDiff }) {
  const { key, type, oldValue, newValue, wordDiff } = slotDiff;
  const pad = '  ';

  if (type === 'added') {
    return (
      <div
        className="px-2 py-0.5 rounded-sm"
        style={{ background: 'color-mix(in srgb, var(--status-success) 10%, transparent)' }}
      >
        <pre className="m-0 text-[11px] leading-[18px]" style={{ color: 'var(--status-success)' }}>
          {pad}
          <span className="font-semibold">+</span> {key}: {formatSlotValue(newValue)}
        </pre>
      </div>
    );
  }

  if (type === 'removed') {
    return (
      <div
        className="px-2 py-0.5 rounded-sm"
        style={{ background: 'color-mix(in srgb, var(--status-error) 10%, transparent)' }}
      >
        <pre
          className="m-0 text-[11px] leading-[18px] line-through"
          style={{ color: 'var(--status-error)' }}
        >
          {pad}
          <span className="font-semibold">-</span> {key}: {formatSlotValue(oldValue)}
        </pre>
      </div>
    );
  }

  // type === 'changed'
  if (wordDiff && wordDiff.length > 0) {
    return (
      <div
        className="px-2 py-0.5 rounded-sm"
        style={{ background: 'color-mix(in srgb, var(--text-tertiary) 5%, transparent)' }}
      >
        <pre className="m-0 text-[11px] leading-[18px]" style={{ color: 'var(--text-secondary)' }}>
          {pad}
          <span style={{ color: 'var(--text-tertiary)' }}>~</span> {key}:{' '}
          {wordDiff.map((seg, i) => (
            <span
              key={`${seg.type}-${i}`}
              className={cn(
                seg.type === 'added' && 'font-semibold',
                seg.type === 'removed' && 'line-through'
              )}
              style={{
                color:
                  seg.type === 'added'
                    ? 'var(--status-success)'
                    : seg.type === 'removed'
                      ? 'var(--status-error)'
                      : 'var(--text-secondary)',
                background:
                  seg.type === 'added'
                    ? 'color-mix(in srgb, var(--status-success) 15%, transparent)'
                    : seg.type === 'removed'
                      ? 'color-mix(in srgb, var(--status-error) 15%, transparent)'
                      : 'transparent',
                borderRadius: 2,
                padding: seg.type !== 'unchanged' ? '0 1px' : undefined,
              }}
            >
              {seg.text}
            </span>
          ))}
        </pre>
      </div>
    );
  }

  // Changed without wordDiff: show old → new
  return (
    <div
      className="px-2 py-0.5 rounded-sm"
      style={{ background: 'color-mix(in srgb, var(--text-tertiary) 5%, transparent)' }}
    >
      <pre className="m-0 text-[11px] leading-[18px]" style={{ color: 'var(--text-secondary)' }}>
        {pad}
        <span style={{ color: 'var(--text-tertiary)' }}>~</span> {key}:{' '}
        <span className="line-through" style={{ color: 'var(--status-error)', opacity: 0.8 }}>
          {formatSlotValue(oldValue)}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>{' → '}</span>
        <span style={{ color: 'var(--status-success)' }}>{formatSlotValue(newValue)}</span>
      </pre>
    </div>
  );
}

/** A modified tree: header + slot diffs */
function ModifiedNodeBlock({ entry }: { entry: TreeDiff['modified'][number] }) {
  const { path, slotDiffs } = entry;
  const pathParts = path.split('.');
  const displayType = pathParts[pathParts.length - 1];

  return (
    <div
      className="mb-2 rounded border-l-2"
      style={{ borderColor: 'var(--diff-modified-accent, var(--text-tertiary))' }}
    >
      {/* Tree header */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Pencil size={12} style={{ color: 'var(--diff-modified-accent, var(--text-tertiary))' }} />
        <pre
          className="m-0 text-[11px] leading-[18px] font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {displayType}:
        </pre>
        <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
          ({path})
        </span>
      </div>

      {/* Slot diffs */}
      {slotDiffs.map((sd) => (
        <SlotDiffLine key={sd.key} slotDiff={sd} />
      ))}

      {/* Slot diffs only (no unchanged slots without source content) */}
      {slotDiffs
        .filter((sd) => sd.type !== 'removed' && sd.newValue != null)
        .map((sd) => (
          <div key={sd.key} className="px-2 py-0.5 opacity-40">
            <pre
              className="m-0 text-[11px] leading-[18px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {'  '}
              {sd.key}: {formatSlotValue(sd.newValue as SlotValue)}
            </pre>
          </div>
        ))}
    </div>
  );
}

/** A  node only in source (removed) */
function RemovedNodeBlock({ node }: { node: CompatNode }) {
  return (
    <div
      className="mb-2 rounded border-l-2"
      style={{
        borderColor: 'var(--status-error)',
        background: 'color-mix(in srgb, var(--status-error) 7%, transparent)',
      }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Minus size={12} style={{ color: 'var(--status-error)' }} />
        <pre
          className="m-0 text-[11px] leading-[18px] font-semibold line-through"
          style={{ color: 'var(--status-error)' }}
        >
          {node.type}:
        </pre>
        <span
          className="text-[9px] line-through"
          style={{ color: 'var(--status-error)', opacity: 0.7 }}
        >
          ({node.id})
        </span>
      </div>
      {renderNodeSlots(node).map((line, i) => (
        <div key={i} className="px-2 py-0.5">
          <pre
            className="m-0 text-[11px] leading-[18px] line-through"
            style={{ color: 'var(--status-error)', opacity: 0.75 }}
          >
            {line}
          </pre>
        </div>
      ))}
    </div>
  );
}

/** A  node only in target (added) */
function AddedNodeBlock({ node }: { node: CompatNode }) {
  return (
    <div
      className="mb-2 rounded border-l-2"
      style={{
        borderColor: 'var(--status-success)',
        background: 'color-mix(in srgb, var(--status-success) 7%, transparent)',
      }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Plus size={12} style={{ color: 'var(--status-success)' }} />
        <pre
          className="m-0 text-[11px] leading-[18px] font-semibold"
          style={{ color: 'var(--status-success)' }}
        >
          {node.type}:
        </pre>
        <span className="text-[9px]" style={{ color: 'var(--status-success)', opacity: 0.7 }}>
          ({node.id})
        </span>
      </div>
      {renderNodeSlots(node).map((line, i) => (
        <div key={i} className="px-2 py-0.5">
          <pre
            className="m-0 text-[11px] leading-[18px]"
            style={{ color: 'var(--status-success)' }}
          >
            {line}
          </pre>
        </div>
      ))}
    </div>
  );
}

/** Relation changes section */
function RelationChanges({ added, removed }: { added: Relation[]; removed: Relation[] }) {
  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--stroke-divider)' }}>
      <div
        className="text-[10px] font-medium uppercase tracking-wider mb-1 px-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Relation changes
      </div>
      {removed.map((r, i) => (
        <div
          key={`rem-${i}`}
          className="px-2 py-0.5 rounded-sm"
          style={{ background: 'color-mix(in srgb, var(--status-error) 8%, transparent)' }}
        >
          <pre
            className="m-0 text-[11px] leading-[18px] line-through"
            style={{ color: 'var(--status-error)' }}
          >
            - {formatRelation(r)}
          </pre>
        </div>
      ))}
      {added.map((r, i) => (
        <div
          key={`add-${i}`}
          className="px-2 py-0.5 rounded-sm"
          style={{ background: 'color-mix(in srgb, var(--status-success) 8%, transparent)' }}
        >
          <pre
            className="m-0 text-[11px] leading-[18px]"
            style={{ color: 'var(--status-success)' }}
          >
            + {formatRelation(r)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ── Stats badge ───────────────────────────────────────────────────────────────

function DiffStatsBadge({ diff }: { diff: TreeDiff }) {
  const total =
    diff.identical.length +
    diff.modified.length +
    diff.onlyInSource.length +
    diff.onlyInTarget.length;

  return (
    <div className="flex items-center gap-3 text-xs px-2 py-1.5">
      <span style={{ color: 'var(--text-tertiary)' }}>{total} trees</span>
      {diff.identical.length > 0 && (
        <span style={{ color: 'var(--text-tertiary)' }}>{diff.identical.length} unchanged</span>
      )}
      {diff.modified.length > 0 && (
        <span style={{ color: 'var(--diff-modified-accent, var(--text-secondary))' }}>
          ~{diff.modified.length} modified
        </span>
      )}
      {diff.onlyInSource.length > 0 && (
        <span style={{ color: 'var(--status-error)' }}>-{diff.onlyInSource.length} removed</span>
      )}
      {diff.onlyInTarget.length > 0 && (
        <span style={{ color: 'var(--status-success)' }}>+{diff.onlyInTarget.length} added</span>
      )}
      {(diff.relationsAdded.length > 0 || diff.relationsRemoved.length > 0) && (
        <span style={{ color: 'var(--text-tertiary)' }}>
          {diff.relationsAdded.length + diff.relationsRemoved.length} relation change
          {diff.relationsAdded.length + diff.relationsRemoved.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function YAMLDiff({ diff, sourceContent, targetContent, className }: YAMLDiffProps) {
  const isEmpty =
    diff.identical.length === 0 &&
    diff.modified.length === 0 &&
    diff.onlyInSource.length === 0 &&
    diff.onlyInTarget.length === 0 &&
    diff.relationsAdded.length === 0 &&
    diff.relationsRemoved.length === 0;

  if (isEmpty) {
    return (
      <div
        className={cn('text-center py-8 text-sm', className)}
        style={{
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        }}
      >
        No differences detected.
      </div>
    );
  }

  return (
    <div
      className={cn('rounded-md overflow-auto', className)}
      style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        background: 'var(--surface-panel)',
        border: '1px solid var(--stroke-default)',
      }}
    >
      {/* Stats */}
      <DiffStatsBadge diff={diff} />

      <div className="px-1 pb-2" style={{ borderTop: '1px solid var(--stroke-divider)' }}>
        {/* Modified trees */}
        {diff.modified.map((entry) => (
          <ModifiedNodeBlock key={entry.path} entry={entry} />
        ))}

        {/* Added paths (only in target) */}
        {diff.onlyInTarget.map((path) => {
          const nodes = targetContent ? treesToNodes(targetContent.trees) : [];
          const node = nodes.find((f) => f.id === path);
          return node ? <AddedNodeBlock key={path} node={node} /> : null;
        })}

        {/* Removed paths (only in source) */}
        {diff.onlyInSource.map((path) => {
          const nodes = sourceContent ? treesToNodes(sourceContent.trees) : [];
          const node = nodes.find((f) => f.id === path);
          return node ? <RemovedNodeBlock key={path} node={node} /> : null;
        })}

        {/* Identical paths (collapsible, at bottom) */}
        <IdenticalSection paths={diff.identical} />

        {/* Relation changes */}
        <RelationChanges added={diff.relationsAdded} removed={diff.relationsRemoved} />
      </div>
    </div>
  );
}
