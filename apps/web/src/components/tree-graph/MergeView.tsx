'use client';

import type {
  Relation,
  SemanticContent,
  SlotValue,
  TreeNode,
} from '@t3x-dev/core';
import { flattenTrees, prepareMerge } from '@t3x-dev/core';

import {
  AlertTriangle,
  Check,
  GitMerge,
  Plus,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ConflictCard } from './merge-view/ConflictCard';
import { RelationSideSection } from './merge-view/RelationSideSection';
import { SideOnlySection } from './merge-view/SideOnlySection';
import {
  type ConflictResolution,
  type SlotChoice,
  findNodeByPathLocal,
  lookupNode,
} from './merge-view/mergeViewHelpers';

// ── Props ──

export interface MergeViewProps {
  base: SemanticContent;
  source: SemanticContent;
  target: SemanticContent;
  onResolved: (result: SemanticContent) => void;
  /** Merge draft ID – enables the AI suggestion button on conflict cards */
  mergeId?: string;
  className?: string;
}

// ── Main Component ──

export function MergeView({
  base,
  source,
  target,
  onResolved,
  mergeId,
  className,
}: MergeViewProps) {
  // Compute merge result
  const mergeResult = useMemo(
    () => prepareMerge(base, source, target),
    [base, source, target]
  );

  // Flatten source/target for node lookup
  const sourceFlatNodes = useMemo(() => flattenTrees(source.trees), [source]);
  const targetFlatNodes = useMemo(() => flattenTrees(target.trees), [target]);

  // ── State: conflict resolutions ──
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, ConflictResolution>
  >(() => {
    const init: Record<string, ConflictResolution> = {};
    for (const c of mergeResult.conflicts) {
      init[c.path] = { slotChoices: {} };
    }
    return init;
  });

  // ── State: side-only path inclusion ──
  const [includedSource, setIncludedSource] = useState<Set<string>>(
    () => new Set(mergeResult.onlyInSource)
  );
  const [includedTarget, setIncludedTarget] = useState<Set<string>>(
    () => new Set(mergeResult.onlyInTarget)
  );

  // ── State: side-only relation inclusion ──
  const relKey = (r: Relation) => `${r.from}-${r.type}-${r.to}`;
  const [includedSourceRels, setIncludedSourceRels] = useState<Set<string>>(
    () => new Set(mergeResult.relationsOnlyInSource.map(relKey))
  );
  const [includedTargetRels, setIncludedTargetRels] = useState<Set<string>>(
    () => new Set(mergeResult.relationsOnlyInTarget.map(relKey))
  );

  // ── Handlers ──

  const handleSlotChoose = useCallback((path: string, slotKey: string, choice: SlotChoice) => {
    setConflictResolutions((prev) => ({
      ...prev,
      [path]: {
        ...prev[path],
        slotChoices: { ...prev[path].slotChoices, [slotKey]: choice },
      },
    }));
  }, []);

  const toggleSourcePath = useCallback((path: string) => {
    setIncludedSource((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleTargetPath = useCallback((path: string) => {
    setIncludedTarget((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleSourceRel = useCallback((key: string) => {
    setIncludedSourceRels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleTargetRel = useCallback((key: string) => {
    setIncludedTargetRels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Readiness check ──

  const allConflictsResolved = useMemo(() => {
    return mergeResult.conflicts.every((c) => {
      const res = conflictResolutions[c.path];
      return c.slotConflicts.every((sc) => res?.slotChoices[sc.key]);
    });
  }, [mergeResult.conflicts, conflictResolutions]);

  // ── Apply merge ──

  const handleApply = useCallback(() => {
    // 1. Start with auto-kept nodes (from source trees since they're identical)
    const trees: TreeNode[] = [];

    // Helper: find tree node by path from source or target
    const findTreeNode = (path: string): TreeNode | null => {
      return findNodeByPathLocal(source.trees, path) ?? findNodeByPathLocal(target.trees, path);
    };

    // Auto-kept: take from source (they're the same)
    for (const path of mergeResult.autoKept) {
      const node = findTreeNode(path);
      if (node) trees.push(node);
    }

    // 2. Build resolved conflict nodes
    for (const c of mergeResult.conflicts) {
      const res = conflictResolutions[c.path];
      const sourceNode = lookupNode(sourceFlatNodes, c.path);
      const targetNode = lookupNode(targetFlatNodes, c.path);

      if (!sourceNode && !targetNode) continue;

      const mergedSlots: Record<string, SlotValue> = { ...(sourceNode?.slots ?? {}) };

      // Apply non-conflicting slots from both sides
      if (targetNode) {
        for (const key of Object.keys(targetNode.slots)) {
          if (!(key in mergedSlots)) {
            mergedSlots[key] = targetNode.slots[key];
          }
        }
      }

      // Apply conflict choices
      for (const sc of c.slotConflicts) {
        const choice = res.slotChoices[sc.key];
        if (choice === 'source' && sc.sourceValue !== undefined) {
          mergedSlots[sc.key] = sc.sourceValue;
        } else if (choice === 'target' && sc.targetValue !== undefined) {
          mergedSlots[sc.key] = sc.targetValue;
        } else if (choice === 'source' && sc.sourceValue === undefined) {
          delete mergedSlots[sc.key];
        } else if (choice === 'target' && sc.targetValue === undefined) {
          delete mergedSlots[sc.key];
        }
      }

      trees.push({
        key: c.path.split('/').pop() ?? c.path,
        slots: mergedSlots,
        children: [],
      });
    }

    // 3. Add included side-only nodes
    for (const path of mergeResult.onlyInSource) {
      if (includedSource.has(path)) {
        const node = findTreeNode(path);
        if (node) trees.push(node);
      }
    }
    for (const path of mergeResult.onlyInTarget) {
      if (includedTarget.has(path)) {
        const node = findTreeNode(path);
        if (node) trees.push(node);
      }
    }

    // 4. Build relations
    const relations: Relation[] = [...mergeResult.relationsInBoth];
    for (const r of mergeResult.relationsOnlyInSource) {
      if (includedSourceRels.has(relKey(r))) relations.push(r);
    }
    for (const r of mergeResult.relationsOnlyInTarget) {
      if (includedTargetRels.has(relKey(r))) relations.push(r);
    }

    onResolved({ trees, relations });
  }, [
    mergeResult,
    conflictResolutions,
    includedSource,
    includedTarget,
    includedSourceRels,
    includedTargetRels,
    source,
    target,
    sourceFlatNodes,
    targetFlatNodes,
    onResolved,
  ]);

  // ── Summary counts ──
  const totalConflictSlots = mergeResult.conflicts.reduce(
    (sum, c) => sum + c.slotConflicts.length,
    0
  );
  const resolvedSlots = mergeResult.conflicts.reduce(
    (sum, c) =>
      sum +
      c.slotConflicts.filter((sc) => conflictResolutions[c.path]?.slotChoices[sc.key]).length,
    0
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-[var(--source)]" />
          <h3 className="text-base font-semibold">Tree Merge</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          {mergeResult.autoKept.length > 0 && (
            <Badge variant="secondary">{mergeResult.autoKept.length} auto-resolved</Badge>
          )}
          {mergeResult.conflicts.length > 0 && (
            <Badge variant={allConflictsResolved ? 'default' : 'destructive'}>
              {resolvedSlots}/{totalConflictSlots} slots resolved
            </Badge>
          )}
        </div>
      </div>

      {/* Conflicts section */}
      {mergeResult.conflicts.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--status-error)] flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Conflicts ({mergeResult.conflicts.length} tree
            {mergeResult.conflicts.length !== 1 ? 's' : ''})
          </h4>
          {mergeResult.conflicts.map((c) => (
            <ConflictCard
              key={c.path}
              conflict={c}
              sourceNode={lookupNode(sourceFlatNodes, c.path)}
              targetNode={lookupNode(targetFlatNodes, c.path)}
              resolution={conflictResolutions[c.path]}
              onSlotChoose={handleSlotChoose}
              mergeId={mergeId}
            />
          ))}
        </div>
      )}

      {/* Only in source */}
      <SideOnlySection
        title="Only in Source (Branch A)"
        icon={<Plus className="h-4 w-4 text-[var(--status-info)]" />}
        paths={mergeResult.onlyInSource}
        flatNodes={sourceFlatNodes}
        included={includedSource}
        onToggle={toggleSourcePath}
        colorClass="bg-[var(--status-info-muted)] text-[var(--status-info)]"
      />

      {/* Only in target */}
      <SideOnlySection
        title="Only in Target (Branch B)"
        icon={<Plus className="h-4 w-4 text-[var(--status-success)]" />}
        paths={mergeResult.onlyInTarget}
        flatNodes={targetFlatNodes}
        included={includedTarget}
        onToggle={toggleTargetPath}
        colorClass="bg-[var(--status-success-muted)] text-[var(--status-success)]"
      />

      {/* Relations */}
      {(mergeResult.relationsOnlyInSource.length > 0 ||
        mergeResult.relationsOnlyInTarget.length > 0) && (
        <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-700 pt-3">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Relations</h4>
          <RelationSideSection
            title="Only in Source"
            relations={mergeResult.relationsOnlyInSource}
            included={includedSourceRels}
            onToggle={toggleSourceRel}
          />
          <RelationSideSection
            title="Only in Target"
            relations={mergeResult.relationsOnlyInTarget}
            included={includedTargetRels}
            onToggle={toggleTargetRel}
          />
        </div>
      )}

      {/* Auto-kept summary */}
      {mergeResult.autoKept.length > 0 && (
        <div className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
            <span>
              {mergeResult.autoKept.length} tree{mergeResult.autoKept.length !== 1 ? 's' : ''}{' '}
              auto-resolved (identical or non-conflicting changes)
            </span>
          </div>
        </div>
      )}

      {/* No conflicts message */}
      {mergeResult.conflicts.length === 0 &&
        mergeResult.onlyInSource.length === 0 &&
        mergeResult.onlyInTarget.length === 0 && (
          <div className="text-center py-6 text-sm text-zinc-500 dark:text-zinc-400">
            No conflicts detected. All trees are identical.
          </div>
        )}

      {/* Apply button */}
      <div className="flex justify-end pt-2 border-t border-zinc-200 dark:border-zinc-700">
        <Button onClick={handleApply} disabled={!allConflictsResolved} className="gap-1.5">
          <GitMerge className="h-4 w-4" />
          {allConflictsResolved
            ? 'Apply Merge'
            : `Resolve ${totalConflictSlots - resolvedSlots} remaining`}
        </Button>
      </div>
    </div>
  );
}
