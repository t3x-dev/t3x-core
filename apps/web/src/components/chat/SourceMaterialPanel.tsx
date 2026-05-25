'use client';

import type { Pin } from '@t3x-dev/core';
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  MessageSquare,
  Pin as PinIcon,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Leaf as ProjectLeaf } from '@/types/api';
import { cn } from '@/utils/cn';

export interface EnrichedPin extends Pin {
  title?: string;
  assertionLessons?: string[];
  turnCount?: number;
  turnPreview?: string;
}

interface SourceMaterialPanelProps {
  pins: EnrichedPin[];
  availableLeaves?: ProjectLeaf[];
  availableLeavesLoading?: boolean;
  availableLeavesError?: string | null;
  leafPinningIds?: ReadonlySet<string>;
  baseline?: {
    commitHash: string | null;
    branch: string | null;
    parentConversationId?: string | null;
    parentConversationPinned?: boolean;
    pinningParentConversation?: boolean;
    onPinParentConversation?: () => void | Promise<void>;
  };
  onPinLeaf?: (leafId: string) => Promise<Pin | null | undefined>;
  onConfirm: (selectedPinIds: string[]) => void;
  onCancel: () => void;
}

const EMPTY_LEAF_IDS = new Set<string>();

interface PinCardProps {
  pin: EnrichedPin;
  checked: boolean;
  onToggle: (id: string) => void;
}

function PinCard({ pin, checked, onToggle }: PinCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = pin.type === 'leaf';
  const hasLessons = isLeaf && pin.assertionLessons && pin.assertionLessons.length > 0;
  const title = pin.title ?? pin.ref_id;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all',
        checked
          ? 'border-[var(--source)]/35 bg-[var(--source)]/[0.06] ring-1 ring-[var(--source)]/15'
          : 'border-dashed border-[var(--stroke-default)] bg-[var(--surface-elevated)] opacity-75'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={checked}
          aria-label={`${checked ? 'Exclude' : 'Include'} ${isLeaf ? 'leaf' : 'conversation'} ${title}`}
          onChange={() => onToggle(pin.id)}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border accent-[var(--source)] transition-colors',
            checked ? 'border-[var(--source)]' : 'border-[var(--stroke-default)]'
          )}
        />

        {/* Icon */}
        <div
          className={cn(
            'mt-0.5 shrink-0',
            isLeaf ? 'text-[var(--accent-leaf)]' : 'text-[var(--accent-conversation)]'
          )}
        >
          {isLeaf ? <LeafIcon size={13} /> : <MessageSquare size={13} />}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-xs font-medium text-[var(--text-primary)]">
              {title}
            </span>
            <span
              className={cn(
                'shrink-0 rounded px-1 py-px text-[10px] font-medium',
                isLeaf
                  ? 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
                  : 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
              )}
            >
              {isLeaf ? 'leaf' : 'conv'}
            </span>
            {checked && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-[var(--source)]/10 px-1 py-px text-[10px] font-medium text-[var(--source)]">
                <Check size={10} />
                Selected
              </span>
            )}
          </div>

          {/* Conversation preview */}
          {!isLeaf && pin.turnPreview && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">
              {pin.turnPreview}
            </p>
          )}
          {!isLeaf && pin.turnCount !== undefined && (
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              {pin.turnCount} turn{pin.turnCount !== 1 ? 's' : ''}
            </p>
          )}

          {/* Leaf assertion lessons (expandable) */}
          {hasLessons && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {pin.assertionLessons!.length} lesson
                {pin.assertionLessons!.length !== 1 ? 's' : ''}
              </button>
              {expanded && (
                <ul className="mt-1 space-y-0.5 border-l border-[var(--stroke-divider)] pl-2">
                  {pin.assertionLessons!.map((lesson, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list from API
                    <li key={i} className="text-[10px] text-[var(--text-tertiary)]">
                      {lesson}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AvailableLeafCardProps {
  leaf: ProjectLeaf;
  pinning: boolean;
  onPin: (leafId: string) => void;
}

function leafTitle(leaf: ProjectLeaf): string {
  return leaf.title || leaf.id.slice(0, 12);
}

function AvailableLeafCard({ leaf, pinning, onPin }: AvailableLeafCardProps) {
  const title = leafTitle(leaf);
  const constraintCount = leaf.constraints?.length ?? 0;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-3">
      <LeafIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-leaf)]" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-[var(--text-primary)]">{title}</span>
          <span className="shrink-0 rounded bg-[var(--accent-leaf)]/10 px-1 py-px text-[10px] font-medium text-[var(--accent-leaf)]">
            {leaf.type}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
          {constraintCount} constraint{constraintCount !== 1 ? 's' : ''}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Pin and include leaf ${title}`}
        onClick={() => onPin(leaf.id)}
        disabled={pinning}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf)]/10 px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent-leaf)] transition-colors hover:bg-[var(--accent-leaf)]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Pin & include
      </button>
    </div>
  );
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return 'baseline';
  return hash.replace(/^sha256:/, '').slice(0, 8);
}

export function SourceMaterialPanel({
  pins,
  availableLeaves = [],
  availableLeavesLoading = false,
  availableLeavesError = null,
  leafPinningIds = EMPTY_LEAF_IDS,
  baseline,
  onPinLeaf,
  onConfirm,
  onCancel,
}: SourceMaterialPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(pins.map((p) => p.id)));

  useEffect(() => {
    const pinIds = new Set(pins.map((pin) => pin.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (pinIds.has(id)) next.add(id);
      }
      for (const id of pinIds) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
  }, [pins]);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedIds));
  }, [selectedIds, onConfirm]);

  const handlePinLeaf = useCallback(
    async (leafId: string) => {
      if (!onPinLeaf || leafPinningIds.has(leafId)) return;

      const pin = await onPinLeaf(leafId);
      if (!pin?.id) return;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(pin.id);
        return next;
      });
    },
    [leafPinningIds, onPinLeaf]
  );

  // N = selected pins + 1 for current conversation
  const sourceCount = useMemo(() => selectedIds.size + 1, [selectedIds]);
  const availableLeafOptions = useMemo(() => {
    const pinnedLeafIds = new Set(
      pins.filter((pin) => pin.type === 'leaf').map((pin) => pin.ref_id)
    );
    return availableLeaves.filter((leaf) => !pinnedLeafIds.has(leaf.id));
  }, [availableLeaves, pins]);
  const showAvailableLeaves =
    Boolean(onPinLeaf) ||
    availableLeavesLoading ||
    Boolean(availableLeavesError) ||
    availableLeafOptions.length > 0;

  const hasBaseline = Boolean(baseline?.commitHash);
  const canPinParent =
    Boolean(baseline?.parentConversationId) &&
    !baseline?.parentConversationPinned &&
    Boolean(baseline?.onPinParentConversation);
  const confirmLabel = hasBaseline
    ? selectedIds.size > 0
      ? `Extract with chat + baseline + ${selectedIds.size} pinned`
      : 'Extract with current chat + baseline'
    : pins.length === 0
      ? 'Extract with current chat'
      : `Extract with ${sourceCount} source${sourceCount !== 1 ? 's' : ''}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3">
      {/* Section divider */}
      <div className="mb-3 flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--stroke-divider)]" />
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <PinIcon size={10} />
          <span>Pinned Sources</span>
        </div>
        <div className="h-px flex-1 bg-[var(--stroke-divider)]" />
      </div>

      {hasBaseline && (
        <div className="mb-2 rounded-lg border border-[var(--accent-commit)]/20 bg-[var(--accent-commit)]/5 p-3">
          <div className="flex items-start gap-2">
            <GitCommit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-commit)]" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  Inherited baseline is already included
                </span>
                <span className="rounded bg-[var(--accent-commit)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-commit)]">
                  {shortHash(baseline?.commitHash)}
                </span>
                {baseline?.branch && (
                  <span className="rounded bg-[var(--accent-branch)]/10 px-1.5 py-0.5 text-[10px] text-[var(--accent-branch)]">
                    {baseline.branch}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                Baseline YAML is used automatically. Pin references only when you want extra
                conversations, leaves, or feedback to join this extraction.
              </p>
            </div>
            {canPinParent && (
              <button
                type="button"
                onClick={() => {
                  void baseline?.onPinParentConversation?.();
                }}
                disabled={baseline?.pinningParentConversation}
                className="shrink-0 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {baseline?.pinningParentConversation ? 'Pinning...' : 'Pin parent conversation'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pin cards */}
      {pins.length > 0 ? (
        <div className="space-y-2">
          {pins.map((pin) => (
            <PinCard
              key={pin.id}
              pin={pin}
              checked={selectedIds.has(pin.id)}
              onToggle={handleToggle}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 py-3 text-xs text-[var(--text-tertiary)]">
          No pinned references yet.
          {showAvailableLeaves && ' Pin a leaf below to include it in this extraction.'}
        </div>
      )}

      {showAvailableLeaves && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              <LeafIcon size={11} className="text-[var(--accent-leaf)]" />
              <span>Available leaves</span>
            </div>
            {availableLeafOptions.length > 0 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {availableLeafOptions.length} not pinned
              </span>
            )}
          </div>

          {availableLeavesLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 py-3 text-xs text-[var(--text-tertiary)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading leaves...
            </div>
          ) : availableLeavesError ? (
            <div className="rounded-lg border border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-3 py-3 text-xs text-[var(--status-error)]">
              {availableLeavesError}
            </div>
          ) : availableLeafOptions.length > 0 ? (
            <div className="space-y-2">
              {availableLeafOptions.map((leaf) => (
                <AvailableLeafCard
                  key={leaf.id}
                  leaf={leaf}
                  pinning={leafPinningIds.has(leaf.id)}
                  onPin={handlePinLeaf}
                />
              ))}
            </div>
          ) : availableLeaves.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 py-3 text-xs text-[var(--text-tertiary)]">
              No project leaves available.
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 py-3 text-xs text-[var(--text-tertiary)]">
              All project leaves are already pinned.
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-md bg-[var(--source)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] transition-opacity hover:opacity-90"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
