'use client';

import {
  CheckCircle2,
  ExternalLink,
  FileText,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  MessageSquare,
  MessageSquareQuote,
  Plus,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { CommitYAMLDocument } from '@/components/commit/CommitYAMLDocument';
import type {
  ContextManifestSourceItem,
  ConversationContextManifest,
  Leaf as ProjectLeaf,
  Material as ProjectMaterial,
} from '@/types/api';
import { cn } from '@/utils/cn';

const EMPTY_LEAF_IDS = new Set<string>();
const EMPTY_MATERIAL_IDS = new Set<string>();

type PreviewTarget = { kind: 'baseline' } | { kind: 'source'; key: string };
type SourceTab = 'included' | 'baseline' | 'materials' | 'lessons';

export interface ContextManifestSourcePicker {
  availableLeaves?: ProjectLeaf[];
  availableLeavesLoading?: boolean;
  availableLeavesError?: string | null;
  availableMaterials?: ProjectMaterial[];
  availableMaterialsLoading?: boolean;
  availableMaterialsError?: string | null;
  leafPinningIds?: ReadonlySet<string>;
  materialPinningIds?: ReadonlySet<string>;
  materialUploading?: boolean;
  baseline?: {
    commitHash: string | null;
    branch: string | null;
    parentConversationId?: string | null;
  };
  onPinLeaf?: (leafId: string) => void | Promise<void>;
  onPinMaterial?: (materialId: string) => void | Promise<void>;
  onUploadMaterial?: (file: File) => void | Promise<void>;
  onOpenMaterial?: (materialId: string) => void;
}

interface ContextManifestPanelProps {
  id: string;
  manifest: ConversationContextManifest | null;
  disabled?: boolean;
  sourcePicker?: ContextManifestSourcePicker;
  onReferenceToggle: (pinId: string, included: boolean) => void | Promise<void>;
  onAssertionToggle: (
    pinId: string,
    assertionId: string,
    included: boolean
  ) => void | Promise<void>;
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return 'none';
  return hash.replace(/^sha256:/, '').slice(0, 8);
}

function leafTitle(leaf: ProjectLeaf): string {
  return leaf.title || leaf.id.slice(0, 12);
}

function materialTitle(material: ProjectMaterial): string {
  return material.title || material.filename || material.id.slice(0, 12);
}

function sourceItemKey(item: ContextManifestSourceItem): string {
  return `${item.kind}:${item.id}:${item.pin_id ?? 'readonly'}`;
}

function sourceItemLabel(item: ContextManifestSourceItem): string {
  return item.title || item.id;
}

function isMaterialSourceItem(item: ContextManifestSourceItem): boolean {
  return item.role === 'evidence' && item.pinned;
}

function isLessonSourceItem(item: ContextManifestSourceItem): boolean {
  return item.role === 'guidance';
}

function sourceItemSelected(item: ContextManifestSourceItem): boolean {
  return item.metadata?.selected === true;
}

function sourceItemPassed(item: ContextManifestSourceItem): boolean | undefined {
  const value = item.metadata?.passed;
  return typeof value === 'boolean' ? value : undefined;
}

function sourceKindLabel(kind: ContextManifestSourceItem['kind']): string {
  if (kind === 'baseline') return 'baseline';
  if (kind === 'conversation') return 'conversation';
  if (kind === 'leaf') return 'leaf';
  if (kind === 'commit') return 'commit';
  if (kind === 'import') return 'import';
  if (kind === 'file') return 'file';
  if (kind === 'web') return 'web';
  if (kind === 'result') return 'result';
  return 'lesson';
}

function sourceItemOpenHref(item: ContextManifestSourceItem, projectId: string | undefined) {
  if (item.kind === 'conversation') return `/chat/${encodeURIComponent(item.id)}`;
  if (item.kind === 'leaf' && projectId)
    return `/project/${projectId}/leaf/${encodeURIComponent(item.id)}`;
  if ((item.kind === 'commit' || item.kind === 'baseline') && projectId) {
    return `/project/${projectId}/commit/${encodeURIComponent(item.id)}`;
  }
  return null;
}

function SourceItemIcon({ kind }: { kind: ContextManifestSourceItem['kind'] }) {
  if (kind === 'leaf') {
    return <LeafIcon size={13} className="text-[var(--accent-leaf)]" />;
  }
  if (kind === 'conversation') {
    return <MessageSquare size={13} className="text-[var(--accent-conversation)]" />;
  }
  if (kind === 'lesson') {
    return <MessageSquareQuote size={13} className="text-[var(--accent-extract)]" />;
  }
  if (kind === 'import' || kind === 'file') {
    return <FileText size={13} className="text-[var(--source)]" />;
  }
  return <GitCommit size={13} className="text-[var(--accent-commit)]" />;
}

function OpenSourceLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="shrink-0 rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)]">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
    >
      {label}
      <ExternalLink size={10} />
    </Link>
  );
}

function BaselineIncludedRow({
  selected,
  manifest,
  onPreview,
}: {
  selected: boolean;
  manifest: ConversationContextManifest | null;
  onPreview: () => void;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-[var(--accent-commit)]/10' : 'hover:bg-[var(--hover-bg)]'
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--accent-commit)]/20 bg-[var(--accent-commit)]/10">
        <GitCommit size={13} className="text-[var(--accent-commit)]" />
      </span>
      <button type="button" onClick={onPreview} className="min-w-0 text-left">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          Baseline inherited
        </span>
        <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          commit {shortHash(manifest?.baseline.commit_hash)} ·{' '}
          {manifest?.baseline.branch ?? 'no branch'}
        </span>
      </button>
      <span className="rounded-[var(--radius-sm)] bg-[var(--accent-commit)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-commit)]">
        readonly
      </span>
    </div>
  );
}

function SourceItemRow({
  item,
  projectId,
  parentTitle,
  selected,
  disabled,
  onPreview,
  onAssertionToggle,
}: {
  item: ContextManifestSourceItem;
  projectId: string | undefined;
  parentTitle?: string;
  selected: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onAssertionToggle: ContextManifestPanelProps['onAssertionToggle'];
}) {
  const title = sourceItemLabel(item);
  const isLesson = isLessonSourceItem(item);
  const canToggleLesson = isLesson && Boolean(item.pin_id);
  const canToggle = canToggleLesson;
  const checked = isLesson ? sourceItemSelected(item) : item.included;
  const passed = sourceItemPassed(item);
  const openHref = sourceItemOpenHref(item, projectId);
  const openLabel =
    item.kind === 'conversation'
      ? 'Open conversation'
      : item.kind === 'leaf'
        ? 'Open leaf'
        : 'Open source';
  const subtitleParts = [sourceKindLabel(item.kind)];
  if (isLesson && parentTitle) subtitleParts.push(parentTitle);
  if (!isLesson && item.pin_id) subtitleParts.push(item.pin_id);
  if (isLesson && checked && !item.included) subtitleParts.push('selected');

  return (
    <div
      className={cn(
        'grid min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
        canToggle
          ? 'grid-cols-[16px_20px_minmax(0,1fr)_auto]'
          : 'grid-cols-[20px_minmax(0,1fr)_auto]',
        selected
          ? isLesson
            ? 'bg-[var(--accent-extract)]/10'
            : 'bg-[var(--accent-commit)]/10'
          : 'hover:bg-[var(--hover-bg)]'
      )}
    >
      {canToggle ? (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            if (canToggleLesson && item.pin_id) {
              void onAssertionToggle(item.pin_id, item.id, event.target.checked);
            }
          }}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[var(--stroke-default)]',
            isLesson ? 'accent-[var(--accent-extract)]' : 'accent-[var(--accent-commit)]'
          )}
          aria-label={`Include lesson ${title}`}
        />
      ) : null}
      <span className="mt-0.5">
        <SourceItemIcon kind={item.kind} />
      </span>
      <button type="button" onClick={onPreview} className="min-w-0 text-left">
        <span
          className={cn(
            'block text-xs text-[var(--text-primary)]',
            isLesson ? 'break-words' : 'truncate font-medium'
          )}
        >
          {title}
        </span>
        <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          {subtitleParts.join(' · ')}
        </span>
      </button>
      {passed === true && (
        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--status-success)]" />
      )}
      {passed === false && (
        <XCircle size={13} className="mt-0.5 shrink-0 text-[var(--status-error)]" />
      )}
      {passed === undefined && <OpenSourceLink href={openHref} label={openLabel} />}
    </div>
  );
}

function MaterialSourceRow({
  item,
  disabled,
  onReferenceToggle,
  onOpenMaterial,
}: {
  item: ContextManifestSourceItem;
  disabled?: boolean;
  onReferenceToggle: ContextManifestPanelProps['onReferenceToggle'];
  onOpenMaterial?: ContextManifestSourcePicker['onOpenMaterial'];
}) {
  const title = sourceItemLabel(item);
  const subtitleParts = [sourceKindLabel(item.kind)];
  if (item.pin_id) subtitleParts.push(item.pin_id);
  const canOpenMaterial = item.kind === 'import' || item.kind === 'file';

  return (
    <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--hover-bg)]">
      <span className="mt-0.5">
        <SourceItemIcon kind={item.kind} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          {subtitleParts.join(' · ')}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {canOpenMaterial && (
          <button
            type="button"
            aria-label={`Open material ${title}`}
            onClick={() => {
              onOpenMaterial?.(item.id);
            }}
            disabled={!onOpenMaterial}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
        {item.pin_id ? (
          <button
            type="button"
            aria-label={`Remove material ${title}`}
            onClick={() => {
              if (item.pin_id) void onReferenceToggle(item.pin_id, false);
            }}
            disabled={disabled}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--status-error-muted)] hover:text-[var(--status-error)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function AvailableLeafRow({
  leaf,
  pinning,
  onPinLeaf,
}: {
  leaf: ProjectLeaf;
  pinning: boolean;
  onPinLeaf?: ContextManifestSourcePicker['onPinLeaf'];
}) {
  const title = leafTitle(leaf);
  const constraintCount = leaf.constraints?.length ?? 0;

  return (
    <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--hover-bg)]">
      <LeafIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-leaf)]" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
          {constraintCount} constraint{constraintCount !== 1 ? 's' : ''}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Add material ${title}`}
        onClick={() => {
          void onPinLeaf?.(leaf.id);
        }}
        disabled={pinning || !onPinLeaf}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf)]/10 px-2 py-1 text-[10px] font-medium text-[var(--accent-leaf)] transition-colors hover:bg-[var(--accent-leaf)]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add
      </button>
    </div>
  );
}

function AvailableMaterialRow({
  material,
  pinning,
  onPinMaterial,
  onOpenMaterial,
}: {
  material: ProjectMaterial;
  pinning: boolean;
  onPinMaterial?: ContextManifestSourcePicker['onPinMaterial'];
  onOpenMaterial?: ContextManifestSourcePicker['onOpenMaterial'];
}) {
  const title = materialTitle(material);
  const subtitle = [
    material.filename ?? material.source_type,
    `${material.token_estimate} tokens`,
  ].join(' · ');

  return (
    <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--hover-bg)]">
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--source)]" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{subtitle}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Open material ${title}`}
          onClick={() => {
            onOpenMaterial?.(material.id);
          }}
          disabled={!onOpenMaterial}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label={`Add material ${title}`}
          onClick={() => {
            void onPinMaterial?.(material.id);
          }}
          disabled={pinning || !onPinMaterial}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--source)]/25 bg-[var(--source)]/10 px-2 py-1 text-[10px] font-medium text-[var(--source)] transition-colors hover:bg-[var(--source)]/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
      </span>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--stroke-default)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}

function Pane({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-2.5 py-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-normal text-[var(--text-tertiary)]">
          {title}
        </h3>
        {meta && (
          <span className="rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
            {meta}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">{children}</div>
    </section>
  );
}

function PreviewPanel({
  manifest,
  sourceItemsByKey,
  selectedPreview,
}: {
  manifest: ConversationContextManifest | null;
  sourceItemsByKey: Map<string, ContextManifestSourceItem>;
  selectedPreview: PreviewTarget;
}) {
  if (selectedPreview.kind === 'source') {
    const item = sourceItemsByKey.get(selectedPreview.key);
    if (item) {
      const label = sourceItemLabel(item);
      return (
        <div className="space-y-3 p-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              {sourceKindLabel(item.kind)} ·{' '}
              {item.included ? 'included in context' : 'not used this turn'}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {item.role === 'baseline'
              ? 'Baseline YAML is inherited from the parent commit. It is automatically included and does not require pinning the parent conversation.'
              : item.role === 'guidance'
                ? 'Lessons are not evidence sources. They summarize prior output or result feedback and affect extraction context when selected.'
                : 'Pinned materials are available in the project library and can be added to or removed from the current conversation context.'}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
              <dt className="text-[var(--text-tertiary)]">Kind</dt>
              <dd className="mt-1 font-mono text-[var(--text-secondary)]">
                {sourceKindLabel(item.kind)}
              </dd>
            </div>
            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
              <dt className="text-[var(--text-tertiary)]">Context</dt>
              <dd className="mt-1 font-mono text-[var(--text-secondary)]">
                {item.included ? 'included' : 'not included'}
              </dd>
            </div>
            {item.pin_id && (
              <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
                <dt className="text-[var(--text-tertiary)]">Pin</dt>
                <dd className="mt-1 font-mono text-[var(--text-secondary)]">{item.pin_id}</dd>
              </div>
            )}
            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
              <dt className="text-[var(--text-tertiary)]">Pinned</dt>
              <dd className="mt-1 font-mono text-[var(--text-secondary)]">
                {item.pinned ? 'true' : 'false'}
              </dd>
            </div>
          </dl>
        </div>
      );
    }
  }

  return (
    <div className="space-y-3 p-2">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Baseline inherited</h3>
        <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
          commit {shortHash(manifest?.baseline.commit_hash)} · automatic context
        </p>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
        Baseline YAML is inherited from the parent commit. It is automatically included and does not
        require pinning the parent conversation.
      </p>
      <dl className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
          <dt className="text-[var(--text-tertiary)]">Nodes</dt>
          <dd className="mt-1 font-mono text-[var(--text-secondary)]">
            {manifest?.baseline.node_count ?? 0}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-2">
          <dt className="text-[var(--text-tertiary)]">Relations</dt>
          <dd className="mt-1 font-mono text-[var(--text-secondary)]">
            {manifest?.baseline.relation_count ?? 0}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BaselineActions({
  manifest,
  sourcePicker,
}: {
  manifest: ConversationContextManifest | null;
  sourcePicker?: ContextManifestSourcePicker;
}) {
  const commitHash = manifest?.baseline.commit_hash ?? sourcePicker?.baseline?.commitHash ?? null;
  const commitHref =
    manifest?.project_id && commitHash
      ? `/project/${manifest.project_id}/commit/${encodeURIComponent(commitHash)}`
      : null;
  const sourceConversationId =
    manifest?.baseline.source_conversation_id ??
    sourcePicker?.baseline?.parentConversationId ??
    null;
  const sourceConversationHref = sourceConversationId
    ? `/chat/${encodeURIComponent(sourceConversationId)}`
    : null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <OpenSourceLink href={commitHref} label="View commit" />
      <OpenSourceLink
        href={sourceConversationHref}
        label={sourceConversationHref ? 'View source conversation' : 'No source conversation'}
      />
    </div>
  );
}

export function ContextManifestPanel({
  id,
  manifest,
  disabled,
  sourcePicker,
  onReferenceToggle,
  onAssertionToggle,
}: ContextManifestPanelProps) {
  const [activeTab, setActiveTab] = useState<SourceTab>('included');
  const [selectedPreview, setSelectedPreview] = useState<PreviewTarget>({ kind: 'baseline' });
  const materialUploadInputRef = useRef<HTMLInputElement>(null);
  const sourceItems = manifest?.source_items ?? [];
  const includedSourceItems = sourceItems.filter((item) => item.included);
  const materialSourceItems = sourceItems.filter(isMaterialSourceItem);
  const usedMaterialSourceItems = materialSourceItems.filter((item) => item.included);
  const lessonSourceItems = sourceItems.filter(isLessonSourceItem);
  const effectiveLessons = lessonSourceItems.filter((item) => item.included);
  const sourceItemsByKey = useMemo(
    () => new Map(sourceItems.map((item) => [sourceItemKey(item), item])),
    [sourceItems]
  );
  const sourceTitlesById = useMemo(
    () => new Map(sourceItems.map((item) => [item.id, sourceItemLabel(item)])),
    [sourceItems]
  );

  const leafPinningIds = sourcePicker?.leafPinningIds ?? EMPTY_LEAF_IDS;
  const materialPinningIds = sourcePicker?.materialPinningIds ?? EMPTY_MATERIAL_IDS;
  const usedLeafIds = new Set(
    usedMaterialSourceItems.filter((item) => item.kind === 'leaf').map((item) => item.id)
  );
  const usedMaterialIds = new Set(
    usedMaterialSourceItems
      .filter((item) => item.kind === 'import' || item.kind === 'file')
      .map((item) => item.id)
  );
  const availableLeaves = sourcePicker?.availableLeaves ?? [];
  const availableLeafOptions = availableLeaves.filter((leaf) => !usedLeafIds.has(leaf.id));
  const availableMaterials = sourcePicker?.availableMaterials ?? [];
  const availableMaterialOptions = availableMaterials.filter(
    (material) => !usedMaterialIds.has(material.id)
  );
  const showAvailableLeaves =
    Boolean(sourcePicker?.availableLeavesLoading) ||
    Boolean(sourcePicker?.availableLeavesError) ||
    availableLeafOptions.length > 0 ||
    availableLeaves.length > 0;
  const showAvailableMaterials =
    Boolean(sourcePicker?.availableMaterialsLoading) ||
    Boolean(sourcePicker?.availableMaterialsError) ||
    availableMaterialOptions.length > 0 ||
    availableMaterials.length > 0;
  const canUploadMaterial = Boolean(sourcePicker?.onUploadMaterial);

  return (
    <section
      id={id}
      aria-label="Sources"
      className="mx-auto mt-1 flex h-[min(34vh,320px)] max-w-[760px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-sm)]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-2 pt-2">
          <div
            role="tablist"
            aria-label="Source types"
            className="inline-flex h-8 max-w-full items-center overflow-x-auto text-[11px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'included'}
              onClick={() => setActiveTab('included')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'included'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Included
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {includedSourceItems.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'baseline'}
              onClick={() => setActiveTab('baseline')}
              className={cn(
                'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'baseline'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Baseline
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'materials'}
              onClick={() => setActiveTab('materials')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'materials'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Materials
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {usedMaterialSourceItems.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lessons'}
              onClick={() => setActiveTab('lessons')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 font-medium transition-colors',
                activeTab === 'lessons'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              Lessons
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {effectiveLessons.length}
              </span>
            </button>
          </div>
          <div className="hidden shrink-0 items-center gap-2 text-[10px] text-[var(--text-tertiary)] sm:flex">
            <span>{sourceItems.length} items</span>
            <span>{manifest?.token_estimate ?? 0} tokens</span>
          </div>
        </div>

        {activeTab === 'included' && (
          <div role="tabpanel" aria-label="Included" className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] gap-2 max-sm:grid-cols-1">
              <Pane title="This turn uses" meta="row click previews">
                <div className="space-y-1">
                  {includedSourceItems.length > 0 ? (
                    includedSourceItems.map((item) => {
                      if (item.kind === 'baseline') {
                        return (
                          <BaselineIncludedRow
                            key={sourceItemKey(item)}
                            selected={selectedPreview.kind === 'baseline'}
                            manifest={manifest}
                            onPreview={() => setSelectedPreview({ kind: 'baseline' })}
                          />
                        );
                      }

                      const key = sourceItemKey(item);
                      return (
                        <SourceItemRow
                          key={key}
                          item={item}
                          projectId={manifest?.project_id}
                          parentTitle={
                            item.parent_source_id
                              ? sourceTitlesById.get(item.parent_source_id)
                              : undefined
                          }
                          selected={
                            selectedPreview.kind === 'source' && selectedPreview.key === key
                          }
                          disabled={disabled}
                          onPreview={() => setSelectedPreview({ kind: 'source', key })}
                          onAssertionToggle={onAssertionToggle}
                        />
                      );
                    })
                  ) : (
                    <EmptyState>No included context sources.</EmptyState>
                  )}
                </div>
              </Pane>
              <Pane title="Preview" meta="not navigation">
                <PreviewPanel
                  manifest={manifest}
                  sourceItemsByKey={sourceItemsByKey}
                  selectedPreview={selectedPreview}
                />
              </Pane>
            </div>
          </div>
        )}

        {activeTab === 'baseline' && (
          <div role="tabpanel" aria-label="Baseline" className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_240px] gap-2 max-sm:grid-cols-1">
              <div className="min-h-0 overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
                {manifest?.baseline.content ? (
                  <CommitYAMLDocument content={manifest.baseline.content} />
                ) : (
                  <EmptyState>No baseline commit.</EmptyState>
                )}
              </div>
              <aside className="min-h-0 overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Baseline inherited
                </h3>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                  Automatic semantic baseline from the parent commit.
                </p>
                <dl className="mt-3 space-y-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Commit</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {shortHash(manifest?.baseline.commit_hash)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Branch</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {manifest?.baseline.branch ?? sourcePicker?.baseline?.branch ?? 'none'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Nodes</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {manifest?.baseline.node_count ?? 0}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">Relations</dt>
                    <dd className="font-mono text-[var(--text-secondary)]">
                      {manifest?.baseline.relation_count ?? 0}
                    </dd>
                  </div>
                </dl>
                <BaselineActions manifest={manifest} sourcePicker={sourcePicker} />
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div
            role="tabpanel"
            aria-label="Materials"
            className="min-h-0 flex-1 overflow-hidden p-2"
          >
            <div className="grid h-full min-h-0 grid-cols-1">
              <Pane title="Materials" meta={`${usedMaterialSourceItems.length} used`}>
                <div className="space-y-1">
                  {canUploadMaterial && (
                    <div className="flex items-center justify-end px-2 pb-1">
                      <button
                        type="button"
                        aria-label="Add material"
                        onClick={() => materialUploadInputRef.current?.click()}
                        disabled={disabled || sourcePicker?.materialUploading}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--source)]/25 bg-[var(--source)]/10 px-2 py-1 text-[10px] font-medium text-[var(--source)] transition-colors hover:bg-[var(--source)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sourcePicker?.materialUploading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        Add material
                      </button>
                      <input
                        ref={materialUploadInputRef}
                        type="file"
                        aria-label="Add material file"
                        className="sr-only"
                        accept=".pdf,.doc,.docx,.md,.markdown,.txt,.html,.htm,text/plain,text/markdown,text/html,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) {
                            void sourcePicker?.onUploadMaterial?.(file);
                          }
                          event.currentTarget.value = '';
                        }}
                      />
                    </div>
                  )}
                  {usedMaterialSourceItems.length > 0 ? (
                    usedMaterialSourceItems.map((item) => (
                      <MaterialSourceRow
                        key={sourceItemKey(item)}
                        item={item}
                        disabled={disabled}
                        onReferenceToggle={onReferenceToggle}
                        onOpenMaterial={sourcePicker?.onOpenMaterial}
                      />
                    ))
                  ) : (
                    <EmptyState>No materials in context.</EmptyState>
                  )}

                  {(showAvailableMaterials || showAvailableLeaves) && (
                    <div className="mt-2 space-y-1 border-t border-[var(--stroke-divider)] pt-2">
                      <div className="px-2 text-[10px] font-medium uppercase tracking-normal text-[var(--text-tertiary)]">
                        Available materials
                      </div>
                      {sourcePicker?.availableMaterialsLoading ? (
                        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading uploaded materials...
                        </div>
                      ) : sourcePicker?.availableMaterialsError ? (
                        <div className="rounded-md border border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-2 py-1.5 text-xs text-[var(--status-error)]">
                          {sourcePicker.availableMaterialsError}
                        </div>
                      ) : (
                        availableMaterialOptions.map((material) => (
                          <AvailableMaterialRow
                            key={material.id}
                            material={material}
                            pinning={materialPinningIds.has(material.id)}
                            onPinMaterial={sourcePicker?.onPinMaterial}
                            onOpenMaterial={sourcePicker?.onOpenMaterial}
                          />
                        ))
                      )}
                      {sourcePicker?.availableLeavesLoading ? (
                        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading materials...
                        </div>
                      ) : sourcePicker?.availableLeavesError ? (
                        <div className="rounded-md border border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-2 py-1.5 text-xs text-[var(--status-error)]">
                          {sourcePicker.availableLeavesError}
                        </div>
                      ) : availableLeafOptions.length > 0 ? (
                        availableLeafOptions.map((leaf) => (
                          <AvailableLeafRow
                            key={leaf.id}
                            leaf={leaf}
                            pinning={leafPinningIds.has(leaf.id)}
                            onPinLeaf={sourcePicker?.onPinLeaf}
                          />
                        ))
                      ) : availableLeaves.length === 0 && availableMaterials.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          No project materials available.
                        </p>
                      ) : availableLeafOptions.length === 0 &&
                        availableMaterialOptions.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          All project materials are already added.
                        </p>
                      ) : null}
                      {!sourcePicker?.availableLeavesLoading &&
                      !sourcePicker?.availableLeavesError &&
                      availableLeafOptions.length === 0 &&
                      availableLeaves.length > 0 &&
                      availableMaterialOptions.length > 0 ? (
                        <p className="sr-only">All leaf materials are already added.</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </Pane>
            </div>
          </div>
        )}

        {activeTab === 'lessons' && (
          <div role="tabpanel" aria-label="Lessons" className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] gap-2 max-sm:grid-cols-1">
              <Pane
                title="Lessons"
                meta={`${effectiveLessons.length}/${lessonSourceItems.length} effective`}
              >
                {lessonSourceItems.length > 0 ? (
                  <div className="space-y-1">
                    {lessonSourceItems.map((item) => {
                      const key = sourceItemKey(item);
                      return (
                        <SourceItemRow
                          key={key}
                          item={item}
                          projectId={manifest?.project_id}
                          parentTitle={
                            item.parent_source_id
                              ? (sourceTitlesById.get(item.parent_source_id) ??
                                item.parent_source_id)
                              : undefined
                          }
                          selected={
                            selectedPreview.kind === 'source' && selectedPreview.key === key
                          }
                          disabled={disabled}
                          onPreview={() => setSelectedPreview({ kind: 'source', key })}
                          onAssertionToggle={onAssertionToggle}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState>No lessons selected from prior outputs.</EmptyState>
                )}
              </Pane>
              <Pane title="Preview" meta="not evidence">
                <PreviewPanel
                  manifest={manifest}
                  sourceItemsByKey={sourceItemsByKey}
                  selectedPreview={selectedPreview}
                />
              </Pane>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
