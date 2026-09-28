import type { WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { diffCommits, type NativeYValue, yvalueToTrees } from '@t3x-dev/core';
import { useMemo } from 'react';
import { DiffTreeOverview } from '@/components/diff/DiffTreeOverview';
import { YAMLDiff } from '@/components/diff/YAMLDiff';

/** A display projection of the selected node; it never supplies a command or replay basis. */
export function DraftNodeChangeDetail({ card }: { card: WorkspaceAuthoringCard }) {
  const { baseContent, targetContent, diff } = useMemo(() => {
    const content = (value: unknown) => ({
      trees: yvalueToTrees(
        value === undefined ? {} : { changed_node: { value: value as NativeYValue } }
      ),
      relations: [],
    });
    const baseContent = content(card.before),
      targetContent = content(card.after);
    return { baseContent, targetContent, diff: diffCommits(baseContent, targetContent) };
  }, [card.before, card.after]);
  return (
    <details className="rounded-lg border border-[var(--stroke-divider)] p-3">
      <summary className="cursor-pointer text-xs font-medium">
        Selected change · structure and details
      </summary>
      <p className="my-2 text-[10px] text-[var(--text-secondary)]">
        Selected node subtree. Historical before → after; current value is shown separately below.
      </p>
      <div className="max-h-64 overflow-auto">
        <DiffTreeOverview diff={diff} baseContent={baseContent} targetContent={targetContent} />
        <YAMLDiff diff={diff} sourceContent={baseContent} targetContent={targetContent} />
      </div>
    </details>
  );
}
