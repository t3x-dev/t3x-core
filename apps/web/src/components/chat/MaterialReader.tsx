'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { isValidElement, useMemo, useState } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  const profile = materialProfile(material);

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
                Source Inspector · {profile.fileTypeLabel.toLowerCase()} source ·{' '}
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
                  placeholder={profile.searchPlaceholder}
                  className="h-8 w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] pl-7 pr-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)] focus:border-[var(--source)]/40"
                />
              </div>
              <span className="shrink-0 rounded-md bg-[var(--surface-elevated)] px-2 py-1 text-[10px] text-[var(--text-tertiary)]">
                {filteredSegments.length} / {chunkCountLabel(material.segment_count)}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {activeTab === 'parsed' && (
                <ContentPreviewView material={material} segments={filteredSegments} query={query} />
              )}
              {activeTab === 'segments' && (
                <SegmentListView material={material} segments={filteredSegments} query={query} />
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

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <MarkdownHeading level={1}>{children}</MarkdownHeading>,
  h2: ({ children }) => <MarkdownHeading level={2}>{children}</MarkdownHeading>,
  h3: ({ children }) => <MarkdownHeading level={3}>{children}</MarkdownHeading>,
  p: ({ children }) => (
    <p className="my-3 text-sm leading-7 text-[var(--text-secondary)]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-sm leading-7 text-[var(--text-secondary)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-sm leading-7 text-[var(--text-secondary)]">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-[var(--source)]/40 pl-3 text-sm leading-7 text-[var(--text-tertiary)]">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-[var(--stroke-divider)]">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--surface-panel)]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[var(--stroke-divider)] px-3 py-2 font-semibold text-[var(--text-primary)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--stroke-divider)] px-3 py-2 text-[var(--text-secondary)]">
      {children}
    </td>
  ),
  code: ({ children }) => (
    <code className="rounded-sm bg-[var(--surface-panel)] px-1 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 text-xs leading-6">
      {children}
    </pre>
  ),
};

function markdownComponentsWithHeadings(headings: DocumentHeading[]): Components {
  const idsByText = new Map<string, string[]>();
  for (const heading of headings) {
    idsByText.set(heading.text, [...(idsByText.get(heading.text) ?? []), heading.id]);
  }

  const nextHeadingId = (children: ReactNode) => {
    const text = cleanMarkdownHeading(childrenToText(children));
    const ids = idsByText.get(text);
    const id = ids?.shift();
    return id ?? slugify(text);
  };

  return {
    ...MARKDOWN_COMPONENTS,
    h1: ({ children }) => (
      <MarkdownHeading level={1} id={nextHeadingId(children)}>
        {children}
      </MarkdownHeading>
    ),
    h2: ({ children }) => (
      <MarkdownHeading level={2} id={nextHeadingId(children)}>
        {children}
      </MarkdownHeading>
    ),
    h3: ({ children }) => (
      <MarkdownHeading level={3} id={nextHeadingId(children)}>
        {children}
      </MarkdownHeading>
    ),
  };
}

function MarkdownHeading({
  level,
  id,
  children,
}: {
  level: 1 | 2 | 3;
  id?: string;
  children: ReactNode;
}) {
  const headingId = id ?? headingIdFromChildren(children);

  if (level === 1) {
    return (
      <h1
        id={headingId}
        className="mb-4 scroll-mt-4 text-lg font-semibold leading-tight text-[var(--text-primary)]"
      >
        {children}
      </h1>
    );
  }

  if (level === 2) {
    return (
      <h2
        id={headingId}
        className="mb-3 mt-5 scroll-mt-4 text-base font-semibold leading-tight text-[var(--text-primary)]"
      >
        {children}
      </h2>
    );
  }

  return (
    <h3
      id={headingId}
      className="mb-2 mt-4 scroll-mt-4 text-sm font-semibold leading-tight text-[var(--text-primary)]"
    >
      {children}
    </h3>
  );
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
  const profile = materialProfile(material);
  const stats = materialSummaryStats(material, profile);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--stroke-divider)] p-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--source)]/25 bg-[var(--source)]/10 text-[var(--source)]">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {material.title || material.filename || material.id}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
            {profile.summaryDescription}
          </p>
        </div>
      </div>
      <ul
        aria-label="Material summary stats"
        className="hidden min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5 text-[10px] text-[var(--text-tertiary)] md:flex"
      >
        {stats.map((value) => (
          <li
            key={value}
            className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-2 py-1 font-mono"
          >
            {value}
          </li>
        ))}
      </ul>
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
  const profile = materialProfile(material);
  const tabs: Array<[ReaderTab, string, string]> = [
    ['parsed', profile.contentTabLabel, profile.contentTabMeta],
    ['segments', profile.structureTabLabel, profile.structureTabMeta],
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

function ContentPreviewView({
  material,
  segments,
  query,
}: {
  material: MaterialDetail;
  segments: MaterialSegment[];
  query: string;
}) {
  const profile = materialProfile(material);
  if (segments.length === 0) return <EmptyReaderState>{profile.emptyState}</EmptyReaderState>;
  const limitsNotice = <ExtractionLimitsNotice material={material} />;

  if (profile.kind === 'spreadsheet') {
    return (
      <div className="space-y-3">
        {limitsNotice}
        <SpreadsheetPreviewView material={material} segments={segments} query={query} />
      </div>
    );
  }

  if (profile.prefersDocumentPreview && !query.trim()) {
    return (
      <div className="space-y-3">
        {limitsNotice}
        <DocumentPreviewView material={material} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {limitsNotice}
      <ParsedTextView material={material} segments={segments} query={query} />
    </div>
  );
}

function ExtractionLimitsNotice({ material }: { material: MaterialDetail }) {
  const notice = extractionLimitsNotice(material);
  if (!notice) return null;

  return (
    <section
      aria-label="Extraction limits"
      className={cn(
        'rounded-lg border p-3 text-xs',
        notice.tone === 'warning'
          ? 'border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] text-[var(--text-secondary)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
      )}
    >
      <div className="flex gap-2">
        <AlertCircle
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            notice.tone === 'warning'
              ? 'text-[var(--status-warning)]'
              : 'text-[var(--text-tertiary)]'
          )}
        />
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-[var(--text-primary)]">{notice.title}</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed text-[11px]">
            {notice.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function DocumentPreviewView({ material }: { material: MaterialDetail }) {
  const headings = documentHeadings(material.content_text);
  const outlineHeadings = headings.slice(0, 12);

  return (
    <div className="mx-auto max-w-[960px] space-y-3">
      {outlineHeadings.length > 0 && <DocumentOutline headings={outlineHeadings} />}
      <article className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-5">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponentsWithHeadings(headings)}
        >
          {material.content_text}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function DocumentOutline({ headings }: { headings: DocumentHeading[] }) {
  return (
    <nav
      aria-label="Document outline"
      className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]"
    >
      <div className="flex h-9 items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3">
        <h2 className="text-[10px] font-bold uppercase tracking-normal text-[var(--text-tertiary)]">
          Document outline
        </h2>
        <span className="rounded-md bg-[var(--surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
          {headings.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 p-3">
        {headings.map((heading) => (
          <a
            key={`${heading.id}:${heading.level}:${heading.text}`}
            href={`#${heading.id}`}
            className={cn(
              'rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--source)]/30 hover:text-[var(--text-primary)]',
              heading.level > 1 && 'text-[var(--text-tertiary)]'
            )}
          >
            {heading.text}
          </a>
        ))}
      </div>
    </nav>
  );
}

interface DocumentHeading {
  id: string;
  text: string;
  level: number;
}

function documentHeadings(markdown: string): DocumentHeading[] {
  const usedIds = new Map<string, number>();

  return markdown.split('\n').flatMap((line): DocumentHeading[] => {
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line.trim());
    if (!match) return [];

    const text = cleanMarkdownHeading(match[2]);
    if (!text) return [];

    return [
      {
        id: uniqueSlug(slugify(text), usedIds),
        text,
        level: match[1].length,
      },
    ];
  });
}

function cleanMarkdownHeading(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .trim();
}

function headingIdFromChildren(children: ReactNode): string {
  return slugify(childrenToText(children));
}

function childrenToText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return childrenToText(children.props.children);
  }
  return '';
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

function uniqueSlug(base: string, used: Map<string, number>): string {
  const nextCount = (used.get(base) ?? 0) + 1;
  used.set(base, nextCount);
  return nextCount === 1 ? base : `${base}-${nextCount}`;
}

function SpreadsheetPreviewView({
  material,
  segments,
  query,
}: {
  material: MaterialDetail;
  segments: MaterialSegment[];
  query: string;
}) {
  const sheetNames = spreadsheetSheetNames(material);
  const sheetCount = spreadsheetSheetCount(material);
  const rowCount = metadataNumber(material.metadata, ['row_count', 'rows']);
  const columnCount = metadataNumber(material.metadata, ['column_count', 'columns']);
  const formulaCount = metadataNumber(material.metadata, ['formula_count', 'formulas']) ?? 0;
  const truncatedSheetCount =
    metadataNumber(material.metadata, ['truncated_sheet_count', 'truncated_sheets']) ?? 0;
  const sheetPreviews = workbookSheetPreviews(material.content_text);
  const sheetLinks =
    sheetPreviews.length > 0
      ? sheetPreviews.map((sheet) => ({ id: sheet.id, name: sheet.name }))
      : sheetNames.map((sheetName) => ({ id: `sheet-${slugify(sheetName)}`, name: sheetName }));

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <div className="border-b border-[var(--stroke-divider)] p-3">
          <h2 className="text-xs font-semibold text-[var(--text-primary)]">Workbook overview</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
            Spreadsheet content is shown as extracted workbook text. Tables, formulas, merged cells,
            and hidden sheets may not be fully preserved.
          </p>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--stroke-divider)] text-xs md:grid-cols-3 xl:grid-cols-6">
          <SpreadsheetMetric label="Sheets" value={sheetCount ? formatNumber(sheetCount) : 'n/a'} />
          <SpreadsheetMetric label="Rows" value={rowCount ? formatNumber(rowCount) : 'unknown'} />
          <SpreadsheetMetric
            label="Columns"
            value={columnCount ? formatNumber(columnCount) : 'unknown'}
          />
          <SpreadsheetMetric label="Formula cells" value={formatNumber(formulaCount)} />
          <SpreadsheetMetric label="Tokens" value={formatNumber(material.token_estimate)} />
          {truncatedSheetCount > 0 && (
            <SpreadsheetMetric label="Truncated sheets" value={formatNumber(truncatedSheetCount)} />
          )}
        </dl>
        {sheetLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--stroke-divider)] p-3">
            {sheetLinks.map((sheet) => (
              <a
                key={sheet.id}
                href={`#${sheet.id}`}
                className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
              >
                {sheet.name}
              </a>
            ))}
          </div>
        )}
      </section>
      <WorkbookWarnings formulaCount={formulaCount} truncatedSheetCount={truncatedSheetCount} />
      {!query.trim() && sheetPreviews.length > 0 ? (
        <WorkbookSheetPreviewList sheets={sheetPreviews} />
      ) : (
        <ParsedTextView material={material} segments={segments} query={query} />
      )}
    </div>
  );
}

function WorkbookWarnings({
  formulaCount,
  truncatedSheetCount,
}: {
  formulaCount: number;
  truncatedSheetCount: number;
}) {
  const warnings: string[] = [];
  if (formulaCount > 0) {
    warnings.push(
      `${formatNumber(formulaCount)} formula cells were detected. The preview shows extracted cell values, not the workbook's formula logic.`
    );
  }
  if (truncatedSheetCount > 0) {
    warnings.push(
      `${formatNumber(truncatedSheetCount)} sheet${truncatedSheetCount === 1 ? ' was' : 's were'} truncated during import.`
    );
  }

  if (warnings.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] p-3 text-xs text-[var(--status-warning)]">
      <div className="flex gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1.5">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkbookSheetPreviewList({ sheets }: { sheets: WorkbookSheetPreview[] }) {
  return (
    <div className="space-y-3">
      {sheets.map((sheet) => (
        <section
          key={sheet.id}
          id={sheet.id}
          aria-label={`${sheet.name} sheet preview`}
          className="scroll-mt-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2">
            <div className="min-w-0">
              <h3 className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {sheet.name}
              </h3>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                {sheet.rows ? `${formatNumber(sheet.rows)} rows` : 'rows unknown'} ·{' '}
                {sheet.columns ? `${formatNumber(sheet.columns)} columns` : 'columns unknown'}
              </p>
            </div>
            <span className="rounded-md bg-[var(--surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
              Sheet preview
            </span>
          </div>
          <div className="p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {sheet.markdown || 'No non-empty cells found.'}
            </ReactMarkdown>
          </div>
        </section>
      ))}
    </div>
  );
}

interface WorkbookSheetPreview {
  id: string;
  name: string;
  rows: number | null;
  columns: number | null;
  markdown: string;
}

function workbookSheetPreviews(markdown: string): WorkbookSheetPreview[] {
  const sheets: WorkbookSheetPreview[] = [];
  const usedIds = new Map<string, number>();
  let current: WorkbookSheetPreview | null = null;
  let markdownLines: string[] = [];

  const finishCurrent = () => {
    if (!current) return;
    current.markdown = markdownLines.join('\n').trim();
    sheets.push(current);
    markdownLines = [];
  };

  for (const line of markdown.split('\n')) {
    const sheetMatch = /^##\s+Sheet:\s*(.+?)\s*$/.exec(line.trim());
    if (sheetMatch) {
      finishCurrent();
      const name = sheetMatch[1].trim();
      current = {
        id: uniqueSlug(`sheet-${slugify(name)}`, usedIds),
        name,
        rows: null,
        columns: null,
        markdown: '',
      };
      continue;
    }

    if (!current) continue;

    const metricsMatch = /^Rows:\s*(\d+)\s*\|\s*Columns:\s*(\d+)/i.exec(line.trim());
    if (metricsMatch) {
      current.rows = Number.parseInt(metricsMatch[1], 10);
      current.columns = Number.parseInt(metricsMatch[2], 10);
      continue;
    }

    markdownLines.push(line);
  }

  finishCurrent();
  return sheets.slice(0, 12);
}

function SpreadsheetMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3">
      <dt className="text-[10px] font-medium text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs font-semibold text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  );
}

function ParsedTextView({
  material,
  segments,
  query,
}: {
  material: MaterialDetail;
  segments: MaterialSegment[];
  query: string;
}) {
  const profile = materialProfile(material);
  if (segments.length === 0) return <EmptyReaderState>{profile.emptyState}</EmptyReaderState>;

  return (
    <div className="space-y-3">
      {segments.map((segment) => (
        <article
          key={segment.id}
          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-normal text-[var(--text-tertiary)]">
              {segmentDisplayLabel(segment, profile)}
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

function SegmentListView({
  material,
  segments,
  query,
}: {
  material: MaterialDetail;
  segments: MaterialSegment[];
  query: string;
}) {
  const profile = materialProfile(material);
  if (segments.length === 0) return <EmptyReaderState>{profile.emptySearchState}</EmptyReaderState>;

  return (
    <div className="space-y-2">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="grid grid-cols-[76px_minmax(0,1fr)_80px] gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-3 text-xs max-md:grid-cols-1"
        >
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
            {segmentDisplayLabel(segment, profile)}
          </span>
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
  const profile = materialProfile(material);
  return (
    <div className="grid gap-3 text-xs md:grid-cols-2">
      <UsageCard label="This chat" value={context?.included ? 'added' : 'not added'} />
      <UsageCard
        label="Prompt text"
        value={context?.included ? profile.promptIncludedLabel : 'not included'}
      />
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
  const profile = materialProfile(material);
  const previewSegments = material.segments.slice(0, compact ? 3 : 6);
  const parseSummary = parseQualitySummary(material, profile);
  const ParseIcon = material.parse_quality.status === 'ready' ? CheckCircle2 : AlertCircle;
  const previewTitle = context?.included ? profile.includedPreviewTitle : profile.previewTitle;
  const contextSummary = sourceContextSummary(material, context ?? null, profile);
  const previewSummary = sourcePreviewSummary(
    material,
    context ?? null,
    previewSegments.length,
    profile
  );

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label="This Chat" meta={context?.included ? 'added' : 'available'} />
        <div className="border-b border-[var(--stroke-divider)] p-3">
          <div
            className={cn(
              'rounded-lg border px-3 py-2',
              context?.included
                ? 'border-[var(--source)]/25 bg-[var(--source)]/10'
                : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)]'
            )}
          >
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {contextSummary.title}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-[var(--text-tertiary)]">
              {contextSummary.detail}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-[var(--stroke-divider)] text-xs">
          <DetailRow label="Status" value={context?.included ? 'added' : 'not added'} />
          <DetailRow
            label="Prompt text"
            value={context?.included ? profile.promptIncludedLabel : 'not included'}
          />
          <DetailRow label="Prompt tokens" value={formatNumber(material.token_estimate)} />
          <DetailRow label="Chunks" value={`${material.segment_count}`} />
        </dl>
      </section>

      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label="Text Parse" meta={material.parse_quality.status} />
        <div className="flex gap-3 p-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
              parseSummary.tone
            )}
          >
            <ParseIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{parseSummary.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
              {parseSummary.description}
            </p>
          </div>
        </div>
      </section>

      <ExtractionLimitsDetails material={material} />

      <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
        <SectionTitle label={previewTitle} meta="preview" />
        <p className="border-b border-[var(--stroke-divider)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
          {previewSummary}
        </p>
        <div className="divide-y divide-[var(--stroke-divider)]">
          {previewSegments.map((segment) => (
            <div
              key={segment.id}
              className="grid grid-cols-[8px_minmax(0,1fr)_auto] gap-2 px-3 py-2"
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-[var(--source)]" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                  {segmentDisplayLabel(segment, profile)}
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
        <SectionTitle label="File" meta="metadata" />
        <dl className="divide-y divide-[var(--stroke-divider)] text-xs">
          <DetailRow label="File type" value={profile.fileTypeLabel} />
          <DetailRow label="Material ID" value={material.id} mono />
          <DetailRow label="Context pin" value={context?.pinId ?? 'none'} mono />
          <DetailRow label="MIME" value={material.mime_type ?? 'unknown'} mono />
          <DetailRow label="Filename" value={material.filename ?? 'none'} />
        </dl>
      </section>
    </div>
  );
}

function ExtractionLimitsDetails({ material }: { material: MaterialDetail }) {
  const notice = extractionLimitsNotice(material);
  if (!notice) return null;

  return (
    <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)]">
      <SectionTitle label="Extraction Limits" meta={notice.tone === 'warning' ? 'check' : 'info'} />
      <div className="space-y-1.5 p-3 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
        {notice.items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </section>
  );
}

type MaterialKind = 'pdf' | 'document' | 'spreadsheet' | 'text';

interface ExtractionLimitNotice {
  title: string;
  items: string[];
  tone: 'info' | 'warning';
}

interface MaterialProfile {
  kind: MaterialKind;
  fileTypeLabel: string;
  summaryDescription: string;
  contentTabLabel: string;
  contentTabMeta: string;
  structureTabLabel: string;
  structureTabMeta: string;
  primaryMeasure: string;
  searchPlaceholder: string;
  emptyState: string;
  emptySearchState: string;
  promptIncludedLabel: string;
  includedSummaryTitle: string;
  availableSummaryTitle: string;
  includedPreviewTitle: string;
  previewTitle: string;
  prefersDocumentPreview: boolean;
}

function materialProfile(material: MaterialDetail): MaterialProfile {
  const kind = detectMaterialKind(material);
  const chunks = chunkCountLabel(material.segment_count);

  if (kind === 'spreadsheet') {
    const sheetCount = spreadsheetSheetCount(material);
    const sheetMeasure = sheetCount ? `${formatNumber(sheetCount)} sheets` : 'sheets unknown';
    return {
      kind,
      fileTypeLabel: 'Spreadsheet',
      summaryDescription:
        'Workbook preview generated from extracted sheet text. Tables, formulas, and hidden sheets may not be fully preserved.',
      contentTabLabel: 'Workbook',
      contentTabMeta: `${formatNumber(material.token_estimate)} tokens`,
      structureTabLabel: 'Sheets',
      structureTabMeta: sheetCount
        ? formatNumber(sheetCount)
        : formatNumber(material.segment_count),
      primaryMeasure: sheetMeasure,
      searchPlaceholder: 'Search workbook text',
      emptyState: 'No workbook text available.',
      emptySearchState: 'No matching workbook text.',
      promptIncludedLabel: 'workbook summary',
      includedSummaryTitle: 'Workbook summary included',
      availableSummaryTitle: 'Available workbook',
      includedPreviewTitle: 'Included Workbook Preview',
      previewTitle: 'Workbook Preview',
      prefersDocumentPreview: false,
    };
  }

  if (kind === 'pdf') {
    const pages = material.page_count ? `${formatNumber(material.page_count)} pages` : 'pages n/a';
    return {
      kind,
      fileTypeLabel: 'PDF',
      summaryDescription:
        'PDF text preview generated from extracted selectable text. Page layout is not preserved.',
      contentTabLabel: 'Text',
      contentTabMeta: material.page_count ? `${formatNumber(material.page_count)} pages` : 'parsed',
      structureTabLabel: 'Pages',
      structureTabMeta: material.page_count ? formatNumber(material.page_count) : chunks,
      primaryMeasure: pages,
      searchPlaceholder: 'Search PDF text',
      emptyState: 'No PDF text available.',
      emptySearchState: 'No matching PDF text.',
      promptIncludedLabel: 'full parsed text',
      includedSummaryTitle: 'Added to this chat',
      availableSummaryTitle: 'Available PDF',
      includedPreviewTitle: 'Included Text Preview',
      previewTitle: 'Text Preview',
      prefersDocumentPreview: false,
    };
  }

  if (kind === 'document') {
    const fileTypeLabel = documentFormatLabel(material);
    return {
      kind,
      fileTypeLabel,
      summaryDescription: `${fileTypeLabel} preview generated from parsed source. Original page styling is not preserved.`,
      contentTabLabel: 'Document',
      contentTabMeta: `${formatNumber(material.token_estimate)} tokens`,
      structureTabLabel: 'Chunks',
      structureTabMeta: chunks,
      primaryMeasure: material.page_count ? `${formatNumber(material.page_count)} pages` : chunks,
      searchPlaceholder: 'Search document text',
      emptyState: 'No document text available.',
      emptySearchState: 'No matching document text.',
      promptIncludedLabel: 'full document text',
      includedSummaryTitle: 'Document text included',
      availableSummaryTitle: 'Available document',
      includedPreviewTitle: 'Included Document Preview',
      previewTitle: 'Document Preview',
      prefersDocumentPreview: true,
    };
  }

  return {
    kind,
    fileTypeLabel: 'Text',
    summaryDescription: 'Text preview generated from the uploaded source.',
    contentTabLabel: 'Text',
    contentTabMeta: 'parsed',
    structureTabLabel: 'Chunks',
    structureTabMeta: chunks,
    primaryMeasure: chunks,
    searchPlaceholder: 'Search source text',
    emptyState: 'No source text available.',
    emptySearchState: 'No matching chunks.',
    promptIncludedLabel: 'full parsed text',
    includedSummaryTitle: 'Added to this chat',
    availableSummaryTitle: 'Available source',
    includedPreviewTitle: 'Included Text Preview',
    previewTitle: 'Text Preview',
    prefersDocumentPreview: false,
  };
}

function detectMaterialKind(material: MaterialDetail): MaterialKind {
  const mime = (material.mime_type ?? '').toLowerCase();
  const ext = fileExtension(material);

  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'csv'
  ) {
    return 'spreadsheet';
  }

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';

  if (
    mime.includes('wordprocessingml') ||
    mime.includes('markdown') ||
    mime === 'text/html' ||
    ext === 'docx' ||
    ext === 'md' ||
    ext === 'markdown' ||
    ext === 'html' ||
    ext === 'htm'
  ) {
    return 'document';
  }

  return 'text';
}

function materialSummaryStats(material: MaterialDetail, profile: MaterialProfile): string[] {
  const stats = [
    profile.fileTypeLabel,
    profile.primaryMeasure,
    `${formatNumber(material.token_estimate)} tokens`,
    chunkCountLabel(material.segment_count),
  ];

  return Array.from(new Set(stats.filter(Boolean)));
}

function extractionLimitsNotice(material: MaterialDetail): ExtractionLimitNotice | null {
  const profile = materialProfile(material);
  const items: string[] = [];
  let title = 'Extraction limits';
  let tone: ExtractionLimitNotice['tone'] = 'info';

  if (material.parse_quality.status === 'poor' || material.parse_quality.status === 'partial') {
    tone = 'warning';
    items.push(
      material.parse_quality.status === 'poor'
        ? 'Only sparse text was extracted. Inspect the preview before relying on this source.'
        : 'The parse may be incomplete. Inspect the preview before relying on this source.'
    );
  }

  if (profile.kind === 'pdf') {
    title = 'PDF extraction limits';
    items.push(
      'Only selectable PDF text is extracted; scanned pages and image-only text require OCR and may appear empty.',
      'Original page layout, images, charts, annotations, and visual positioning are not preserved.'
    );
  } else if (profile.kind === 'spreadsheet') {
    title = 'Workbook extraction limits';
    items.push(
      'The preview shows extracted cell values. Formula logic, charts, pivots, formatting, merged cells, and hidden sheets may not be fully preserved.'
    );

    const formulaCount = metadataNumber(material.metadata, ['formula_count', 'formulas']) ?? 0;
    const truncatedSheetCount =
      metadataNumber(material.metadata, ['truncated_sheet_count', 'truncated_sheets']) ?? 0;
    if (formulaCount > 0 || truncatedSheetCount > 0) tone = 'warning';
  } else if (profile.kind === 'document') {
    const format = documentFormatLabel(material);
    if (format === 'DOCX') {
      title = 'DOCX extraction limits';
      items.push(
        'Text, headings, lists, and simple tables are extracted. Images, charts, SmartArt, equations, comments, and embedded objects may not be extracted.',
        'Original page styling and layout are not preserved.'
      );
    } else if (format === 'Markdown') {
      title = 'Markdown extraction limits';
      items.push(
        'Markdown structure is rendered, but linked images and external media are not imported as visual context.'
      );
    } else if (format === 'HTML') {
      title = 'HTML extraction limits';
      items.push(
        'HTML is converted to Markdown. Scripts, styles, interactive widgets, and media are ignored.'
      );
    } else {
      items.push(
        'Document text is extracted for context. Images, charts, equations, and embedded objects may not be extracted.'
      );
    }
  } else if (profile.kind === 'text') {
    title = 'Text extraction limits';
    items.push(
      'Plain text is imported as readable text only; layout and embedded media are not available.'
    );
  }

  if (items.length === 0) return null;
  return { title, items: Array.from(new Set(items)), tone };
}

function documentFormatLabel(material: MaterialDetail): string {
  const mime = (material.mime_type ?? '').toLowerCase();
  const ext = fileExtension(material);

  if (mime.includes('markdown') || ext === 'md' || ext === 'markdown') return 'Markdown';
  if (mime.includes('wordprocessingml') || ext === 'docx') return 'DOCX';
  if (mime === 'text/html' || ext === 'html' || ext === 'htm') return 'HTML';
  return 'Document';
}

function fileExtension(material: MaterialDetail): string {
  const filename = (material.filename ?? material.title ?? '').toLowerCase();
  return filename.includes('.') ? (filename.split('.').pop() ?? '') : '';
}

function sourceContextSummary(
  material: MaterialDetail,
  context: MaterialReaderContextStatus | null,
  profile: MaterialProfile
) {
  const chunkCount = chunkCountLabel(material.segment_count);
  const tokenCount = formatNumber(material.token_estimate);
  if (context?.included) {
    if (profile.kind === 'spreadsheet') {
      return {
        title: profile.includedSummaryTitle,
        detail: `${profile.primaryMeasure} · ${tokenCount} tokens · ${chunkCount}`,
      };
    }

    return {
      title: profile.includedSummaryTitle,
      detail: `${capitalize(profile.promptIncludedLabel)} · ${tokenCount} tokens · ${chunkCount}`,
    };
  }

  return {
    title: profile.availableSummaryTitle,
    detail: `${profile.primaryMeasure} · ${tokenCount} tokens · ${chunkCount} available`,
  };
}

function sourcePreviewSummary(
  material: MaterialDetail,
  context: MaterialReaderContextStatus | null,
  previewCount: number,
  profile: MaterialProfile
) {
  const chunkCount = chunkCountLabel(material.segment_count);
  if (profile.kind === 'spreadsheet') {
    if (context?.included) {
      return 'Workbook text is included in prompt context. Tables and formulas are represented as extracted text.';
    }
    return `${formatNumber(previewCount)} of ${chunkCount} previewed. Add the workbook to include extracted sheet text.`;
  }

  if (context?.included) {
    if (previewCount < material.segment_count) {
      return `All ${chunkCount} are included in prompt context. Showing first ${formatNumber(previewCount)} below.`;
    }
    return `All ${chunkCount} are included in prompt context.`;
  }

  return `${formatNumber(previewCount)} of ${chunkCount} previewed. Add the source to include it in prompt context.`;
}

function parseQualitySummary(material: MaterialDetail, profile: MaterialProfile) {
  const pages = material.page_count
    ? `${material.page_count} page${material.page_count === 1 ? '' : 's'}`
    : 'the uploaded source';
  if (material.parse_quality.status === 'empty') {
    return {
      title: 'No text parsed',
      description: 'No usable source text was extracted from this material.',
      tone: 'border-[var(--status-error)]/25 bg-[var(--status-error-muted)] text-[var(--status-error)]',
    };
  }
  if (material.parse_quality.status === 'poor') {
    return {
      title: 'Sparse text parsed',
      description: `Only sparse text was extracted from ${pages}. Inspect the preview before relying on it.`,
      tone: 'border-[var(--status-error)]/25 bg-[var(--status-error-muted)] text-[var(--status-error)]',
    };
  }
  if (material.parse_quality.status === 'partial') {
    return {
      title: 'Partial text parsed',
      description: `Some text was extracted from ${pages}, but the parse may be incomplete. Layout and styling are not preserved.`,
      tone: 'border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
    };
  }

  if (profile.kind === 'spreadsheet') {
    return {
      title: 'Workbook text extracted',
      description:
        'Workbook text is available for context. Tables, formulas, merged cells, and hidden sheets may not be fully preserved.',
      tone: 'border-[var(--status-success)]/25 bg-[var(--status-success)]/10 text-[var(--status-success)]',
    };
  }

  if (profile.kind === 'document') {
    return {
      title: 'Document text extracted',
      description:
        'Document text is available for context. Headings, lists, and tables are previewed from parsed Markdown.',
      tone: 'border-[var(--status-success)]/25 bg-[var(--status-success)]/10 text-[var(--status-success)]',
    };
  }

  return {
    title: 'Text parsed',
    description: `Text extracted from ${pages}. Layout and styling are not preserved.`,
    tone: 'border-[var(--status-success)]/25 bg-[var(--status-success)]/10 text-[var(--status-success)]',
  };
}

function segmentDisplayLabel(segment: MaterialSegment, profile: MaterialProfile) {
  if (profile.kind === 'pdf') return `Page group ${segment.index}`;
  if (profile.kind === 'spreadsheet') return `Workbook chunk ${segment.index}`;
  return `Chunk ${segment.index}`;
}

function spreadsheetSheetCount(material: MaterialDetail): number | null {
  const explicit = metadataNumber(material.metadata, ['sheet_count', 'sheets_count']);
  if (explicit) return explicit;
  const names = spreadsheetSheetNames(material);
  return names.length > 0 ? names.length : null;
}

function spreadsheetSheetNames(material: MaterialDetail): string[] {
  return metadataStringArray(material.metadata.sheet_names ?? material.metadata.sheets).slice(
    0,
    12
  );
}

function metadataNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function metadataStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : null))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function chunkCountLabel(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? 'chunk' : 'chunks'}`;
}
