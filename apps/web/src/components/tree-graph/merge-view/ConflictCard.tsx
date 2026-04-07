'use client';

import type { MergeResult, SlotValue } from '@t3x-dev/core';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type TreeMergeSuggestion, getTreeMergeSuggestion } from '@/lib/api/diff';
import { cn } from '@/lib/utils';
import { AgreedSlotRow, SlotConflictRow } from './SlotConflictRow';
import {
  type ConflictResolution,
  type FlatNode,
  type SlotChoice,
  canonicalJson,
  formatSlotValue,
  toTitleCase,
} from './mergeViewHelpers';

export function ConflictCard({
  conflict,
  sourceNode,
  targetNode,
  resolution,
  onSlotChoose,
  mergeId,
}: {
  conflict: MergeResult['conflicts'][number];
  sourceNode: FlatNode | undefined;
  targetNode: FlatNode | undefined;
  resolution: ConflictResolution;
  onSlotChoose: (path: string, slotKey: string, choice: SlotChoice) => void;
  mergeId?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const { path, slotConflicts } = conflict;

  const sourceSlots = sourceNode?.slots ?? {};
  const targetSlots = targetNode?.slots ?? {};

  // AI suggestion state
  const [suggestion, setSuggestion] = useState<TreeMergeSuggestion | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Find agreed-upon slots (present in both, not conflicting)
  const conflictKeys = new Set(slotConflicts.map((c) => c.key));
  const allKeys = new Set([...Object.keys(sourceSlots), ...Object.keys(targetSlots)]);
  const agreedSlots: Array<{ key: string; value: SlotValue }> = [];
  for (const key of allKeys) {
    if (!conflictKeys.has(key)) {
      const value = sourceSlots[key] ?? targetSlots[key];
      if (value !== undefined) {
        agreedSlots.push({ key, value });
      }
    }
  }

  const resolvedCount = slotConflicts.filter((c) => resolution.slotChoices[c.key]).length;
  const allResolved = resolvedCount === slotConflicts.length;

  const handleSuggest = useCallback(async () => {
    if (!mergeId) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const result = await getTreeMergeSuggestion(
        mergeId,
        path,
        { type: sourceNode?.type ?? path, slots: sourceSlots },
        { type: targetNode?.type ?? path, slots: targetSlots }
      );
      setSuggestion(result);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Failed to get suggestion');
    } finally {
      setSuggestLoading(false);
    }
  }, [mergeId, path, sourceNode, targetNode, sourceSlots, targetSlots]);

  const handleApplySuggestion = useCallback(() => {
    if (!suggestion) return;
    for (const sc of slotConflicts) {
      const suggestedValue = suggestion.slots[sc.key];
      if (suggestedValue === undefined) continue;

      const matchesSource = canonicalJson(suggestedValue) === canonicalJson(sc.sourceValue);
      const matchesTarget = canonicalJson(suggestedValue) === canonicalJson(sc.targetValue);

      if (matchesTarget) {
        onSlotChoose(path, sc.key, 'target');
      } else if (matchesSource) {
        onSlotChoose(path, sc.key, 'source');
      }
    }
  }, [suggestion, slotConflicts, path, onSlotChoose]);

  const displayType = sourceNode?.type ?? path.split('/').pop() ?? path;

  return (
    <div
      className={cn(
        'rounded-lg border-2 overflow-hidden',
        allResolved
          ? 'border-[var(--status-success)]'
          : 'border-[var(--status-error)]'
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer',
          'bg-[var(--status-error-muted)] hover:bg-[var(--status-error-muted)] transition-colors'
        )}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-mono text-[var(--status-error)]">{path}</span>
        <span className="text-zinc-500 dark:text-zinc-400">{toTitleCase(displayType)}</span>
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
              onChoose={(key, choice) => onSlotChoose(path, key, choice)}
            />
          ))}

          {/* AI Suggestion */}
          {mergeId && (
            <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
              {!suggestion && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSuggest}
                  disabled={suggestLoading}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {suggestLoading ? (
                    <Loader2 size={12} className="animate-spin mr-1" />
                  ) : (
                    <Sparkles size={12} className="mr-1" />
                  )}
                  AI Suggestion
                </Button>
              )}
              {suggestError && <p className="text-xs text-[var(--status-error)] mt-1">{suggestError}</p>}
              {suggestion && (
                <div className="text-xs space-y-2 p-2 rounded bg-[var(--source-dim)] border border-[var(--source)]/30">
                  <div className="font-medium text-[var(--source)] flex items-center gap-1">
                    <Sparkles size={10} /> AI Suggestion
                  </div>
                  <div className="space-y-0.5">
                    {slotConflicts.map((sc) => {
                      const value = suggestion.slots[sc.key];
                      if (value === undefined) return null;
                      const matchesSource = canonicalJson(value) === canonicalJson(sc.sourceValue);
                      const matchesTarget = canonicalJson(value) === canonicalJson(sc.targetValue);
                      const isNovel = !matchesSource && !matchesTarget;
                      return (
                        <div
                          key={sc.key}
                          className="flex items-start gap-1.5 font-mono text-foreground"
                        >
                          <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
                            {sc.key}:
                          </span>
                          <span>{formatSlotValue(value as SlotValue)}</span>
                          {matchesSource && (
                            <span className="text-[10px] text-[var(--status-info)] font-sans">(source)</span>
                          )}
                          {matchesTarget && (
                            <span className="text-[10px] text-[var(--status-success)] font-sans">(target)</span>
                          )}
                          {isNovel && (
                            <span className="text-[10px] text-[var(--status-warning)] font-sans">
                              (merged — choose manually)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {suggestion.reasoning && (
                    <div className="text-zinc-500 dark:text-zinc-400 italic">
                      {suggestion.reasoning}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleApplySuggestion}
                    className="text-xs mt-1 text-[var(--source)] border-[var(--source)]/30 hover:bg-[var(--source-dim)]"
                  >
                    <Check size={12} className="mr-1" />
                    Apply Suggestion
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
