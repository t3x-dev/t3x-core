'use client';

import type { TreeNode } from '@t3x-dev/core';
import { useParentCommit } from '@/hooks/commits/useParentCommit';
import { useWorkspaceStore } from '@/store/workspaceStore';

function TreeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const select = useWorkspaceStore((s) => s.select);
  const selectedNodePath = useWorkspaceStore((s) => s.selectedNodePath);
  const isSelected = selectedNodePath === node.key;
  const slots = node.slots || {};
  const slotEntries = Object.entries(slots).filter(([k]) => !k.startsWith('_'));
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      <div
        className={`flex items-center gap-1 px-3 py-0.5 text-[10px] font-mono cursor-pointer hover:bg-[var(--hover-bg)] ${isSelected ? 'bg-[var(--source-dim)]' : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => select('before', { nodePath: node.key })}
      >
        <span className="text-[8px] text-[var(--text-tertiary)] w-2">{hasChildren ? '▾' : ''}</span>
        <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold bg-[var(--source-dim)] text-[var(--source)]">◆</span>
        <span className="text-[var(--text-primary)]">{node.key}</span>
      </div>
      {slotEntries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-center gap-1 px-3 py-0.5 text-[10px] font-mono hover:bg-[var(--hover-bg)]"
          style={{ paddingLeft: `${12 + (depth + 1) * 14}px` }}
        >
          <span className="w-2" />
          <span className="w-3 h-3 rounded flex items-center justify-center text-[12px] bg-[var(--slot-dim)] text-[var(--slot)]">·</span>
          <span className="text-[var(--text-primary)]">{key}</span>
          <span className="ml-auto text-[9px] text-[var(--text-tertiary)] truncate max-w-[100px]">{String(value)}</span>
        </div>
      ))}
      {hasChildren && node.children.map((child: TreeNode) => (
        <TreeRow key={child.key} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function BeforePanel() {
  const parent = useParentCommit();
  const trees: TreeNode[] = parent?.trees ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Before <span className="opacity-80">🔒</span>
        </span>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60">
          {parent ? parent.hash.replace(/^sha256:/, '').slice(0, 6) : 'empty'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {trees.length === 0 ? (
          <div className="text-center text-[10px] text-[var(--text-tertiary)] opacity-40 italic py-5">
            {parent ? 'Parent commit is empty' : 'No prior commits'}
          </div>
        ) : (
          trees.map((tree) => <TreeRow key={tree.key} node={tree} />)
        )}
      </div>
    </div>
  );
}
