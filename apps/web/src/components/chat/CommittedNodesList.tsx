'use client';

import type { TreeNode } from '@t3x-dev/core';
import { Check } from 'lucide-react';

interface CommittedNodesListProps {
  nodes: TreeNode[];
  commitHash?: string | null;
}

function slotCount(node: TreeNode): number {
  return Object.keys(node.slots).length;
}

export function CommittedNodesList({ nodes, commitHash }: CommittedNodesListProps) {
  if (nodes.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between px-3.5 py-[7px] text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] bg-white/[0.015] border-b border-[var(--stroke-default)]">
        <span>Committed</span>
        <span className="font-normal">
          {commitHash ? `${commitHash.slice(0, 12)}...` : 'from previous extraction'}
        </span>
      </div>
      <div className="py-0.5 opacity-50">
        {nodes.map((node) => (
          <div
            key={node.key}
            className="flex items-center gap-1.5 px-2.5 py-[5px] min-h-[28px] cursor-pointer hover:bg-white/[0.04]"
          >
            <div className="w-1 self-stretch bg-[var(--status-success)] opacity-25 rounded-sm" />
            <Check className="w-[10px] h-[10px] text-[var(--status-success)] opacity-40 shrink-0" />
            <span className="flex-1 text-[11px] font-mono text-[var(--text-tertiary)]">
              {node.key}:
            </span>
            <span className="text-[9px] px-1.5 py-px rounded-lg bg-white/[0.04] text-[var(--text-tertiary)]">
              {slotCount(node)} slots
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
