'use client';

import type { TreeNode } from '@t3x-dev/core';
import {
  TREE_BASE_PADDING,
  TREE_INDENT_STEP,
  TREE_ROW_HEIGHT,
} from '@/components/chat/treeRowMetrics';
import { useParentCommit } from '@/hooks/commits/useParentCommit';
import { useWorkspaceStore } from '@/store/workspaceStore';

function TreeRow({ node, path, depth = 0 }: { node: TreeNode; path: string; depth?: number }) {
  const select = useWorkspaceStore((s) => s.select);
  const selectedNodePath = useWorkspaceStore((s) => s.selectedNodePath);
  const isSelected = selectedNodePath === path;
  const slots = node.slots || {};
  const slotEntries = Object.entries(slots).filter(([key]) => !key.startsWith('_'));

  return (
    <>
      <div
        className={`border-b border-black/[0.025] ${isSelected ? 'bg-[var(--source-dim)]' : ''}`}
      >
        <div
          className="flex items-center gap-1 px-2 font-mono text-[10px] font-semibold cursor-pointer hover:bg-black/[0.02]"
          style={{
            height: TREE_ROW_HEIGHT,
            paddingLeft: `${TREE_BASE_PADDING + depth * TREE_INDENT_STEP}px`,
          }}
          onClick={() => select('before', { nodePath: path })}
        >
          <span className="text-[8px] text-[var(--text-tertiary)] mr-1">◆</span>
          <span className="text-[var(--text-secondary)]">{node.key}</span>
          <span className="text-[var(--text-tertiary)]">:</span>
        </div>
      </div>

      {slotEntries.map(([key, value]) => (
        <div key={key} className="border-b border-black/[0.025]">
          <div
            className="flex items-center gap-1 px-2 font-mono text-[10px] hover:bg-black/[0.02]"
            style={{
              height: TREE_ROW_HEIGHT,
              paddingLeft: `${TREE_BASE_PADDING + (depth + 1) * TREE_INDENT_STEP}px`,
            }}
          >
            <span className="text-[var(--text-secondary)] shrink-0">{key}</span>
            <span className="text-[var(--text-tertiary)] shrink-0">:</span>
            <span className="text-[var(--text-secondary)] truncate">{String(value)}</span>
          </div>
        </div>
      ))}

      {node.children?.map((child) => (
        <TreeRow key={child.key} node={child} path={`${path}/${child.key}`} depth={depth + 1} />
      ))}
    </>
  );
}

export function BeforePanel() {
  const parent = useParentCommit();
  const trees: TreeNode[] = parent?.trees ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)] shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Before <span className="opacity-80">🔒</span>
        </span>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60 truncate max-w-[150px]">
          {parent?.message ?? (parent ? parent.hash.replace(/^sha256:/, '').slice(0, 6) : 'empty')}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trees.length === 0 ? (
          <div className="text-center text-[10px] text-[var(--text-tertiary)] opacity-40 italic py-5">
            {parent ? 'Parent commit is empty' : 'No prior commits'}
          </div>
        ) : (
          trees.map((tree) => <TreeRow key={tree.key} node={tree} path={tree.key} />)
        )}
      </div>
    </div>
  );
}
