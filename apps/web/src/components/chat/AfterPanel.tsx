'use client';

import type { HumanEditSurface, Source, TreeNode } from '@t3x-dev/core';
import { AlertCircle, ListPlus, Pencil, Play, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  TREE_BASE_PADDING,
  TREE_FOOTER_HEIGHT,
  TREE_INDENT_STEP,
  TREE_ROW_HEIGHT,
} from '@/components/chat/treeRowMetrics';
import { deriveSlotTag } from '@/domain/diff/deriveSlotTag';
import { computeTreeDiff, type TreeDiffResult } from '@/domain/diff/treeDiff';
import {
  formatAppliedResultFailureRow,
  formatRetainedFailureRow,
  getResultPanelHeaderLabel,
} from '@/domain/draft/retainedFailureLabel';
import { getSlotSource } from '@/domain/source';
import { deriveWorkspaceActionBarState } from '@/domain/workspace/actionBarState';
import { useCommitActions } from '@/hooks/commits/useCommitActions';
import { useParentCommit } from '@/hooks/commits/useParentCommit';
import { useDiscardDraft } from '@/hooks/drafts/useDiscardDraft';
import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import { useGoldEdit } from '@/hooks/shared/useGoldEdit';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import {
  selectIsInheritedBaselineOnly,
  selectScriptDirty,
  useWorkspaceStore,
} from '@/store/workspaceStore';
import { cn } from '@/utils/cn';
import { WorkspaceActionBar } from './WorkspaceActionBar';

const TREE_MONO_FONT = 'var(--font-mono)';
const MONO = {
  fontFamily: TREE_MONO_FONT,
  fontSize: 12,
  letterSpacing: 0,
  lineHeight: '18px',
} as const;
type SlotDiffType = 'added' | 'modified' | 'removed' | null;

const YAML_KEY_CLASS = 'text-[color-mix(in_srgb,var(--yaml-key)_88%,var(--text-primary))]';
const YAML_VALUE_CLASS = 'text-[color-mix(in_srgb,var(--yaml-string)_82%,var(--text-primary))]';
const YAML_PUNCTUATION_CLASS = 'text-[color-mix(in_srgb,var(--yaml-punctuation)_70%,transparent)]';

function rowTone(input: {
  side: 'before' | 'after';
  humanEdit?: HumanEditMarker | null;
  isAdded?: boolean;
  isModified?: boolean;
  isRemoved?: boolean;
}): { background: string; rail: string } {
  if (input.side !== 'after') return { background: '', rail: 'bg-transparent' };
  if (input.humanEdit) {
    return {
      background: 'bg-[var(--status-info)]/[0.035]',
      rail: 'bg-[var(--status-info)]',
    };
  }
  if (input.isAdded) {
    return {
      background: 'bg-[var(--status-success)]/[0.02]',
      rail: 'bg-[var(--status-success)]',
    };
  }
  if (input.isModified) {
    return {
      background: 'bg-[var(--status-warning)]/[0.025]',
      rail: 'bg-[var(--status-warning)]',
    };
  }
  if (input.isRemoved) {
    return {
      background: 'bg-[var(--status-error)]/[0.025] opacity-55',
      rail: 'bg-[var(--status-error)]',
    };
  }
  return { background: '', rail: 'bg-transparent' };
}

function YAMLIndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-2 opacity-45"
      style={{
        width: depth * TREE_INDENT_STEP,
        backgroundImage:
          'linear-gradient(90deg, transparent calc(100% - 1px), color-mix(in srgb, var(--stroke-default) 45%, transparent) calc(100% - 1px))',
        backgroundSize: `${TREE_INDENT_STEP}px 100%`,
      }}
    />
  );
}

function MetadataBadge({
  label,
  title,
  kind,
  emphasized = false,
}: {
  label: string;
  title?: string;
  kind: 'human' | 'new' | 'modified' | 'removed' | 'inherited';
  emphasized?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center justify-end overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-1.5 py-px text-[8px] font-semibold opacity-45 transition-opacity group-hover:opacity-90',
        emphasized && 'opacity-90',
        kind === 'human' && 'bg-[var(--status-info)]/[0.08] text-[var(--status-info)]',
        kind === 'new' && 'bg-[var(--status-success)]/[0.07] text-[var(--status-success)]',
        kind === 'modified' && 'bg-[var(--status-warning)]/[0.08] text-[var(--status-warning)]',
        kind === 'removed' && 'bg-[var(--status-error)]/[0.08] text-[var(--status-error)]',
        kind === 'inherited' && 'bg-[var(--surface-hover)] text-[var(--text-tertiary)]'
      )}
    >
      {label}
    </span>
  );
}

function TreeInlineActions({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="relative z-[1] flex shrink-0 items-center justify-end gap-1">{children}</div>
  );
}

function TreeRowMeta({ badge }: { badge?: ReactNode }) {
  if (!badge) return null;
  return (
    <div className="relative z-[1] col-span-2 flex min-w-0 justify-end pt-0.5 leading-[12px]">
      <span className="min-w-0 max-w-full overflow-hidden text-right">{badge}</span>
    </div>
  );
}

function metadataKindForSlotTag(
  tag: ReturnType<typeof deriveSlotTag> | null
): 'new' | 'modified' | 'removed' | 'inherited' {
  switch (tag?.kind) {
    case 'new':
      return 'new';
    case 'modified':
      return 'modified';
    case 'removed':
      return 'removed';
    default:
      return 'inherited';
  }
}

export interface HumanEditMarker {
  label: string;
  title: string;
}

function humanSurfaceLabel(surface: HumanEditSurface | undefined): string {
  switch (surface) {
    case 'tree':
      return 'Tree';
    case 'script':
      return 'YOps';
    case 'inline':
      return 'Inline';
    default:
      return 'Manual';
  }
}

export function humanEditMarkerFromSource(source: Source | null): HumanEditMarker | null {
  if (!source || source.type !== 'human') return null;
  const surface = humanSurfaceLabel(source.surface);
  return {
    label: `Human · ${surface}`,
    title: `Human edit via ${surface}${source.author ? ` by ${source.author}` : ''}`,
  };
}

export type SlotPreviewValue =
  | { kind: 'scalar'; text: string }
  | { kind: 'list'; items: SlotPreviewListItem[] }
  | { kind: 'object'; entries: SlotPreviewObjectEntry[] };

type SlotPreviewListItem =
  | { kind: 'scalar'; text: string }
  | { kind: 'object'; entries: SlotPreviewObjectEntry[] };

interface SlotPreviewObjectEntry {
  key: string;
  value: SlotPreviewValue;
}

function splitCommaList(text: string): string[] | null {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return null;

  const looksLikeScalarList = parts.every((part) => {
    const wordCount = part.split(/\s+/).filter(Boolean).length;
    return wordCount <= 6 && !/[.;:!?]/.test(part);
  });
  return looksLikeScalarList ? parts : null;
}

function formatListItem(val: unknown): SlotPreviewListItem {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return {
      kind: 'object',
      entries: Object.entries(val).map(([key, value]) => ({
        key,
        value: formatSlotPreviewValue(value),
      })),
    };
  }
  return { kind: 'scalar', text: formatSlotPreviewText(val) };
}

function formatSlotPreviewText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return Object.entries(item)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
        }
        return String(item);
      })
      .join('; ');
  }
  if (typeof val === 'object') {
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(val);
}

export function formatSlotPreviewValue(val: unknown): SlotPreviewValue {
  if (typeof val === 'string') {
    const list = splitCommaList(val);
    if (list) {
      return { kind: 'list', items: list.map((text) => ({ kind: 'scalar', text })) };
    }
  }

  if (Array.isArray(val)) {
    return { kind: 'list', items: val.map(formatListItem) };
  }

  if (typeof val === 'object' && val !== null) {
    return {
      kind: 'object',
      entries: Object.entries(val).map(([key, value]) => ({
        key,
        value: formatSlotPreviewValue(value),
      })),
    };
  }

  return { kind: 'scalar', text: formatSlotPreviewText(val) };
}

function slotPreviewToEditText(value: SlotPreviewValue | null): string {
  if (!value) return '';
  if (value.kind === 'scalar') return value.text;
  if (value.kind === 'list') {
    return value.items
      .map((item) =>
        item.kind === 'scalar'
          ? item.text
          : item.entries
              .map((entry) => `${entry.key}: ${slotPreviewToEditText(entry.value)}`)
              .join(', ')
      )
      .join(', ');
  }
  return value.entries
    .map((entry) => `${entry.key}: ${slotPreviewToEditText(entry.value)}`)
    .join(', ');
}

/**
 * Whether the panel's Commit button should be disabled.
 *
 * Commit reads `workspaceStore.tree` (the committed/applied state), but the
 * panel renders `draftTree` whenever `hasDraft` is true. Letting the button
 * fire in that window would freeze the *pre-draft* tree under the user's
 * eyes while the staged YOps still sit un-applied — what the user sees
 * (preview) and what gets committed (committed tree) diverge. Forcing
 * Apply / Discard first keeps those in sync.
 *
 * Exported so the regression test can pin the contract without mounting
 * the full AfterPanel.
 */
export function shouldDisableCommit(input: {
  hasResult: boolean;
  isCommitting: boolean;
  isCommitted: boolean;
  hasDraft: boolean;
  isInheritedBaselineOnly?: boolean;
  scriptDirty?: boolean;
}): boolean {
  return (
    !input.hasResult ||
    input.isCommitting ||
    input.isCommitted ||
    input.hasDraft ||
    Boolean(input.scriptDirty) ||
    Boolean(input.isInheritedBaselineOnly)
  );
}

/**
 * Show a persistent row when Extract failed while an applied result already
 * exists. This is distinct from the retained-draft path: no replacement
 * draft was staged, so the visible tree is the unchanged yops_log replay.
 */
export function shouldShowAppliedResultFailure(input: {
  hasDraft: boolean;
  hasResult: boolean;
  lastError: string | null;
}): boolean {
  return !input.hasDraft && input.hasResult && input.lastError !== null;
}

function summarizeVisibleDiff(diff: TreeDiffResult | null): {
  addedRows: number;
  modifiedRows: number;
  removedRows: number;
} {
  if (!diff) return { addedRows: 0, modifiedRows: 0, removedRows: 0 };
  return {
    addedRows: Object.values(diff.addedSlots).reduce((n, slots) => n + slots.length, 0),
    modifiedRows: Object.values(diff.modifiedSlots).reduce((n, slots) => n + slots.length, 0),
    removedRows:
      Object.values(diff.removedSlots).reduce((n, slots) => n + slots.length, 0) +
      diff.removed.length,
  };
}

interface RenderRowBase {
  key: string;
  depth: number;
}

interface NodeRenderRow extends RenderRowBase {
  kind: 'node';
  path: string;
  nodeKey: string;
  beforeNode: TreeNode | null;
  afterNode: TreeNode | null;
  isAdded: boolean;
  isRemoved: boolean;
  humanEdit: HumanEditMarker | null;
  inlineSlot?: SlotRenderRow;
}

interface SlotRenderRow extends RenderRowBase {
  kind: 'slot';
  path: string;
  slotKey: string;
  beforeValue: SlotPreviewValue | null;
  afterValue: SlotPreviewValue | null;
  diffType: SlotDiffType;
  oldValue?: SlotPreviewValue;
  humanEdit: HumanEditMarker | null;
}

type RenderRow = NodeRenderRow | SlotRenderRow;

function buildRenderRows(
  baseNode: TreeNode | null,
  resultNode: TreeNode | null,
  path: string,
  depth: number,
  diff: TreeDiffResult | null,
  sourceIndex: Map<string, Source>
): RenderRow[] {
  if (!baseNode && !resultNode) return [];
  const isRemovedNode = !!baseNode && !resultNode;
  const nodeKey = resultNode?.key ?? baseNode?.key ?? path.split('/').pop() ?? path;
  const baseSlots = baseNode?.slots || {};
  const resultSlots = resultNode?.slots || {};
  const resultSlotKeys = Object.keys(resultSlots).filter((key) => !key.startsWith('_'));
  const baseOnlySlotKeys = Object.keys(baseSlots).filter(
    (key) => !key.startsWith('_') && !(key in resultSlots)
  );
  const orderedSlotKeys = [...resultSlotKeys, ...baseOnlySlotKeys];
  const baseChildren = new Map((baseNode?.children ?? []).map((child) => [child.key, child]));
  const resultChildren = new Map((resultNode?.children ?? []).map((child) => [child.key, child]));

  const modifiedByKey = new Map(
    (diff?.modifiedSlots[path] ?? []).map((entry) => [entry.key, entry])
  );
  const addedSlotSet = new Set(diff?.addedSlots[path] ?? []);
  const removedSlotSet = new Set(diff?.removedSlots[path] ?? []);

  function buildSlotRow(slotKey: string): SlotRenderRow {
    const inBase = slotKey in baseSlots;
    const inResult = slotKey in resultSlots;
    const beforeValue = inBase ? formatSlotPreviewValue(baseSlots[slotKey]) : null;
    const afterValue = inResult ? formatSlotPreviewValue(resultSlots[slotKey]) : null;
    let diffType: SlotDiffType = null;
    let oldValue: SlotPreviewValue | undefined;

    if (!inBase && inResult) {
      diffType = 'added';
    } else if (inBase && !inResult) {
      diffType = 'removed';
    } else if (addedSlotSet.has(slotKey)) {
      diffType = 'added';
    } else if (removedSlotSet.has(slotKey)) {
      diffType = 'removed';
    } else if (modifiedByKey.has(slotKey)) {
      diffType = 'modified';
      const diffEntry = modifiedByKey.get(slotKey);
      oldValue = diffEntry ? formatSlotPreviewValue(diffEntry.oldValue) : undefined;
    } else if (resultNode && !baseNode) {
      diffType = 'added';
    }

    return {
      kind: 'slot',
      key: `slot:${path}:${slotKey}`,
      path,
      slotKey,
      depth: depth + 1,
      beforeValue,
      afterValue,
      diffType,
      oldValue,
      humanEdit: humanEditMarkerFromSource(getSlotSource(sourceIndex, `${path}/${slotKey}`)),
    };
  }

  const allVisibleSlotKeys = new Set([...resultSlotKeys, ...baseOnlySlotKeys]);
  const shouldInlineValueSlot =
    allVisibleSlotKeys.size === 1 &&
    allVisibleSlotKeys.has('value') &&
    baseChildren.size === 0 &&
    resultChildren.size === 0;
  const inlineSlot = shouldInlineValueSlot ? buildSlotRow('value') : undefined;
  const rows: RenderRow[] = [
    {
      kind: 'node',
      key: `node:${path}`,
      path,
      nodeKey,
      depth,
      beforeNode: baseNode,
      afterNode: resultNode,
      isAdded: !!resultNode && !baseNode,
      isRemoved: isRemovedNode,
      humanEdit:
        inlineSlot?.humanEdit ?? humanEditMarkerFromSource(getSlotSource(sourceIndex, path)),
      inlineSlot,
    },
  ];

  if (isRemovedNode) return rows;

  for (const slotKey of orderedSlotKeys) {
    if (inlineSlot && slotKey === inlineSlot.slotKey) continue;
    rows.push(buildSlotRow(slotKey));
  }

  const childOrder = [
    ...resultChildren.keys(),
    ...Array.from(baseChildren.keys()).filter((key) => !resultChildren.has(key)),
  ];

  for (const childKey of childOrder) {
    const nextBase = baseChildren.get(childKey) ?? null;
    const nextResult = resultChildren.get(childKey) ?? null;
    rows.push(
      ...buildRenderRows(nextBase, nextResult, `${path}/${childKey}`, depth + 1, diff, sourceIndex)
    );
  }

  return rows;
}

interface SlotCellProps {
  side: 'before' | 'after';
  row: SlotRenderRow;
  parentMessage: string | null;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
  onDelete?: () => void;
  onEdit?: (newValue: string) => void;
}

export function SlotPreviewInline({ value }: { value: SlotPreviewValue | null }) {
  if (!value) return null;

  if (value.kind === 'scalar') {
    return (
      <span
        className={cn('inline-block min-w-0 max-w-full truncate align-bottom', YAML_VALUE_CLASS)}
      >
        {value.text}
      </span>
    );
  }

  if (value.kind === 'list') {
    return (
      <ul className={cn('my-0 flex min-w-0 flex-col gap-0 py-0', YAML_VALUE_CLASS)}>
        {value.items.map((item, index) => (
          <li
            // Slot values are display-only here; index keeps duplicate scalars visible.
            key={`${item.kind}-${index}`}
            className="flex min-w-0 items-start gap-1.5 leading-[18px]"
          >
            <span className={cn('shrink-0', YAML_PUNCTUATION_CLASS)}>-</span>
            {item.kind === 'scalar' ? (
              <span className="min-w-0 break-words">{item.text}</span>
            ) : (
              <span className="min-w-0 break-words">
                {item.entries
                  .map((entry) => `${entry.key}: ${slotPreviewToEditText(entry.value)}`)
                  .join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <span className={cn('min-w-0 break-words', YAML_VALUE_CLASS)}>
      {slotPreviewToEditText(value)}
    </span>
  );
}

function SlotCell({
  side,
  row,
  parentMessage,
  selected,
  onSelect,
  onClear,
  onDelete,
  onEdit,
}: SlotCellProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = side === 'before' ? row.beforeValue : row.afterValue;
  const displayText = slotPreviewToEditText(displayValue);
  const isInteractive = side === 'after';
  const humanEdit = side === 'after' ? row.humanEdit : null;
  const tag = side === 'after' ? deriveSlotTag({ diffType: row.diffType, parentMessage }) : null;
  const isRemoved = row.diffType === 'removed';
  const isModified = row.diffType === 'modified';
  const isAdded = row.diffType === 'added';
  const paddingLeft = TREE_BASE_PADDING + row.depth * TREE_INDENT_STEP;
  const metadataBadge =
    side === 'after' && (humanEdit || tag) ? (
      <MetadataBadge
        label={humanEdit?.label ?? tag?.label ?? ''}
        title={humanEdit?.title}
        kind={humanEdit ? 'human' : metadataKindForSlotTag(tag)}
        emphasized={selected}
      />
    ) : undefined;
  const tone = rowTone({
    side,
    humanEdit,
    isAdded,
    isModified,
    isRemoved,
  });
  const isBlockValue = !editing && displayValue !== null && displayValue.kind !== 'scalar';

  const handleStartEdit = useCallback(() => {
    if (!isInteractive || !onEdit || isRemoved) return;
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isInteractive, isRemoved, onEdit]);

  const handleSave = useCallback(() => {
    if (!onEdit) {
      setEditing(false);
      return;
    }
    const newValue = inputRef.current?.value.trim() ?? '';
    if (newValue !== displayText) onEdit(newValue);
    setEditing(false);
  }, [displayText, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') setEditing(false);
    },
    [handleSave]
  );

  return (
    <div className="h-full w-full" data-yaml-tree-row="true">
      <div className="flex h-full w-full items-stretch">
        <div className={`w-px shrink-0 ${selected ? 'bg-[var(--source)]/75' : tone.rail}`} />
        <div
          data-human-edit={humanEdit ? 'true' : undefined}
          className={cn(
            'group relative grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1 px-2 transition-colors',
            tone.background,
            isInteractive && 'cursor-pointer hover:bg-[var(--hover-bg)]',
            selected && 'bg-[var(--source)]/[0.07]'
          )}
          style={MONO}
          onClick={() => (selected ? onClear() : onSelect())}
          onDoubleClick={handleStartEdit}
        >
          <YAMLIndentGuides depth={row.depth} />
          <div
            className="relative z-[1] flex min-w-0 flex-1 flex-col gap-0 overflow-hidden"
            style={{ paddingLeft }}
          >
            <div className="flex min-w-0 items-start gap-1 overflow-hidden">
              <span
                className={cn(
                  'max-w-[38%] shrink-0 truncate font-medium',
                  YAML_KEY_CLASS,
                  isRemoved && 'line-through'
                )}
              >
                {row.slotKey}
              </span>
              <span className={cn('shrink-0', YAML_PUNCTUATION_CLASS)}>:</span>
              {editing ? (
                <input
                  ref={inputRef}
                  defaultValue={displayText}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSave}
                  className="min-w-0 flex-1 border-0 border-b-[1.5px] border-b-[var(--status-warning)] bg-transparent text-[var(--text-primary)] outline-none"
                  style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                />
              ) : (
                !isBlockValue && (
                  <>
                    {side === 'after' && isModified && row.oldValue && (
                      <span className="mr-1 min-w-0 max-w-[45%] shrink truncate text-[var(--status-error)] opacity-50 line-through">
                        {slotPreviewToEditText(row.oldValue)}
                      </span>
                    )}
                    <span
                      className={cn('min-w-0 flex-1 overflow-hidden', isRemoved && 'line-through')}
                    >
                      <SlotPreviewInline value={displayValue} />
                    </span>
                  </>
                )
              )}
            </div>
            {isBlockValue && (
              <div
                className={cn(
                  'min-w-0 overflow-hidden pl-[14px] leading-[18px]',
                  isRemoved && 'line-through'
                )}
              >
                <SlotPreviewInline value={displayValue} />
              </div>
            )}
          </div>
          {side === 'after' && (onEdit || onDelete) && (
            <TreeInlineActions>
              {onEdit && !editing && (
                <button
                  type="button"
                  data-testid="slot-edit"
                  title="Edit value"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit();
                  }}
                  className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-tertiary)] opacity-70 transition hover:bg-[var(--hover-bg)] hover:text-[var(--status-info)] hover:opacity-100"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  data-testid="slot-delete"
                  title="Delete slot"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 transition hover:bg-[var(--hover-bg)] hover:text-[var(--status-error)] group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </TreeInlineActions>
          )}
          <TreeRowMeta badge={metadataBadge} />
        </div>
      </div>
    </div>
  );
}

interface NodeCellProps {
  side: 'before' | 'after';
  row: NodeRenderRow;
  parentMessage: string | null;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
  onAddChild?: () => void;
  onAddField?: () => void;
  onDeleteNode?: () => void;
}

function NodeCell({
  side,
  row,
  parentMessage,
  selected,
  onSelect,
  onClear,
  onAddChild,
  onAddField,
  onDeleteNode,
}: NodeCellProps) {
  const isRemoved = row.isRemoved && side === 'after';
  const isAdded = row.isAdded && side === 'after';
  const humanEdit = side === 'after' ? row.humanEdit : null;
  const hasNode = side === 'before' ? !!row.beforeNode : !!row.afterNode || row.isRemoved;
  const inlineSlot = row.inlineSlot;
  const inlineValue = side === 'before' ? inlineSlot?.beforeValue : inlineSlot?.afterValue;
  const inlineTag =
    side === 'after' && inlineSlot?.diffType
      ? deriveSlotTag({ diffType: inlineSlot.diffType, parentMessage })
      : null;
  const paddingLeft = TREE_BASE_PADDING + row.depth * TREE_INDENT_STEP;
  const metadataBadge =
    side === 'after' ? (
      humanEdit ? (
        <MetadataBadge
          label={humanEdit.label}
          title={humanEdit.title}
          kind="human"
          emphasized={selected}
        />
      ) : isAdded ? (
        <MetadataBadge label="New node" kind="new" emphasized={selected} />
      ) : isRemoved ? (
        <MetadataBadge label="Removed node" kind="removed" emphasized={selected} />
      ) : inlineTag ? (
        <MetadataBadge
          label={inlineTag.label}
          kind={metadataKindForSlotTag(inlineTag)}
          emphasized={selected}
        />
      ) : undefined
    ) : undefined;
  const tone = rowTone({
    side,
    humanEdit,
    isAdded,
    isRemoved,
  });

  return (
    <div className="h-full w-full" data-yaml-tree-row="true">
      <div className="group flex h-full w-full items-stretch">
        <div className={`w-px shrink-0 ${selected ? 'bg-[var(--source)]/75' : tone.rail}`} />
        <div
          data-human-edit={humanEdit ? 'true' : undefined}
          className={cn(
            'relative grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 px-2 transition-colors',
            hasNode && 'bg-[var(--panel-alt)]/45',
            tone.background,
            hasNode && 'cursor-pointer hover:bg-[var(--hover-bg)]',
            selected && 'bg-[var(--source)]/[0.07]'
          )}
          style={MONO}
          onClick={() => (hasNode ? (selected ? onClear() : onSelect()) : undefined)}
        >
          <YAMLIndentGuides depth={row.depth} />
          <div
            className="relative z-[1] flex min-w-0 items-center gap-1 overflow-hidden"
            style={{ paddingLeft }}
          >
            <span
              className={cn(
                'max-w-[40%] shrink-0 truncate font-semibold',
                YAML_KEY_CLASS,
                isRemoved && 'line-through'
              )}
            >
              {row.nodeKey}
            </span>
            <span className={cn('shrink-0', YAML_PUNCTUATION_CLASS)}>:</span>
            {inlineValue && (
              <>
                {side === 'after' && inlineSlot?.diffType === 'modified' && inlineSlot.oldValue && (
                  <span className="mr-1 min-w-0 max-w-[45%] shrink truncate text-[var(--status-error)] opacity-50 line-through">
                    {slotPreviewToEditText(inlineSlot.oldValue)}
                  </span>
                )}
                <span className={cn('min-w-0 flex-1 overflow-hidden', isRemoved && 'line-through')}>
                  <SlotPreviewInline value={inlineValue} />
                </span>
              </>
            )}
          </div>
          {side === 'after' && (
            <TreeInlineActions>
              {row.afterNode && (
                <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    data-testid="add-child-button"
                    title="Add child node"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild?.();
                    }}
                    className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-success)] hover:bg-[var(--hover-bg)]"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="add-field-button"
                    title="Add field"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddField?.();
                    }}
                    className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-info)] hover:bg-[var(--hover-bg)]"
                  >
                    <ListPlus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    title="Remove node and children"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode?.();
                    }}
                    className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--hover-bg)]"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </TreeInlineActions>
          )}
          <TreeRowMeta badge={metadataBadge} />
        </div>
      </div>
    </div>
  );
}

export function AfterPanel({
  showBeforeToggle,
  onToggleBefore,
  beforeVisible,
  onContinueEditing,
}: {
  showBeforeToggle?: boolean;
  onToggleBefore?: () => void;
  beforeVisible?: boolean;
  onContinueEditing?: () => void;
}) {
  const committedTree = useWorkspaceStore((s) => s.tree);
  const draftTree = useWorkspaceStore((s) => s.draftTree);
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const sourceIndex = useWorkspaceStore((s) => s.sourceIndex);
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const isInheritedBaselineOnly = useWorkspaceStore(selectIsInheritedBaselineOnly);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const activeBranch = useChatStore((s) => s.activeBranch);
  const parent = useParentCommit();
  const inheritedBaselineTree =
    isInheritedBaselineOnly && parent
      ? { trees: parent.trees, relations: committedTree.relations }
      : null;
  // Render the dry-run preview tree when an Extract has staged a draft.
  // For a new child conversation with no applied YOps yet, render the
  // inherited parent commit tree; otherwise an empty local replay would diff
  // against the parent as if every inherited node had been removed.
  const tree = hasDraft && draftTree ? draftTree : (inheritedBaselineTree ?? committedTree);
  // Same split as the WorkspaceTopbar: committed (yops_log) vs draft
  // (un-applied LLM proposal). The footer next to Discard / Commit
  // was the leftover ambiguous count after PR 904 covered the
  // header — kept reading 'N ops' regardless of whether what's
  // visible is committed history or a staged preview.
  const opsCount = useWorkspaceStore((s) => s.opsLog.length);
  const draftCount = useWorkspaceStore((s) => s.draftOps.length);
  const lastError = useWorkspaceStore((s) => s.lastError);
  // When a re-Extract failed but the previous draft is still applicable,
  // the panel renders the retained draft tree + a persistent error row +
  // a "Previous draft" header label. Set by useExtraction's catch block;
  // cleared on successful extract / Discard / successful Apply.
  const retainedDraftFailure = useWorkspaceStore((s) => s.retainedDraftFailure);
  const hasRetainedFailure = hasDraft && retainedDraftFailure !== null;
  const selectedNodePath = useWorkspaceStore((s) => s.selectedNodePath);
  const selectedSlotKey = useWorkspaceStore((s) => s.selectedSlotKey);
  const select = useWorkspaceStore((s) => s.select);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const { applyEdit } = useGoldEdit();

  const isCommitting = useCommitStore((s) => s.isCommitting);
  const { commit: commitTrees } = useCommitActions();
  const discardDraft = useDiscardDraft();
  const {
    execute: executeScript,
    canRun: canRunScript,
    disabledReason: scriptDisabledReason,
  } = useScriptExecution();
  const commitInputRef = useRef<HTMLInputElement | null>(null);
  const resultScrollRef = useRef<HTMLDivElement | null>(null);

  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [resultScrollbarGutter, setResultScrollbarGutter] = useState(0);

  const trees = tree.trees as TreeNode[];
  const parentTrees = parent?.trees ?? [];
  const hasResult = trees.length > 0;
  const hasParent = !!parent;
  const showBefore = !!beforeVisible && hasParent;
  const showBeforeControl =
    !!showBeforeToggle && !!onToggleBefore && hasParent && !isInheritedBaselineOnly;
  const splitGridStyle = showBefore ? { paddingRight: resultScrollbarGutter } : undefined;
  const splitDividerStyle = showBefore
    ? {
        left: `calc((100% - ${resultScrollbarGutter}px) / 2)`,
        bottom: TREE_FOOTER_HEIGHT,
      }
    : undefined;

  const diff = useMemo<TreeDiffResult | null>(() => {
    if (!parent) return null;
    return computeTreeDiff(parent.trees, tree.trees);
  }, [parent, tree.trees]);

  const summary = useMemo(() => summarizeVisibleDiff(diff), [diff]);
  const parentMessage = parent?.message ?? null;
  const showAppliedResultFailure = shouldShowAppliedResultFailure({
    hasDraft,
    hasResult,
    lastError,
  });
  const actionBarState = useMemo(
    () =>
      deriveWorkspaceActionBarState({
        scriptDirty,
        hasDraft,
        hasResult,
        isCommitted,
        mode: isCommitting ? 'committing' : workspaceMode,
        isInheritedBaselineOnly,
        canApply: canRunScript,
        applyDisabledReason: scriptDisabledReason,
        branch: activeBranch,
      }),
    [
      activeBranch,
      canRunScript,
      hasDraft,
      hasResult,
      isCommitted,
      isCommitting,
      isInheritedBaselineOnly,
      scriptDirty,
      scriptDisabledReason,
      workspaceMode,
    ]
  );

  const handleGoldEditFailure = useCallback((err: unknown) => {
    const workspaceError = useWorkspaceStore.getState().lastError;
    toast.error(workspaceError ?? (err instanceof Error ? err.message : 'Edit failed'));
  }, []);

  const handlePanelBackgroundClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('[data-yaml-tree-row="true"]')) return;
      if (event.target.closest('button, input, textarea, select, a, [role="button"]')) return;
      clearSelection();
    },
    [clearSelection]
  );

  useEffect(() => {
    if (!showCommitDialog) return;
    commitInputRef.current?.focus();
    commitInputRef.current?.select();
  }, [showCommitDialog]);

  // Auto-close the commit dialog when a draft preview arrives. The dialog
  // can already be open against the committed tree when Extract fires
  // from elsewhere (chat header, hotkey, programmatic). Leaving it open
  // would render a Commit dialog over a Draft-preview tree — confusing
  // even with the confirm gated. Closing it sends the user back to the
  // panel where the new "Draft preview" badge is visible and Apply /
  // Discard are the only forward moves.
  useEffect(() => {
    if (hasDraft && showCommitDialog) {
      setShowCommitDialog(false);
    }
  }, [hasDraft, showCommitDialog]);

  const rows = useMemo<RenderRow[]>(() => {
    const baseRoots = new Map(parentTrees.map((node) => [node.key, node]));
    const resultRoots = new Map(trees.map((node) => [node.key, node]));
    const rootOrder = [
      ...resultRoots.keys(),
      ...Array.from(baseRoots.keys()).filter((key) => !resultRoots.has(key)),
    ];
    return rootOrder.flatMap((key) =>
      buildRenderRows(
        baseRoots.get(key) ?? null,
        resultRoots.get(key) ?? null,
        key,
        0,
        diff,
        sourceIndex
      )
    );
  }, [diff, parentTrees, sourceIndex, trees]);

  useEffect(() => {
    if (!showBefore) {
      setResultScrollbarGutter(0);
      return;
    }

    const el = resultScrollRef.current;
    if (!el) return;

    const updateGutter = () => {
      setResultScrollbarGutter(Math.max(0, el.offsetWidth - el.clientWidth));
    };

    updateGutter();
    window.addEventListener('resize', updateGutter);

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => updateGutter());
    observer?.observe(el);

    return () => {
      window.removeEventListener('resize', updateGutter);
      observer?.disconnect();
    };
  }, [showBefore, rows.length]);

  const handleEditSlot = useCallback(
    (nodePath: string, slotKey: string, newValue: string) => {
      void applyEdit({ set: { path: `${nodePath}/${slotKey}`, value: newValue } }).catch(
        handleGoldEditFailure
      );
    },
    [applyEdit, handleGoldEditFailure]
  );

  const handleDeleteSlot = useCallback(
    (nodePath: string, slotKey: string) => {
      void applyEdit({ unset: { path: `${nodePath}/${slotKey}` } }).catch(handleGoldEditFailure);
    },
    [applyEdit, handleGoldEditFailure]
  );

  const handleAddChild = useCallback(
    (nodePath: string) => {
      const childKey = window.prompt('New node name (snake_case):');
      if (!childKey || !childKey.trim()) return;
      const cleanKey = childKey.trim().toLowerCase().replace(/\s+/g, '_');
      void applyEdit({ define: { path: `${nodePath}/${cleanKey}` } }).catch(handleGoldEditFailure);
    },
    [applyEdit, handleGoldEditFailure]
  );

  const handleAddField = useCallback(
    (nodePath: string, existingSlots: Record<string, unknown>) => {
      const fieldKey = window.prompt('New field name (snake_case):');
      if (!fieldKey || !fieldKey.trim()) return;
      const cleanKey = fieldKey.trim().toLowerCase().replace(/\s+/g, '_');
      if (cleanKey.includes('/')) {
        toast.error('Field name cannot contain "/".');
        return;
      }
      if (Object.hasOwn(existingSlots, cleanKey)) {
        toast.error(`Field "${cleanKey}" already exists.`);
        return;
      }
      const value = window.prompt(`Value for "${cleanKey}":`);
      if (value === null) return;
      void applyEdit({ set: { path: `${nodePath}/${cleanKey}`, value } }).catch(
        handleGoldEditFailure
      );
    },
    [applyEdit, handleGoldEditFailure]
  );

  const handleDeleteNode = useCallback(
    (nodePath: string, nodeKey: string) => {
      if (!window.confirm(`Remove "${nodeKey}" and all its children?`)) return;
      void applyEdit({ drop: { path: nodePath } }).catch(handleGoldEditFailure);
    },
    [applyEdit, handleGoldEditFailure]
  );

  const getDefaultCommitName = useCallback(() => {
    if (!trees.length) return 'Knowledge Extract';
    return trees
      .slice(0, 3)
      .map((t) => t.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(' & ');
  }, [trees]);

  const openCommitDialog = useCallback(() => {
    setCommitMessage(getDefaultCommitName());
    setShowCommitDialog(true);
  }, [getDefaultCommitName]);

  const handleDiscardChanges = useCallback(() => {
    if (hasDraft || retainedDraftFailure) {
      void discardDraft();
      return;
    }
    const store = useWorkspaceStore.getState();
    if (selectScriptDirty(store)) {
      store.clearEditorOverride();
      store.setError(null);
      toast.success('Script changes discarded');
    }
  }, [discardDraft, hasDraft, retainedDraftFailure]);

  const handleRunOrApply = useCallback(() => {
    void executeScript();
  }, [executeScript]);

  const handleContinueEditingAction = useCallback(() => {
    onContinueEditing?.();
  }, [onContinueEditing]);

  const handleCommit = useCallback(
    async (message: string) => {
      // Defense in depth: the main Commit button and the dialog confirm
      // both gate on shouldDisableCommit, but a keypress-in-flight can
      // race a state update — handler reads stale React state and fires
      // anyway. Re-check directly off the store so a draft that arrived
      // mid-keystroke can't slip through and commit the pre-draft tree.
      const workspaceState = useWorkspaceStore.getState();
      if (workspaceState.hasDraft) {
        toast.error('Apply or Discard the staged draft before committing.');
        setShowCommitDialog(false);
        return;
      }
      if (selectScriptDirty(workspaceState)) {
        toast.error('Run or discard script changes before committing.');
        setShowCommitDialog(false);
        return;
      }
      if (selectIsInheritedBaselineOnly(workspaceState)) {
        toast.error('Extract, edit, or Apply new YOps before committing this conversation.');
        setShowCommitDialog(false);
        return;
      }
      try {
        workspaceState.setMode('committing');
        await commitTrees(message || 'Knowledge Extract');
        useWorkspaceStore.getState().setMode('idle');
        useWorkspaceStore.getState().setCommitted(true);
        useWorkspaceStore.getState().clearDraft();
        setShowCommitDialog(false);
        toast.success('Committed successfully');
        try {
          new BroadcastChannel('t3x-commits').postMessage({ type: 'commit.created' });
        } catch {
          // BroadcastChannel not supported
        }
      } catch (err: unknown) {
        useWorkspaceStore.getState().setMode('idle');
        toast.error(`Commit failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [commitTrees]
  );

  return (
    <div
      data-testid="after-panel"
      className="relative flex h-full min-h-0 w-full flex-1 flex-col"
      onClick={handlePanelBackgroundClick}
    >
      {showBefore && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-10 w-px bg-[var(--stroke-default)]"
          style={splitDividerStyle}
        />
      )}
      <div
        className={cn(
          'grid shrink-0 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]',
          showBefore ? 'grid-cols-2' : 'grid-cols-1'
        )}
        style={splitGridStyle}
      >
        {showBefore && (
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Before <span className="opacity-80">🔒</span>
            </span>
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60 truncate max-w-[150px]">
              {parentMessage ??
                (parent ? parent.hash.replace(/^sha256:/, '').slice(0, 6) : 'empty')}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-1.5 min-w-0">
          {/*
            The header now states whether the rendered tree is the
            applied result (the live yops_log replay), an inherited
            baseline from the parent commit, or a dry-run preview of a
            staged draft. Without this distinction, a child conversation
            with no YOps of its own can look like it already committed
            the parent's tree.
          */}
          {/*
            Header label table (post-PR-B):
              hasDraft && retainedDraftFailure → "Previous draft" + Retained badge
              hasDraft                         → "Draft preview"  + Unapplied badge
              inherited baseline only          → "Inherited baseline"
              otherwise                        → "Applied result"
            The retained-draft variant signals that the rendered tree is
            the prior successful proposal, NOT the new (failed) attempt
            the user just clicked Extract on.
          */}
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {getResultPanelHeaderLabel({
              hasDraft,
              hasRetainedFailure,
              isInheritedBaselineOnly,
            })}
            {hasRetainedFailure ? (
              <span
                title="Last extract failed; this is the previous staged draft. Click Apply to commit it, or Discard to drop it."
                className="rounded bg-[var(--status-warning)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--status-warning)]"
              >
                Retained
              </span>
            ) : hasDraft ? (
              <span
                title="Dry-run preview of the staged Extract — click Apply to commit."
                className="rounded bg-[var(--source)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--source)]"
              >
                Unapplied
              </span>
            ) : isInheritedBaselineOnly ? (
              <span
                title="This tree is inherited from the parent commit. Extract, edit, or Apply new YOps before committing this conversation."
                className="rounded bg-[var(--accent-commit)]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--accent-commit)]"
              >
                Parent
              </span>
            ) : null}
          </span>
          {showBeforeControl && (
            <button
              type="button"
              onClick={() => onToggleBefore?.()}
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                showBefore
                  ? 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                  : 'bg-[var(--source)]/10 text-[var(--source)]'
              }`}
            >
              {showBefore ? 'Hide Previous' : 'Show Previous'}
            </button>
          )}
        </div>
      </div>

      {hasRetainedFailure && retainedDraftFailure && (
        <output
          data-testid="after-panel-retained-failure"
          className="block shrink-0 border-b border-[var(--status-warning)]/30 bg-[var(--status-warning)]/[0.06] px-3 py-1.5"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-warning)] opacity-80" />
            <span className="text-[10px] leading-4 text-[var(--status-warning)]">
              {formatRetainedFailureRow(retainedDraftFailure)}
            </span>
          </div>
        </output>
      )}

      {showAppliedResultFailure && lastError && (
        <output
          data-testid="after-panel-applied-result-failure"
          className="block shrink-0 border-b border-[var(--status-error)]/25 bg-[var(--status-error)]/[0.045] px-3 py-1.5"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-error)] opacity-80" />
            <span className="text-[10px] leading-4 text-[var(--status-error)]">
              {formatAppliedResultFailureRow({ message: lastError })}
            </span>
          </div>
        </output>
      )}

      <div ref={resultScrollRef} className="flex-1 min-h-0 overflow-auto bg-[var(--panel)]">
        {rows.length === 0 && lastError ? (
          <div className="flex h-full min-h-[160px] items-center justify-center px-6">
            <div className="flex max-w-[280px] flex-col items-center gap-2 text-center">
              <AlertCircle className="h-5 w-5 text-[var(--status-error)] opacity-80" />
              <span className="text-[11px] leading-5 text-[var(--status-error)]">{lastError}</span>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full min-h-[160px] items-center justify-center opacity-40">
            <div className="flex flex-col items-center gap-2">
              <Play className="h-5 w-5 text-[var(--text-tertiary)]" />
              <span className="text-[10px] text-[var(--text-tertiary)] italic">
                No knowledge extracted yet
              </span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            {rows.map((row) => {
              const rowSelected =
                selectedNodePath === row.path &&
                (row.kind === 'node' ? !selectedSlotKey : selectedSlotKey === row.slotKey);

              const beforeCell =
                row.kind === 'node' ? (
                  <NodeCell
                    key={`${row.key}:before-node`}
                    side="before"
                    row={row}
                    parentMessage={parentMessage}
                    selected={rowSelected}
                    onSelect={() => select('before', { nodePath: row.path })}
                    onClear={clearSelection}
                  />
                ) : (
                  <SlotCell
                    key={`${row.key}:before-slot`}
                    side="before"
                    row={row}
                    parentMessage={parentMessage}
                    selected={rowSelected}
                    onSelect={() => select('before', { nodePath: row.path, slotKey: row.slotKey })}
                    onClear={clearSelection}
                  />
                );

              // While a draft is staged, this view is a *preview* of the
              // un-applied script — not the live committed tree. Inline
              // gold-edit handlers (`useGoldEdit.applyEdit`) write
              // straight to yops_log against the committed workspace,
              // bypassing the script/Apply flow and leaving the staged
              // script stale relative to what just changed. Disable them
              // here; the user should edit the YAML or click Apply first.
              const allowInlineEdit = !hasDraft;
              const afterCell =
                row.kind === 'node' ? (
                  <NodeCell
                    key={`${row.key}:after-node`}
                    side="after"
                    row={row}
                    parentMessage={parentMessage}
                    selected={rowSelected}
                    onSelect={() => select('after', { nodePath: row.path })}
                    onClear={clearSelection}
                    onAddChild={
                      allowInlineEdit && row.afterNode ? () => handleAddChild(row.path) : undefined
                    }
                    onAddField={
                      allowInlineEdit && row.afterNode
                        ? () => handleAddField(row.path, row.afterNode?.slots ?? {})
                        : undefined
                    }
                    onDeleteNode={
                      allowInlineEdit && row.afterNode
                        ? () => handleDeleteNode(row.path, row.nodeKey)
                        : undefined
                    }
                  />
                ) : (
                  <SlotCell
                    key={`${row.key}:after-slot`}
                    side="after"
                    row={row}
                    parentMessage={parentMessage}
                    selected={rowSelected}
                    onSelect={() => select('after', { nodePath: row.path, slotKey: row.slotKey })}
                    onClear={clearSelection}
                    onDelete={
                      allowInlineEdit && row.afterValue !== null
                        ? () => handleDeleteSlot(row.path, row.slotKey)
                        : undefined
                    }
                    onEdit={
                      allowInlineEdit && row.afterValue !== null
                        ? (newValue) => handleEditSlot(row.path, row.slotKey, newValue)
                        : undefined
                    }
                  />
                );

              return showBefore ? (
                <div
                  key={row.key}
                  className="grid w-full grid-cols-2"
                  style={{ minHeight: TREE_ROW_HEIGHT }}
                >
                  <div className="min-w-0" style={{ minHeight: TREE_ROW_HEIGHT }}>
                    {beforeCell}
                  </div>
                  <div style={{ minHeight: TREE_ROW_HEIGHT }}>{afterCell}</div>
                </div>
              ) : (
                <div key={row.key} className="w-full" style={{ minHeight: TREE_ROW_HEIGHT }}>
                  {afterCell}
                </div>
              );
            })}
            {showBefore && rows.length === 0 && (
              <div className="flex items-center justify-center text-[10px] text-[var(--text-tertiary)] opacity-40 italic">
                {parent ? 'Parent commit is empty' : 'No prior commits'}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--stroke-default)] bg-[var(--panel-alt)] px-3"
        style={{ height: TREE_FOOTER_HEIGHT }}
      >
        <span
          className="text-[9px] font-mono text-[var(--text-tertiary)] truncate"
          title={
            isInheritedBaselineOnly
              ? 'Inherited from parent commit; no current conversation YOps applied'
              : hasDraft
                ? `${opsCount} committed op${opsCount === 1 ? '' : 's'} in yops_log; ${draftCount} new draft op${draftCount === 1 ? '' : 's'} staged for Apply`
                : `${opsCount} applied op${opsCount === 1 ? '' : 's'} in yops_log`
          }
        >
          {isInheritedBaselineOnly ? (
            'Inherited baseline'
          ) : (
            <>
              {opsCount} applied{hasDraft ? ` · ${draftCount} draft` : ''}
            </>
          )}
          {diff && (
            <>
              {' · '}
              {summary.addedRows > 0 && (
                <span className="text-[var(--status-success)]">+{summary.addedRows}</span>
              )}
              {summary.modifiedRows > 0 && (
                <span className="text-[var(--status-warning)]"> ~{summary.modifiedRows}</span>
              )}
              {summary.removedRows > 0 && (
                <span className="text-[var(--status-error)]"> −{summary.removedRows}</span>
              )}
            </>
          )}
        </span>
        <WorkspaceActionBar
          state={actionBarState}
          onRunScript={handleRunOrApply}
          onApplyChanges={handleRunOrApply}
          onDiscardChanges={handleDiscardChanges}
          onCommit={openCommitDialog}
          onContinueEditing={handleContinueEditingAction}
        />
      </div>

      {showCommitDialog && (
        <div
          data-testid="commit-dialog"
          className="absolute inset-0 z-10 flex items-center justify-center rounded-b-lg bg-[var(--overlay-scrim)] backdrop-blur-[var(--fx-blur-panel)]"
        >
          <div className="mx-3 w-full max-w-[280px] rounded-xl border border-[var(--stroke-default)] bg-[var(--panel)] p-4 shadow-[var(--fx-shadow-lg)]">
            <label
              htmlFor="after-panel-commit-message"
              className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1.5"
            >
              Name this commit
            </label>
            {/*
              Dialog confirm gates on the same helper as the main button,
              so a draft that arrives while the dialog is open disables
              Enter + click here too (defense against the race the
              auto-close effect also handles cooperatively).
            */}
            {(() => {
              const dialogDisabled = shouldDisableCommit({
                hasResult,
                isCommitting,
                isCommitted,
                hasDraft,
                isInheritedBaselineOnly,
                scriptDirty,
              });
              return (
                <>
                  <input
                    id="after-panel-commit-message"
                    ref={commitInputRef}
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !dialogDisabled) handleCommit(commitMessage);
                      if (e.key === 'Escape') setShowCommitDialog(false);
                    }}
                    className="w-full rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)] transition-colors"
                    placeholder="e.g. Budget & Attractions"
                  />
                  <div className="flex justify-end gap-1.5 mt-3">
                    <button
                      type="button"
                      onClick={() => setShowCommitDialog(false)}
                      className="rounded px-2.5 py-1 text-[10px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="commit-dialog-confirm"
                      onClick={() => handleCommit(commitMessage)}
                      disabled={dialogDisabled}
                      title={
                        isInheritedBaselineOnly
                          ? 'Extract, edit, or Apply new YOps before committing this conversation'
                          : hasDraft
                            ? 'Apply or Discard the staged draft before committing'
                            : scriptDirty
                              ? 'Run or discard script changes before committing'
                              : undefined
                      }
                      className="rounded bg-[var(--accent-commit)] px-2.5 py-1 text-[10px] font-semibold text-[var(--on-accent)] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                    >
                      {isCommitting ? 'Committing...' : 'Commit'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
