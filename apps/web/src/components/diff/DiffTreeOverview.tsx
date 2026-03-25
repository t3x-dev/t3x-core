'use client';

import type { FrameDiff, SemanticContent } from '@t3x-dev/core';
import {
  buildDiffStatusMap,
  buildFrameTree,
  deriveRootFrameId,
  type TreeNode,
} from './DiffYAMLUtils';

// ── Props ──

interface DiffTreeOverviewProps {
  diff: FrameDiff;
  baseContent: SemanticContent;
  targetContent: SemanticContent;
}

// ── Status helpers ──

const STATUS_BADGE: Record<TreeNode['diffStatus'], { char: string; color: string; bg?: string }> = {
  modified: {
    char: '~',
    color: 'var(--dy-modified-accent)',
    bg: 'var(--dy-modified-bg)',
  },
  added: {
    char: '+',
    color: 'var(--dy-added-accent)',
    bg: 'var(--dy-added-bg)',
  },
  removed: {
    char: '-',
    color: 'var(--dy-removed-accent)',
    bg: 'var(--dy-removed-bg)',
  },
  identical: { char: '=', color: 'var(--text-tertiary)' },
};

// ── Recursive tree node renderer ──

function TreeNodeLine({ node, isLast, depth }: { node: TreeNode; isLast: boolean; depth: number }) {
  const badge = STATUS_BADGE[node.diffStatus];
  const isRemoved = node.diffStatus === 'removed';
  const isAdded = node.diffStatus === 'added';

  return (
    <>
      <div
        className="flex items-center gap-[2px]"
        style={{ paddingLeft: depth > 0 ? `${depth * 10}px` : '4px' }}
      >
        {depth > 0 && (
          <span
            className="select-none shrink-0"
            style={{
              color: 'var(--stroke-pane-border)',
              fontSize: '8px',
              minWidth: '10px',
            }}
          >
            {isLast ? '\u2514' : '\u251C'}
          </span>
        )}
        <span
          className="font-semibold shrink-0"
          style={{
            fontSize: '8px',
            padding: '0 3px',
            borderRadius: '3px',
            color: badge.color,
            background: badge.bg,
          }}
        >
          {badge.char}
        </span>
        <span
          style={{
            fontSize: '9.5px',
            color: isRemoved
              ? undefined
              : isAdded
                ? 'var(--dy-added-accent)'
                : 'var(--text-secondary)',
            textDecoration: isRemoved ? 'line-through' : undefined,
            opacity: isRemoved ? 0.5 : undefined,
          }}
        >
          {node.frameType}
        </span>
        {node.relationToParent && (
          <span
            style={{
              fontSize: '8px',
              opacity: 0.4,
              marginLeft: '3px',
            }}
          >
            {node.relationToParent}
          </span>
        )}
      </div>
      {node.children.map((child, i) => (
        <TreeNodeLine
          key={child.frameId}
          node={child}
          isLast={i === node.children.length - 1}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

function TreeColumn({
  label,
  labelColor,
  trees,
}: {
  label: string;
  labelColor: string;
  trees: TreeNode[];
}) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="font-semibold uppercase mb-[3px]"
        style={{
          fontSize: '8px',
          color: labelColor,
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: '9.5px',
          lineHeight: '16px',
          color: 'var(--text-tertiary)',
        }}
      >
        {trees.map((root, i) => (
          <TreeNodeLine key={root.frameId} node={root} isLast={i === trees.length - 1} depth={0} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ──

export function DiffTreeOverview({ diff, baseContent, targetContent }: DiffTreeOverviewProps) {
  const diffStatusMap = buildDiffStatusMap(diff);

  // Build trees for base and target sides
  const baseRootId = deriveRootFrameId(baseContent);
  const targetRootId = deriveRootFrameId(targetContent);

  // For base tree: removed frames show as "removed", others show their status
  const baseTree = buildFrameTree(baseContent, diffStatusMap, baseRootId);
  // For target tree: added frames show as "added", others show their status
  const targetTree = buildFrameTree(targetContent, diffStatusMap, targetRootId);

  // Derive root info for display
  const baseRoot = baseRootId ? baseContent.frames.find((f) => f.id === baseRootId) : undefined;

  return (
    <div className="text-[11px]">
      {/* Section 1: Topic diff */}
      <div className="mb-3">
        <div
          className="font-semibold uppercase mb-[6px]"
          style={{
            fontSize: '9px',
            letterSpacing: '0.8px',
            color: 'var(--text-tertiary)',
          }}
        >
          Topic
        </div>
        {diff.topicChanged ? (
          <div className="font-mono" style={{ fontSize: '10.5px', lineHeight: 1.6 }}>
            <div className="flex items-baseline gap-1">
              <span
                className="font-semibold shrink-0"
                style={{
                  color: 'var(--dy-removed-accent)',
                  fontSize: '9px',
                }}
              >
                BASE
              </span>
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  textDecoration: 'line-through',
                }}
              >
                {diff.topicChanged.oldTopic ? `"${diff.topicChanged.oldTopic}"` : '(none)'}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span
                className="font-semibold shrink-0"
                style={{
                  color: 'var(--dy-added-accent)',
                  fontSize: '9px',
                }}
              >
                NEW
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {diff.topicChanged.newTopic ? `"${diff.topicChanged.newTopic}"` : '(none)'}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="font-mono"
            style={{
              fontSize: '10.5px',
              color: 'var(--text-secondary)',
            }}
          >
            {baseContent.topic ? `"${baseContent.topic}"` : '(no topic)'}
          </div>
        )}
      </div>

      {/* Section 2: Root change */}
      <div className="mb-3">
        <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
          {diff.rootChanged ? (
            <>
              root:{' '}
              <span
                style={{
                  textDecoration: 'line-through',
                  color: 'var(--dy-removed-accent)',
                }}
              >
                {diff.rootChanged.oldRoot ?? '(none)'}
              </span>
              {' \u2192 '}
              <span style={{ color: 'var(--dy-added-accent)' }}>
                {diff.rootChanged.newRoot ?? '(none)'}
              </span>
            </>
          ) : (
            <>
              root: {baseRoot?.type ?? '?'}{' '}
              <span style={{ fontSize: '9px', opacity: 0.5 }}>{baseRootId}</span>{' '}
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: '9px',
                }}
              >
                (unchanged)
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className="my-[10px]"
        style={{
          borderTop: '1px solid var(--stroke-divider)',
        }}
      />

      {/* Section 3: Structure mini-map */}
      <div className="mb-3">
        <div
          className="font-semibold uppercase mb-[6px]"
          style={{
            fontSize: '9px',
            letterSpacing: '0.8px',
            color: 'var(--text-tertiary)',
          }}
        >
          Structure
        </div>
        <div className="flex gap-2">
          <TreeColumn label="Base" labelColor="var(--dy-removed-accent)" trees={baseTree} />
          <TreeColumn label="Target" labelColor="var(--dy-added-accent)" trees={targetTree} />
        </div>
      </div>
    </div>
  );
}
