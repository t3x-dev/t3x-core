'use client';

import { AlertCircle, ArrowLeft, FileText, Loader2, Plus, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useMaterialDetail } from '@/hooks/materials/useMaterialDetail';
import type { MaterialDetail, MaterialSegment } from '@/types/api';
import { cn } from '@/utils/cn';

type ReaderTab = 'parsed' | 'segments' | 'metadata' | 'usage';

export interface MaterialReaderContextStatus {
  title: string;
  included: boolean;
  pinId: string | null;
}

export interface MaterialReaderSelection {
  projectId: string;
  materialId: string;
  context?: MaterialReaderContextStatus | null;
}

export interface MaterialReaderProps {
  selection: MaterialReaderSelection;
  onBack: () => void;
  onAddToChat?: (materialId: string) => void | Promise<void>;
  onRemoveFromChat?: (pinId: string) => void | Promise<void>;
  disabled?: boolean;
}

export function MaterialReader({
  selection,
  onBack,
  onAddToChat,
  onRemoveFromChat,
  disabled,
}: MaterialReaderProps) {
  const { material, loading, error, reload } = useMaterialDetail(
    selection.projectId,
    selection.materialId
  );
  const [activeTab, setActiveTab] = useState<ReaderTab>('parsed');
  const [query, setQuery] = useState('');
  const filteredSegments = useMemo(() => {
    if (!material) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return material.segments;
    return material.segments.filter((segment) => segment.text.toLowerCase().includes(needle));
  }, [material, query]);

  if (loading && !material) {
    return (
      <ReaderShell>
        <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.4} />
          <p className="text-sm font-medium">Loading material...</p>
        </div>
      </ReaderShell>
    );
  }

  if (error || !material) {
    return (
      <ReaderShell>
        <div className="mx-auto flex h-full max-w-[520px] flex-col items-center justify-center gap-3 px-5 text-center">
          <AlertCircle className="h-8 w-8 text-[var(--status-error)]" strokeWidth={1.5} />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Material unavailable
            </h2>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {error?.message ?? 'Failed to load material'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void reload();
            }}
            className="rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
          >
            Retry
          </button>
        </div>
      </ReaderShell>
    );
  }

  const context = selection.context;
  const title = material.title || material.filename || material.id;
  const canRemove = Boolean(context?.included && context.pinId && onRemoveFromChat);
  const canAdd = Boolean(!context?.included && onAddToChat);

  return (
    <ReaderShell>
      <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
        <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
          <div className="flex min-h-9 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to chat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {title}
                </h1>
                <StatusBadge status={material.parse_quality.status} />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">
                Material Reader · {material.source_type} source ·{' '}
                {context?.included ? 'added to current chat' : 'not added to current chat'}
              </p>
            </div>
            {canRemove ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (context?.pinId) void onRemoveFromChat?.(context.pinId);
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--status-error-muted)] hover:text-[var(--status-error)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Remove from chat
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled || !canAdd}
                onClick={() => {
                  void onAddToChat?.(material.id);
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--source)]/25 bg-[var(--source)]/10 px-2.5 text-[11px] font-medium text-[var(--source)] hover:bg-[var(--source)]/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to chat
              </button>
            )}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3">
          <main className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
            <MaterialSummary material={material} />
            <ReaderTabs activeTab={activeTab} onChange={setActiveTab} material={material} />
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--stroke-divider)] px-3 py-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search parsed text"
                  className="h-8 w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] pl-7 pr-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)] focus:border-[var(--source)]/40"
                />
              </div>
              <span className="shrink-0 rounded-md bg-[var(--surface-elevated)] px-2 py-1 text-[10px] text-[var(--text-tertiary)]">
                {filteredSegments.length} / {material.segment_count} sections
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {activeTab === 'parsed' && (
                <ParsedTextView segments={filteredSegments} query={query} />
              )}
              {activeTab === 'segments' && (
                <SegmentListView segments={filteredSegments} query={query} />
              )}
              {activeTab === 'metadata' && <MetadataView material={material} />}
              {activeTab === 'usage' && <UsageView material={material} context={context ?? null} />}
            </div>
          </main>

          <aside className="min-h-0 overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 lg:hidden">
            <SourceDetailsContent material={material} selection={selection} compact />
          </aside>
        </div>
      </div>
    </ReaderShell>
  );
}

export function MaterialSourceDetails({
  selection,
  onBackToChat,
}: {
  selection: MaterialReaderSelection;
  onBackToChat: () => void;
}) {
  const { material, loading, error, reload } = useMaterialDetail(
    selection.projectId,
    selection.materialId
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--workspace-panel)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--stroke-divider)] px-3">
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-normal text-[var(--text-tertiary)]">
          Source Details
        </span>
        <button
          type="button"
          onClick={onBackToChat}
          className="rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
        >
          Back to chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && !material ? (
          <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error || !material ? (
          <div className="space-y-3 rounded-lg border border-[var(--status-error)]/20 bg-[var(--status-error-muted)] p-3 text-xs text-[var(--status-error)]">
            <p>{error?.message ?? 'Failed to load material'}</p>
            <button
              type="button"
              onClick={() => {
                void reload();
              }}
              className="rounded-md border border-[var(--status-error)]/25 px-2 py-1 font-medium"
            >
              Retry
            </button>
          </div>
        ) : (
          <SourceDetailsContent material={material} selection={selection} />
        )}
      </div>
    </div>
  );
}

function ReaderShell({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col">{children}</div>;
}

function StatusBadge({ status }: { status: MaterialDetail['parse_quality']['status'] }) {
  const label =
    status === 'empty'
      ? 'Empty'
      : status === 'poor'
        ? 'Poor'
        : status === 'partial'
          ? 'Partial'
          : 'Ready';
  const tone =
    status === 'ready'
      ? 'border-[var(--status-success)]/25 bg-[var(--status-success)]/10 text-[var(--status-success)]'
      : status === 'partial'
        ? 'border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
        : 'border-[var(--status-error)]/25 bg-[var(--status-error-muted)] text-[var(--status-error)]';
  return (
    <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone)}>
      {label}
    </span>
  );
}

function MaterialSummary({ material }: { material: MaterialDetail }) {
  const stats = [
    ['Pages', material.page_count ? String(material.page_count) : 'n/a'],
    ['Tokens', formatNumber(material.token_estimate)],
    ['Sections', formatNumber(material.segment_count)],
    ['MIME', material.mime_type ?? 'unknown'],
  ];

  return (
    <div className="grid shrink-0 grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(90px,0.5fr))] gap-2 border-b border-[var(--stroke-divider)] p-3 max-xl:grid-cols-2">
      <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--source)]/25 bg-[var(--source)]/10 text-[var(--source)]">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {material.title || material.filename || material.id}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
            Parsed text preview. Original layout is not preserved in this MVP.
          </p>
        </div>
      </div>
      {stats.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-3"
        >
          <p className="text-[10px] font-medium text-[var(--text-tertiary)]">{label}</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-[var(--text-primary)]">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ReaderTabs({
  activeTab,
  onChange,
  material,
}: {
  activeTab: ReaderTab;
  onChange: (tab: ReaderTab) => void;
  material: MaterialDetail;
}) {
  const tabs: Array<[ReaderTab, string, string]> = [
    ['parsed', 'Parsed Text', material.page_count ? `${material.page_count} pages` : 'text'],
    ['segments', 'Segments', `${material.segment_count}`],
    ['metadata', 'Metadata', ''],
    ['usage', 'Usage', ''],
  ];

  return (
    <div
      role="tablist"
      aria-label="Material reader views"
      className="flex h-10 shrink-0 items-end gap-1 border-b border-[var(--stroke-divider)] px-3"
    >
      {tabs.map(([tab, label, meta]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => onChange(tab)}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-xs font-medium transition-colors',
            activeTab === tab
              ? 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          )}
        >
          {label}
          {meta && (
            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{meta}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ParsedTextView({ segments, query }: { segments: MaterialSegment[]; query: string }) {
  if (segments.length === 0) return <EmptyReaderState>No parsed text available.</EmptyReaderState>;

  return (
    <div className="space-y-3">
      {segments.map((segment) => (
        <article
          key={segment.id}
          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-normal text-[var(--text-tertiary)]">
              {segment.label}
            </h2>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
              {formatNumber(segment.token_estimate)} tokens
            </span>
          </div>
          <div className="space-y-3 p-3 text-sm leading-7 text-[var(--text-primary)]">
            {segment.text.split(/\n\s*\n+/).map((paragraph, index) => (
              <p key={`${segment.id}:${index}`}>{highlight(paragraph, query)}</p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function SegmentListView({ segments, query }: { segments: MaterialSegment[]; query: string }) {
  if (segments.length === 0) return <EmptyReaderState>No matching segments.</EmptyReaderState>;

  return (
    <div className="space-y-2">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="grid grid-cols-[76px_minmax(0,1fr)_80px] gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-3 text-xs max-md:grid-cols-1"
        >
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{segment.label}</span>
          <p className="min-w-0 leading-6 text-[var(--text-secondary)]">
            {highlight(segment.text, query)}
          </p>
          <span className="text-right font-mono text-[10px] text-[var(--text-tertiary)] max-md:text-left">
            {formatNumber(segment.token_estimate)} tokens
          </span>
        </div>
      ))}
    </div>
  );
}

function MetadataView({ material }: { material: MaterialDetail }) {
  const entries = Object.entries(material.metadata ?? {});
  if (entries.length === 0) return <EmptyReaderState>No metadata recorded.</EmptyReaderState>;

  return (
    <dl className="divide-y divide-[var(--stroke-divider)] rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 px-3 py-2 text-xs">
          <dt className="font-mono text-[10px] text-[var(--text-tertiary)]">{key}</dt>
          <dd className="min-w-0 break-words font-mono text-[11px] text-[var(--text-secondary)]">
            {stringifyMetadata(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function UsageView({
  material,
  context,
}: {
  material: MaterialDetail;
  context: MaterialReaderContextStatus | null;
}) {
  return (
    <div className="grid gap-3 text-xs md:grid-cols-2">
      <UsageCard label="This chat" value={context?.included ? 'added' : 'not added'} />
      <UsageCard label="Prompt policy" value="selected material text" />
      <UsageCard label="Current budget" value={`${formatNumber(material.token_estimate)} tokens`} />
      <UsageCard label="Content hash" value={material.content_hash.slice(0, 12)} mono />
    </div>
  );
}

function SourceDetailsContent({
  material,
  selection,
  compact,
}: {
  material: MaterialDetail;
  selection: MaterialReaderSelection;
  compact?: boolean;
}) {
  const context = selection.context;
  const selectedSegments = material.segments.slice(0, compact ? 3 : 6);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label="Parse Quality" meta={material.parse_quality.status} />
        <div className="flex gap-3 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--status-success)]/25 bg-[var(--status-success)]/10 font-mono text-[10px] font-bold text-[var(--status-success)]">
            {Math.round(material.parse_quality.score * 100)}%
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {material.parse_quality.status === 'ready' ? 'Good extraction' : 'Needs inspection'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
              {material.parse_quality.message}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label="This Chat" meta={context?.included ? 'added' : 'available'} />
        <dl className="divide-y divide-[var(--stroke-divider)] text-xs">
          <DetailRow label="Status" value={context?.included ? 'added' : 'not added'} />
          <DetailRow label="Segments" value={`${material.segment_count}`} />
          <DetailRow label="Prompt tokens" value={formatNumber(material.token_estimate)} />
          <DetailRow label="Pin" value={context?.pinId ?? 'none'} mono />
        </dl>
      </section>

      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label="Selected Segments" meta="preview" />
        <div className="divide-y divide-[var(--stroke-divider)]">
          {selectedSegments.map((segment) => (
            <div
              key={segment.id}
              className="grid grid-cols-[8px_minmax(0,1fr)_auto] gap-2 px-3 py-2"
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-[var(--source)]" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                  {segment.label}
                </span>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  {formatNumber(segment.token_estimate)} tokens
                </span>
              </span>
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {segment.index}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label="Metadata" meta="collapsed" />
        <dl className="divide-y divide-[var(--stroke-divider)] text-xs">
          <DetailRow label="Material ID" value={material.id} mono />
          <DetailRow label="MIME" value={material.mime_type ?? 'unknown'} mono />
          <DetailRow label="Filename" value={material.filename ?? 'none'} />
        </dl>
      </section>
    </div>
  );
}

function SectionTitle({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3">
      <h3 className="text-[10px] font-bold uppercase tracking-normal text-[var(--text-tertiary)]">
        {label}
      </h3>
      {meta && (
        <span className="rounded-md bg-[var(--surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
          {meta}
        </span>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 px-3 py-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right text-[var(--text-secondary)]',
          mono && 'font-mono text-[10px]'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function UsageCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-3">
      <p className="text-[10px] font-medium text-[var(--text-tertiary)]">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold text-[var(--text-primary)]',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyReaderState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[var(--stroke-default)] text-xs text-[var(--text-tertiary)]">
      {children}
    </div>
  );
}

function highlight(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;

  const lower = text.toLowerCase();
  const start = lower.indexOf(needle.toLowerCase());
  if (start < 0) return text;

  const end = start + needle.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-[var(--source)]/15 px-0.5 text-[var(--text-primary)]">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function stringifyMetadata(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
