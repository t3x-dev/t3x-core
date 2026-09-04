'use client';

import * as yaml from 'js-yaml';
import {
  Braces,
  Check,
  ChevronRight,
  FileText,
  ListTree,
  Rows3,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { shortHash } from '@/domain/format/formatters';
import type { StatePointRow } from '@/domain/project/stateViewModel';
import { cn } from '@/utils/cn';

interface StateGenericReaderProps {
  branch: string;
  headCommitHash?: string | null;
  rows: StatePointRow[];
  schemaName: string;
  validationGapCount: number;
  validationReady: boolean;
  yamlText: string;
}

interface GenericRoot {
  key: string;
  path: string;
  value: unknown;
}

interface GenericSection {
  key: string;
  path: string;
  title: string;
  value: unknown;
}

export function StateGenericReader({
  branch,
  headCommitHash = null,
  rows,
  schemaName,
  validationGapCount,
  validationReady,
  yamlText,
}: StateGenericReaderProps) {
  const parsed = useMemo(() => parseYamlRecord(yamlText), [yamlText]);
  const roots = useMemo(() => buildGenericRoots(parsed), [parsed]);
  const sections = useMemo(() => buildGenericSections(roots), [roots]);
  const rowByPath = useMemo(() => new Map(rows.map((row) => [row.path, row])), [rows]);
  const title = useMemo(() => deriveGenericTitle(roots, schemaName), [roots, schemaName]);
  const headLabel = headCommitHash ? `HEAD @ ${shortHash(headCommitHash)}` : `Branch ${branch}`;
  const rootLabel = roots.map((root) => root.key).join(' / ') || 'state';
  const validationLabel = validationReady
    ? 'Validation verified'
    : validationGapCount > 0
      ? `${String(validationGapCount)} validation gap${validationGapCount === 1 ? '' : 's'}`
      : 'Validation pending';

  return (
    <section
      aria-label="Generic structured state render"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]"
    >
      <StateScrollArea
        className="min-h-0 min-w-0 flex-1 bg-[var(--surface-app)] px-5 max-md:px-3"
        horizontal
        label="Rendered structured state document"
      >
        <article
          className="relative mx-auto min-h-[1000px] w-full max-w-[920px] rounded-[2px] bg-[var(--surface-card)] px-16 py-16 text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] max-lg:px-12 max-md:px-5 max-md:py-10"
          data-state-export-document
        >
          <header className="scroll-mt-6" data-generic-node="document">
            <div className="mb-8 flex min-w-0 items-start justify-between gap-5 max-md:flex-col max-md:gap-3">
              <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-bold uppercase tracking-[0] text-[var(--accent-commit)]">
                <span className="min-w-0 truncate">State: {rootLabel}</span>
                <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                  ·
                </span>
                <span>{headLabel}</span>
              </p>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 text-[11px] font-bold',
                  validationReady ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
                )}
              >
                {validationReady ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <TriangleAlert aria-hidden="true" className="size-4" />
                )}
                {validationLabel}
              </span>
            </div>

            <h1 className="mb-8 max-w-[680px] break-words text-[40px] font-extrabold leading-[1.08] tracking-[0] text-[var(--text-primary)] max-md:text-[30px]">
              {title}
            </h1>

            <dl className="mb-12 grid border-y border-[var(--stroke-default)] py-5 md:grid-cols-3">
              <GenericMetaCell label="Schema" mono value={schemaName || 'unbound schema'} />
              <GenericMetaCell divided label="Roots" mono value={String(roots.length)} />
              <GenericMetaCell divided label="Nodes" mono value={String(rows.length)} />
            </dl>
          </header>

          {sections.length > 0 ? (
            <div className="grid gap-12">
              {sections.map((section, index) => (
                <GenericDocumentSection
                  index={index + 1}
                  key={section.path}
                  rowByPath={rowByPath}
                  section={section}
                />
              ))}
            </div>
          ) : (
            <GenericEmptyState />
          )}
        </article>
      </StateScrollArea>
    </section>
  );
}

function GenericMetaCell({
  divided = false,
  label,
  mono = false,
  value,
}: {
  divided?: boolean;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 py-1 md:px-8',
        divided && 'md:border-l md:border-[var(--stroke-default)]',
        !divided && 'md:pr-8'
      )}
    >
      <dt className="text-[10px] font-bold uppercase tracking-[0] text-[var(--text-secondary)]">
        {label}
      </dt>
      <dd
        className={cn(
          'truncate text-base font-medium text-[var(--text-primary)]',
          mono && 'font-mono text-[13px]'
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function GenericDocumentSection({
  index,
  rowByPath,
  section,
}: {
  index: number;
  rowByPath: Map<string, StatePointRow>;
  section: GenericSection;
}) {
  const row = rowByPath.get(section.path);
  const issueCount = row?.issueCount ?? 0;
  const sectionStatus = row?.status ?? 'unchanged';

  return (
    <section className="min-w-0 scroll-mt-6" data-generic-node={section.path}>
      <div className="mb-5 flex min-w-0 flex-wrap items-center gap-4">
        <h2 className="min-w-0 break-words text-[18px] font-bold leading-[1.35] tracking-[0] text-[var(--text-primary)]">
          {index}. {section.title}
        </h2>
        <span className="h-px min-w-8 flex-1 bg-[var(--stroke-strong)]" />
        <GenericStatusBadge issueCount={issueCount} status={sectionStatus} />
      </div>
      <AdaptiveValue path={section.path} rowByPath={rowByPath} value={section.value} />
    </section>
  );
}

function GenericStatusBadge({
  issueCount,
  status,
}: {
  issueCount: number;
  status: StatePointRow['status'];
}) {
  if (status === 'missing' || issueCount > 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0] text-[var(--status-warning)]">
        <TriangleAlert aria-hidden="true" className="size-3" />
        {status === 'missing'
          ? 'Missing'
          : `${String(issueCount)} issue${issueCount === 1 ? '' : 's'}`}
      </span>
    );
  }

  if (status !== 'unchanged') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0] text-[var(--accent-commit)]">
        <ListTree aria-hidden="true" className="size-3" />
        {humanizeKey(status)}
      </span>
    );
  }

  return null;
}

function AdaptiveValue({
  depth = 0,
  path,
  rowByPath,
  value,
}: {
  depth?: number;
  path: string;
  rowByPath: Map<string, StatePointRow>;
  value: unknown;
}): ReactNode {
  const row = rowByPath.get(path);

  if (isScalar(value)) {
    return <ScalarValue missing={row?.status === 'missing'} value={value} />;
  }

  if (Array.isArray(value)) {
    return <ArrayValue depth={depth} path={path} rowByPath={rowByPath} values={value} />;
  }

  const record = toRecord(value);
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return <ScalarValue missing={row?.status === 'missing'} value="" />;
  }

  if (entries.every(([, item]) => isScalar(item))) {
    return <ScalarDefinitionList entries={entries} path={path} rowByPath={rowByPath} />;
  }

  const scalarEntries = entries.filter(([, item]) => isScalar(item));
  const complexEntries = entries.filter(([, item]) => !isScalar(item));

  return (
    <div className="grid min-w-0 gap-6">
      {scalarEntries.length > 0 ? (
        <ScalarDefinitionList entries={scalarEntries} path={path} rowByPath={rowByPath} />
      ) : null}
      <div className="grid min-w-0 gap-4">
        {complexEntries.map(([key, item]) => (
          <NestedValueBlock
            depth={depth}
            item={item}
            key={key}
            path={`${path}/${key}`}
            rowByPath={rowByPath}
            title={humanizeKey(key)}
          />
        ))}
      </div>
    </div>
  );
}

function NestedValueBlock({
  depth,
  item,
  path,
  rowByPath,
  title,
}: {
  depth: number;
  item: unknown;
  path: string;
  rowByPath: Map<string, StatePointRow>;
  title: string;
}) {
  const [open, setOpen] = useState(depth < 2);
  const content = (
    <div className="mt-3 min-w-0">
      <AdaptiveValue depth={depth + 1} path={path} rowByPath={rowByPath} value={item} />
    </div>
  );

  if (depth >= 1) {
    return (
      <details
        className="group min-w-0 rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3"
        onToggle={(event) => setOpen(event.currentTarget.open)}
        open={open}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-open:rotate-90"
          />
          <span className="min-w-0 truncate" title={title}>
            {title}
          </span>
          <ValueKindBadge value={item} />
        </summary>
        {content}
      </details>
    );
  }

  return (
    <section className="min-w-0 border-t border-[var(--stroke-divider)] pt-5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 truncate text-sm font-bold text-[var(--text-primary)]" title={title}>
          {title}
        </h3>
        <ValueKindBadge value={item} />
      </div>
      {content}
    </section>
  );
}

function ScalarDefinitionList({
  entries,
  path,
  rowByPath,
}: {
  entries: Array<[string, unknown]>;
  path: string;
  rowByPath: Map<string, StatePointRow>;
}) {
  return (
    <dl className="grid min-w-0 border-y border-[var(--stroke-default)] md:grid-cols-2">
      {entries.map(([key, item]) => {
        const childPath = `${path}/${key}`;
        const childRow = rowByPath.get(childPath);
        return (
          <div
            className="min-w-0 border-b border-[var(--stroke-divider)] px-4 py-3 md:odd:border-r"
            key={key}
          >
            <dt className="flex min-w-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0] text-[var(--text-tertiary)]">
              <span className="min-w-0 truncate" title={key}>
                {humanizeKey(key)}
              </span>
              {childRow?.status === 'missing' ? (
                <TriangleAlert
                  aria-hidden="true"
                  className="size-3 shrink-0 text-[var(--status-warning)]"
                />
              ) : null}
            </dt>
            <dd className="mt-1 min-w-0">
              <ScalarValue compact missing={childRow?.status === 'missing'} value={item} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ArrayValue({
  depth,
  path,
  rowByPath,
  values,
}: {
  depth: number;
  path: string;
  rowByPath: Map<string, StatePointRow>;
  values: unknown[];
}) {
  if (values.length === 0) {
    return <ScalarValue value="" />;
  }

  if (values.every(isScalar)) {
    return (
      <ul className="flex min-w-0 flex-wrap gap-2">
        {values.map((item, index) => (
          <li
            className="max-w-full rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm leading-5 text-[var(--text-secondary)]"
            key={`${String(index)}:${displayValue(item)}`}
            title={displayValue(item)}
          >
            <span className="break-words">{displayValue(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  const tableColumns = recordArrayColumns(values);
  if (tableColumns.length > 0) {
    return (
      <div className="min-w-0 overflow-hidden rounded-[6px] border border-[var(--stroke-divider)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-xs">
            <thead className="bg-[var(--surface-panel)] text-[10px] font-bold uppercase tracking-[0] text-[var(--text-tertiary)]">
              <tr>
                <th className="w-16 border-b border-[var(--stroke-divider)] px-4 py-3">#</th>
                {tableColumns.map((column) => (
                  <th className="border-b border-[var(--stroke-divider)] px-4 py-3" key={column}>
                    {humanizeKey(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {values.map((item, rowIndex) => {
                const record = toRecord(item);
                return (
                  <tr
                    className="align-top transition-colors hover:bg-[var(--surface-hover)]"
                    key={String(rowIndex)}
                  >
                    <td className="border-b border-[var(--stroke-divider)] px-4 py-3 font-mono text-[11px] text-[var(--text-tertiary)]">
                      {rowIndex + 1}
                    </td>
                    {tableColumns.map((column) => (
                      <td
                        className="min-w-[160px] border-b border-[var(--stroke-divider)] px-4 py-3"
                        key={column}
                      >
                        <AdaptiveTableCell
                          path={`${path}/${String(rowIndex)}/${column}`}
                          rowByPath={rowByPath}
                          value={record[column]}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {values.map((item, index) => (
        <NestedValueBlock
          depth={depth}
          item={item}
          key={String(index)}
          path={`${path}/${String(index)}`}
          rowByPath={rowByPath}
          title={`Item ${String(index + 1)}`}
        />
      ))}
    </div>
  );
}

function AdaptiveTableCell({
  path,
  rowByPath,
  value,
}: {
  path: string;
  rowByPath: Map<string, StatePointRow>;
  value: unknown;
}) {
  if (isScalar(value)) {
    return (
      <ScalarValue compact missing={rowByPath.get(path)?.status === 'missing'} value={value} />
    );
  }

  return (
    <details className="group min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-[var(--accent-commit)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform group-open:rotate-90"
        />
        <span>{valueKindLabel(value)}</span>
      </summary>
      <div className="mt-2 min-w-[280px]">
        <AdaptiveValue path={path} rowByPath={rowByPath} value={value} depth={2} />
      </div>
    </details>
  );
}

function ScalarValue({
  compact = false,
  missing = false,
  value,
}: {
  compact?: boolean;
  missing?: boolean;
  value: unknown;
}) {
  const text = displayValue(value);
  const empty = text === 'Empty';

  if (missing) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-warning)]">
        <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
        <span className="min-w-0 truncate">Missing</span>
      </span>
    );
  }

  if (empty) {
    return <span className="text-sm italic leading-6 text-[var(--text-tertiary)]">Empty</span>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return (
      <span
        className="inline-flex max-w-full truncate rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-commit)]"
        title={text}
      >
        {text}
      </span>
    );
  }

  if (compact && text.length <= 56 && !text.includes('\n')) {
    return (
      <span
        className="inline-flex max-w-full truncate rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-primary)]"
        title={text}
      >
        {text}
      </span>
    );
  }

  if (text.includes('\n')) {
    return (
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 font-mono text-xs leading-6 text-[var(--text-secondary)]">
        {text}
      </pre>
    );
  }

  return (
    <p
      className={cn(
        'max-w-[76ch] break-words text-sm leading-7 text-[var(--text-secondary)]',
        compact && 'leading-6'
      )}
    >
      {text}
    </p>
  );
}

function ValueKindBadge({ value }: { value: unknown }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
      {Array.isArray(value) ? (
        <Rows3 aria-hidden="true" className="size-3" />
      ) : (
        <Braces aria-hidden="true" className="size-3" />
      )}
      {valueKindLabel(value)}
    </span>
  );
}

function GenericEmptyState() {
  return (
    <section className="rounded-[6px] border border-[var(--stroke-divider)] px-5 py-8 text-sm text-[var(--text-secondary)]">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold text-[var(--text-primary)]">No state fields rendered</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
            The committed state is empty or could not be parsed into a structured document.
          </p>
        </div>
      </div>
    </section>
  );
}

function parseYamlRecord(yamlText: string): Record<string, unknown> {
  try {
    const parsed = yaml.load(yamlText);
    return toRecord(parsed);
  } catch {
    return {};
  }
}

function buildGenericRoots(parsed: Record<string, unknown>): GenericRoot[] {
  return Object.entries(parsed).map(([key, value]) => ({ key, path: key, value }));
}

function buildGenericSections(roots: GenericRoot[]): GenericSection[] {
  const root = roots[0];
  if (roots.length === 1 && root) {
    const rootRecord = toRecordOrNull(root.value);
    if (rootRecord && Object.keys(rootRecord).length > 0) {
      return Object.entries(rootRecord).map(([key, value]) => ({
        key,
        path: `${root.path}/${key}`,
        title: humanizeKey(key),
        value,
      }));
    }
  }

  return roots.map((root) => ({
    key: root.key,
    path: root.path,
    title: humanizeKey(root.key),
    value: root.value,
  }));
}

function deriveGenericTitle(roots: GenericRoot[], schemaName: string): string {
  const titleCandidate = firstScalarFromPaths(roots, [
    ['title'],
    ['name'],
    ['label'],
    ['metadata', 'title'],
    ['metadata', 'name'],
    ['meta', 'title'],
    ['meta', 'name'],
  ]);
  if (titleCandidate) return titleCandidate;

  const firstRoot = roots[0];
  if (firstRoot) return humanizeKey(firstRoot.key);
  return schemaName ? humanizeKey(schemaName.split('/').at(-1) ?? schemaName) : 'Structured State';
}

function firstScalarFromPaths(roots: GenericRoot[], paths: string[][]): string {
  for (const root of roots) {
    const rootRecord = toRecordOrNull(root.value);
    if (!rootRecord) continue;
    for (const path of paths) {
      const value = readPath(rootRecord, path);
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
  }
  return '';
}

function readPath(value: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    const record = toRecordOrNull(current);
    if (!record || !Object.hasOwn(record, segment)) return undefined;
    current = record[segment];
  }
  return current;
}

function recordArrayColumns(values: unknown[]): string[] {
  if (!values.every((value) => Boolean(toRecordOrNull(value)))) return [];
  const columns: string[] = [];
  for (const value of values) {
    for (const key of Object.keys(toRecord(value))) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

function valueKindLabel(value: unknown): string {
  if (Array.isArray(value)) return `${String(value.length)} item${value.length === 1 ? '' : 's'}`;
  const record = toRecordOrNull(value);
  if (record) {
    const count = Object.keys(record).length;
    return `${String(count)} field${count === 1 ? '' : 's'}`;
  }
  return valueType(value);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(displayValue).join(' · ');
  return JSON.stringify(value, null, 2);
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function isScalar(value: unknown): boolean {
  return value === null || ['boolean', 'number', 'string', 'undefined'].includes(typeof value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return toRecordOrNull(value) ?? {};
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanizeKey(value: string): string {
  return value
    .replace(/^__key$/, 'ID')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\//g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
