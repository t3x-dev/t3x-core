'use client';

import { Check, ChevronDown, GitCommit, Leaf as LeafIcon, Loader2, Pin, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CommitWithLeaves } from '@/hooks/commits/useBranchCommits';
import { useBranchCommits } from '@/hooks/commits/useBranchCommits';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { usePinsStore } from '@/store/pinsStore';
import type { Assertion, Leaf } from '@/types/api';
import { cn } from '@/utils/cn';

interface PinDropdownSelectorProps {
  projectId: string;
  branch: string;
}

export function PinDropdownSelector({ projectId, branch }: PinDropdownSelectorProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTerminology();
  const { data, loading } = useBranchCommits(projectId, branch);
  const pins = usePinsStore((s) => s.pins);
  const isPinned = usePinsStore((s) => s.isPinned);
  const getPinByRef = usePinsStore((s) => s.getPinByRef);
  const { add: addPin, remove: removePin, setAssertions: updatePinAssertions } = usePinsCrud();

  const convCount = pins.filter((p) => p.type === 'conversation').length;
  const leafCount = pins.filter((p) => p.type === 'leaf').length;
  const totalCount = convCount + leafCount;

  const handleToggle = async (type: 'conversation' | 'leaf', refId: string) => {
    if (isPinned(type, refId)) {
      const pin = getPinByRef(type, refId);
      if (pin) await removePin(pin.id);
    } else {
      await addPin(projectId, type, refId);
    }
  };

  const handleSelectAll = async () => {
    if (!data) return;
    for (const item of data) {
      const convId = extractConversationId(item);
      if (convId && !isPinned('conversation', convId)) {
        await addPin(projectId, 'conversation', convId);
      }
      for (const leaf of item.leaves) {
        if (!isPinned('leaf', leaf.id)) {
          await addPin(projectId, 'leaf', leaf.id);
        }
      }
    }
  };

  const handleDeselectAll = async () => {
    for (const pin of [...pins]) {
      await removePin(pin.id);
    }
  };

  const summaryText =
    totalCount === 0
      ? 'No pins'
      : `${convCount} conv${convCount !== 1 ? 's' : ''}${leafCount > 0 ? `, ${leafCount} leaf${leafCount !== 1 ? 's' : ''}` : ''} pinned`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between text-xs h-8">
          <span className="flex items-center gap-1.5">
            <Pin
              size={12}
              className={cn(
                totalCount > 0 ? 'text-[var(--status-warning)]' : 'text-[var(--color-text-muted)]'
              )}
            />
            {summaryText}
          </span>
          <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 max-h-80 overflow-y-auto" align="start">
        {/* Header actions */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">
            Branch: {branch}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="text-[0.65rem] text-[var(--status-info)] hover:underline"
              onClick={handleSelectAll}
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              className="text-[0.65rem] text-[var(--status-info)] hover:underline"
              onClick={handleDeselectAll}
            >
              Deselect all
            </button>
          </div>
        </div>
        <DropdownMenuSeparator />

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin text-[var(--color-text-muted)]" />
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
              Loading {t('commits').toLowerCase()}...
            </span>
          </div>
        )}

        {/* Empty state */}
        {!loading && (!data || data.length === 0) && (
          <div className="px-2 py-4 text-center text-xs text-[var(--color-text-muted)]">
            No {t('commits').toLowerCase()} on this {t('branch').toLowerCase()}
          </div>
        )}

        {/* Commit groups */}
        {(() => {
          const seenConvIds = new Set<string>();
          return data?.map((item, idx) => {
            const convId = extractConversationId(item);
            const showConv = convId != null && !seenConvIds.has(convId);
            if (convId) seenConvIds.add(convId);
            return (
              <CommitGroup
                key={item.commit.hash}
                item={item}
                isPinned={isPinned}
                onToggle={handleToggle}
                showSeparator={idx < data.length - 1}
                showConversation={showConv}
                getPinByRef={getPinByRef}
                onToggleAssertion={updatePinAssertions}
              />
            );
          });
        })()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Internal: single commit group
// ---------------------------------------------------------------------------

function CommitGroup({
  item,
  isPinned,
  onToggle,
  showSeparator,
  showConversation,
  getPinByRef,
  onToggleAssertion,
}: {
  item: CommitWithLeaves;
  isPinned: (type: 'conversation' | 'leaf', refId: string) => boolean;
  onToggle: (type: 'conversation' | 'leaf', refId: string) => void;
  showSeparator: boolean;
  showConversation: boolean;
  getPinByRef: (
    type: 'conversation' | 'leaf',
    refId: string
  ) => { id: string; selected_assertion_ids?: string[] } | undefined;
  onToggleAssertion: (pinId: string, assertionIds: string[]) => Promise<unknown>;
}) {
  const { commit, leaves } = item;
  const convId = extractConversationId(item);
  const hashShort = commit.hash.replace(/^sha256:/, '').slice(0, 8);
  const message = commit.message || 'No message';
  const time = formatRelativeTime(commit.committed_at);

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-1.5 text-[0.7rem] text-[var(--color-text-muted)] px-2 py-1">
        <GitCommit size={12} className="shrink-0" />
        <span className="font-mono">{hashShort}</span>
        <span className="truncate flex-1">{message}</span>
        <span className="shrink-0 text-[var(--color-text-muted)]">{time}</span>
      </DropdownMenuLabel>

      {/* Conversation pin (deduplicated: only shown once per conversation) */}
      {convId && showConversation && (
        <DropdownMenuCheckboxItem
          checked={isPinned('conversation', convId)}
          onCheckedChange={() => onToggle('conversation', convId)}
          onSelect={(e) => e.preventDefault()}
          className="text-xs pl-6"
        >
          <span className="inline-flex items-center gap-1">
            <span className="text-[0.6rem] font-medium px-1 py-0.5 rounded bg-[var(--status-info-muted)] text-[var(--status-info)]">
              conv
            </span>
            <span className="truncate">conv#{convId.replace(/^conv_/, '').slice(0, 8)}</span>
          </span>
        </DropdownMenuCheckboxItem>
      )}

      {/* Leaf pins + assertion sub-items */}
      {leaves.map((leaf) => {
        const leafPinned = isPinned('leaf', leaf.id);
        const pin = leafPinned ? getPinByRef('leaf', leaf.id) : undefined;
        const assertions = getLeafAssertions(leaf);

        return (
          <div key={leaf.id}>
            <DropdownMenuCheckboxItem
              checked={leafPinned}
              onCheckedChange={() => onToggle('leaf', leaf.id)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs pl-6"
            >
              <span className="inline-flex items-center gap-1">
                <span className="text-[0.6rem] font-medium px-1 py-0.5 rounded bg-[var(--accent-conversation)]/15 text-[var(--accent-conversation)]">
                  leaf
                </span>
                <LeafIcon size={10} className="text-[var(--accent-conversation)]" />
                <span className="truncate">{leaf.title || leaf.id.slice(0, 10)}</span>
              </span>
            </DropdownMenuCheckboxItem>

            {/* Assertion sub-checkboxes (only when leaf is pinned and has assertions) */}
            {leafPinned && pin && assertions.length > 0 && (
              <AssertionSubItems
                assertions={assertions}
                pin={pin}
                onToggleAssertion={onToggleAssertion}
              />
            )}
          </div>
        );
      })}

      {/* No pinnable items under this commit */}
      {(!convId || !showConversation) && leaves.length === 0 && (
        <div className="px-6 py-1 text-[0.65rem] text-[var(--color-text-muted)] italic">
          No pinnable items
        </div>
      )}

      {showSeparator && <DropdownMenuSeparator />}
    </DropdownMenuGroup>
  );
}

// ---------------------------------------------------------------------------
// Internal: assertion sub-items under a pinned leaf
// ---------------------------------------------------------------------------

function AssertionSubItems({
  assertions,
  pin,
  onToggleAssertion,
}: {
  assertions: Assertion[];
  pin: { id: string; selected_assertion_ids?: string[] };
  onToggleAssertion: (pinId: string, assertionIds: string[]) => Promise<unknown>;
}) {
  const selectedIds = pin.selected_assertion_ids ?? [];

  const handleToggle = (assertionId: string) => {
    const next = selectedIds.includes(assertionId)
      ? selectedIds.filter((id) => id !== assertionId)
      : [...selectedIds, assertionId];
    onToggleAssertion(pin.id, next);
  };

  return (
    <div className="ml-2">
      {assertions.map((a) => {
        const checked = selectedIds.includes(a.id);
        return (
          <DropdownMenuCheckboxItem
            key={a.id}
            checked={checked}
            onCheckedChange={() => handleToggle(a.id)}
            onSelect={(e) => e.preventDefault()}
            className="text-[0.65rem] pl-10 py-0.5"
          >
            <span className="inline-flex items-center gap-1 min-w-0">
              {a.passed ? (
                <Check size={10} className="shrink-0 text-[var(--status-success)]" />
              ) : (
                <X size={10} className="shrink-0 text-[var(--status-error)]" />
              )}
              <span className="truncate">{a.details || a.id}</span>
            </span>
          </DropdownMenuCheckboxItem>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get assertions from a leaf, preferring runner_assertions over assertions.
 */
function getLeafAssertions(leaf: Leaf): Assertion[] {
  return leaf.runner_assertions ?? leaf.assertions ?? [];
}

/**
 * Extract conversation_id from commit's sources.
 * ApiCommit has sources with type='conversation' entries.
 */
function extractConversationId(item: CommitWithLeaves): string | null {
  const ref = item.commit.sources?.find((r) => r.type === 'conversation');
  return ref?.id ?? null;
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}
