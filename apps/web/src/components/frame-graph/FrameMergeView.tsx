'use client';

import type {
  Frame,
  FrameMergeResult,
  Relation,
  SemanticContent,
  SlotConflict,
  SlotValue,
} from '@t3x/core';
import { prepareFrameMerge } from '@t3x/core';
import { AlertTriangle, Check, ChevronDown, ChevronRight, GitMerge, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// ── Props ──

export interface FrameMergeViewProps {
  base: SemanticContent;
  source: SemanticContent;
  target: SemanticContent;
  onResolved: (result: SemanticContent) => void;
  className?: string;
}

// ── Slot conflict resolution state ──

type SlotChoice = 'source' | 'target';

interface ConflictResolution {
  /** Per-slot choices: key → 'source' | 'target' */
  slotChoices: Record<string, SlotChoice>;
}

// ── Helpers ──

function toTitleCase(s: string): string {
  return s
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function formatSlotValue(v: SlotValue | undefined): string {
  if (v === undefined) return '(none)';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v)) return `[${v.map(formatSlotValue).join(', ')}]`;
  if (typeof v === 'object' && v !== null && 'ref' in v) return `-> ${(v as { ref: string }).ref}`;
  if (typeof v === 'object' && v !== null && 'type' in v)
    return `{${(v as { type: string }).type}}`;
  return String(v);
}

// ── Sub-components ──

function SlotConflictRow({
  conflict,
  choice,
  onChoose,
}: {
  conflict: SlotConflict;
  choice: SlotChoice | undefined;
  onChoose: (key: string, choice: SlotChoice) => void;
}) {
  return (
    <div className="rounded border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" />
        <span className="font-mono">{conflict.key}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Source (Branch A) */}
        <button
          type="button"
          onClick={() => onChoose(conflict.key, 'source')}
          className={cn(
            'text-left rounded border p-2 text-xs transition-colors cursor-pointer',
            choice === 'source'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
          )}
        >
          <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">
            Branch A (Source)
          </div>
          <div className="font-mono text-foreground">{formatSlotValue(conflict.sourceValue)}</div>
        </button>

        {/* Target (Branch B) */}
        <button
          type="button"
          onClick={() => onChoose(conflict.key, 'target')}
          className={cn(
            'text-left rounded border p-2 text-xs transition-colors cursor-pointer',
            choice === 'target'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
          )}
        >
          <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">
            Branch B (Target)
          </div>
          <div className="font-mono text-foreground">{formatSlotValue(conflict.targetValue)}</div>
        </button>
      </div>
    </div>
  );
}

function AgreedSlotRow({ slotKey, value }: { slotKey: string; value: SlotValue }) {
  return (
    <div className="flex items-start gap-1.5 text-xs font-mono px-1">
      <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{slotKey}:</span>
      <span className="text-foreground">{formatSlotValue(value)}</span>
    </div>
  );
}

function ConflictCard({
  conflict,
  resolution,
  onSlotChoose,
}: {
  conflict: FrameMergeResult['conflicts'][number];
  resolution: ConflictResolution;
  onSlotChoose: (frameId: string, slotKey: string, choice: SlotChoice) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { frameId, sourceFrame, targetFrame, slotConflicts } = conflict;

  // Find agreed-upon slots (present in both, not conflicting)
  const conflictKeys = new Set(slotConflicts.map((c) => c.key));
  const allKeys = new Set([...Object.keys(sourceFrame.slots), ...Object.keys(targetFrame.slots)]);
  const agreedSlots: Array<{ key: string; value: SlotValue }> = [];
  for (const key of allKeys) {
    if (!conflictKeys.has(key) && key in sourceFrame.slots) {
      agreedSlots.push({ key, value: sourceFrame.slots[key] });
    }
  }

  const resolvedCount = slotConflicts.filter((c) => resolution.slotChoices[c.key]).length;
  const allResolved = resolvedCount === slotConflicts.length;

  return (
    <div
      className={cn(
        'rounded-lg border-2 overflow-hidden',
        allResolved
          ? 'border-green-400 dark:border-green-600'
          : 'border-red-400 dark:border-red-600'
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer',
          'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors'
        )}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-mono text-red-700 dark:text-red-400">{frameId}</span>
        <span className="text-zinc-500 dark:text-zinc-400">{toTitleCase(sourceFrame.type)}</span>
        <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
          {resolvedCount}/{slotConflicts.length} resolved
        </span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2 bg-white dark:bg-zinc-900">
          {/* Agreed slots */}
          {agreedSlots.length > 0 && (
            <div className="space-y-0.5">
              {agreedSlots.map((s) => (
                <AgreedSlotRow key={s.key} slotKey={s.key} value={s.value} />
              ))}
            </div>
          )}

          {/* Conflicting slots */}
          {slotConflicts.map((sc) => (
            <SlotConflictRow
              key={sc.key}
              conflict={sc}
              choice={resolution.slotChoices[sc.key]}
              onChoose={(key, choice) => onSlotChoose(frameId, key, choice)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SideOnlySection({
  title,
  icon,
  frames,
  included,
  onToggle,
  colorClass,
}: {
  title: string;
  icon: React.ReactNode;
  frames: Frame[];
  included: Set<string>;
  onToggle: (id: string) => void;
  colorClass: string;
}) {
  const [expanded, setExpanded] = useState(frames.length <= 5);

  if (frames.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:opacity-80"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {icon}
        <span>{title}</span>
        <Badge variant="secondary" className="ml-1 text-[10px]">
          {frames.length}
        </Badge>
      </button>

      {expanded && (
        <div className="space-y-1 pl-6">
          {frames.map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => onToggle(f.id)}
              className={cn(
                'flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors w-full text-left',
                included.has(f.id)
                  ? `${colorClass} border-current/20`
                  : 'border-zinc-200 dark:border-zinc-700 opacity-50'
              )}
            >
              <Checkbox checked={included.has(f.id)} tabIndex={-1} />
              <span className="font-mono text-zinc-600 dark:text-zinc-300">{f.id}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{toTitleCase(f.type)}</span>
              <span className="ml-auto text-zinc-400">
                {Object.keys(f.slots).length} slot{Object.keys(f.slots).length !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RelationSideSection({
  title,
  relations,
  included,
  onToggle,
}: {
  title: string;
  relations: Relation[];
  included: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (relations.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="space-y-0.5 pl-2">
        {relations.map((r) => {
          const key = `${r.from}-${r.type}-${r.to}`;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onToggle(key)}
              className="flex items-center gap-2 text-xs font-mono cursor-pointer"
            >
              <Checkbox checked={included.has(key)} tabIndex={-1} />
              <span>
                {r.from} <span className="text-zinc-400">--{r.type}--&gt;</span> {r.to}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──

export function FrameMergeView({
  base,
  source,
  target,
  onResolved,
  className,
}: FrameMergeViewProps) {
  // Compute merge result
  const mergeResult = useMemo(
    () => prepareFrameMerge(base, source, target),
    [base, source, target]
  );

  // ── State: conflict resolutions ──
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, ConflictResolution>
  >(() => {
    const init: Record<string, ConflictResolution> = {};
    for (const c of mergeResult.conflicts) {
      init[c.frameId] = { slotChoices: {} };
    }
    return init;
  });

  // ── State: side-only frame inclusion ──
  const [includedSource, setIncludedSource] = useState<Set<string>>(
    () => new Set(mergeResult.onlyInSource.map((f) => f.id))
  );
  const [includedTarget, setIncludedTarget] = useState<Set<string>>(
    () => new Set(mergeResult.onlyInTarget.map((f) => f.id))
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

  const handleSlotChoose = useCallback((frameId: string, slotKey: string, choice: SlotChoice) => {
    setConflictResolutions((prev) => ({
      ...prev,
      [frameId]: {
        ...prev[frameId],
        slotChoices: { ...prev[frameId].slotChoices, [slotKey]: choice },
      },
    }));
  }, []);

  const toggleSourceFrame = useCallback((id: string) => {
    setIncludedSource((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTargetFrame = useCallback((id: string) => {
    setIncludedTarget((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      const res = conflictResolutions[c.frameId];
      return c.slotConflicts.every((sc) => res?.slotChoices[sc.key]);
    });
  }, [mergeResult.conflicts, conflictResolutions]);

  // ── Apply merge ──

  const handleApply = useCallback(() => {
    // 1. Start with auto-kept frames
    const frames: Frame[] = [...mergeResult.autoKept];

    // 2. Build resolved conflict frames
    for (const c of mergeResult.conflicts) {
      const res = conflictResolutions[c.frameId];
      const mergedSlots: Record<string, SlotValue> = { ...c.sourceFrame.slots };

      // Apply non-conflicting slots from both sides
      for (const key of Object.keys(c.targetFrame.slots)) {
        if (!(key in mergedSlots)) {
          mergedSlots[key] = c.targetFrame.slots[key];
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

      frames.push({
        ...c.sourceFrame,
        slots: mergedSlots,
      });
    }

    // 3. Add included side-only frames
    for (const f of mergeResult.onlyInSource) {
      if (includedSource.has(f.id)) frames.push(f);
    }
    for (const f of mergeResult.onlyInTarget) {
      if (includedTarget.has(f.id)) frames.push(f);
    }

    // 4. Build relations
    const relations: Relation[] = [...mergeResult.relationsInBoth];
    for (const r of mergeResult.relationsOnlyInSource) {
      if (includedSourceRels.has(relKey(r))) relations.push(r);
    }
    for (const r of mergeResult.relationsOnlyInTarget) {
      if (includedTargetRels.has(relKey(r))) relations.push(r);
    }

    onResolved({ frames, relations });
  }, [
    mergeResult,
    conflictResolutions,
    includedSource,
    includedTarget,
    includedSourceRels,
    includedTargetRels,
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
      c.slotConflicts.filter((sc) => conflictResolutions[c.frameId]?.slotChoices[sc.key]).length,
    0
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-purple-500" />
          <h3 className="text-base font-semibold">Frame Merge</h3>
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
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Conflicts ({mergeResult.conflicts.length} frame
            {mergeResult.conflicts.length !== 1 ? 's' : ''})
          </h4>
          {mergeResult.conflicts.map((c) => (
            <ConflictCard
              key={c.frameId}
              conflict={c}
              resolution={conflictResolutions[c.frameId]}
              onSlotChoose={handleSlotChoose}
            />
          ))}
        </div>
      )}

      {/* Only in source */}
      <SideOnlySection
        title="Only in Source (Branch A)"
        icon={<Plus className="h-4 w-4 text-blue-500" />}
        frames={mergeResult.onlyInSource}
        included={includedSource}
        onToggle={toggleSourceFrame}
        colorClass="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
      />

      {/* Only in target */}
      <SideOnlySection
        title="Only in Target (Branch B)"
        icon={<Plus className="h-4 w-4 text-emerald-500" />}
        frames={mergeResult.onlyInTarget}
        included={includedTarget}
        onToggle={toggleTargetFrame}
        colorClass="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
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
            <Check className="h-3.5 w-3.5 text-green-500" />
            <span>
              {mergeResult.autoKept.length} frame{mergeResult.autoKept.length !== 1 ? 's' : ''}{' '}
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
            No conflicts detected. All frames are identical.
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
