'use client';

import type { TreeNode } from '@t3x-dev/core';
import { CommittedNodesList } from './CommittedNodesList';
import { ExtractNudge } from './ExtractNudge';

interface IdleViewProps {
  committedNodes: TreeNode[];
  commitHash: string | null;
  turnsSinceLastExtract: number;
}

export function IdleView({ committedNodes, commitHash, turnsSinceLastExtract }: IdleViewProps) {
  const hasCommits = committedNodes.length > 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {hasCommits ? (
          <>
            <CommittedNodesList nodes={committedNodes} commitHash={commitHash} />
            <ExtractNudge turnCount={turnsSinceLastExtract} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-6 gap-3 text-center">
            <div className="text-4xl opacity-[0.12]">&#9878;</div>
            <div className="text-[11px] text-[var(--text-tertiary)] leading-[1.7]">
              Chat with the AI, then click <strong className="text-[var(--accent)]">Extract</strong>
              <br />
              when you want to save key points.
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)] opacity-60 mt-1">
              Keyboard shortcut: Cmd+E
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
