'use client';

import {
  Check,
  Circle,
  Copy,
  FileText,
  GitCompare,
  GitFork,
  Info,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import type { ReviewCheckView } from '@/domain/workspaces/reviewCheckPresentation';
import {
  commitBlockedReason,
  reviewCheckStatusLabel,
  visibleDraftChecks,
} from '@/domain/workspaces/reviewCheckPresentation';
import { cn } from '@/utils/cn';
import styles from './WorkspaceRenderView.module.css';

export interface WorkspaceRenderTreeRow {
  afterValue?: string;
  beforeValue?: string;
  changeKind?: 'added' | 'modified' | 'removed';
  changed?: boolean;
  depth: number;
  expandable: boolean;
  id: string;
  key: string;
  parentPath: string | null;
  path: string;
  reason?: string;
  type: string;
  value: string;
}

export interface WorkspaceRenderSource {
  href?: string | null;
  label: string;
  page?: string;
}

interface WorkspaceRenderViewProps {
  acceptAllowed: boolean;
  busy?: boolean;
  checks: ReviewCheckView[];
  commitEnabled: boolean;
  draftLabel: string;
  onAskAiToRevise: () => void;
  onCommit: () => void;
  onOpenStructureDiff: () => void;
  onRunAction?: () => void;
  onSelectRow: (rowId: string) => void;
  rows: WorkspaceRenderTreeRow[];
  selectedRowId: string | null;
  source: WorkspaceRenderSource;
  subtitle: string;
  title: string;
  whyText: string;
}

export function WorkspaceRenderView({
  acceptAllowed,
  busy = false,
  checks,
  commitEnabled,
  draftLabel,
  onAskAiToRevise,
  onCommit,
  onOpenStructureDiff,
  onRunAction,
  onSelectRow,
  rows,
  selectedRowId,
  source,
  subtitle,
  title,
  whyText,
}: WorkspaceRenderViewProps) {
  const [copied, setCopied] = useState(false);
  const selectedRow =
    (selectedRowId ? rows.find((row) => row.id === selectedRowId) : null) ??
    rows.find((row) => row.changed) ??
    rows.find((row) => row.depth > 0) ??
    rows[0] ??
    null;
  const identity = useMemo(() => documentIdentity(rows, title, subtitle), [rows, subtitle, title]);
  const sections = useMemo(
    () => buildRenderSections(rows, selectedRow?.path ?? null, identity.hiddenKeys),
    [identity.hiddenKeys, rows, selectedRow?.path]
  );
  const visibleChecks = visibleDraftChecks(checks);
  const blockedReason = commitBlockedReason(visibleChecks);
  const canCommit = commitEnabled && acceptAllowed && !blockedReason && !busy;
  const dottedPath = selectedRow ? toDottedPath(selectedRow.path) : '';
  const inspectorTitle = selectedRow ? inspectorHeading(selectedRow.path) : 'Selected section';

  const copyPath = async () => {
    if (!dottedPath) return;
    try {
      await navigator.clipboard.writeText(dottedPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.documentColumn}>
        <header className={styles.documentHeader}>
          <div>
            <div className={styles.kicker}>
              Rendered result - {identity.title} {draftLabel}
            </div>
            <div className={styles.previewMeta}>Preview generated from draft {draftLabel}</div>
          </div>
          <button className={styles.openDiff} onClick={onOpenStructureDiff} type="button">
            <GitCompare aria-hidden="true" className="size-3.5" />
            Open structure diff
          </button>
        </header>

        <StateScrollArea className={styles.documentScroll} label="Rendered result document">
          <article className={styles.article}>
            <h1 className={styles.title}>{identity.title}</h1>
            {identity.lede ? <p className={styles.lede}>{identity.lede}</p> : null}
            {sections.length === 0 ? (
              <p className={styles.empty}>No rendered sections are available for this draft yet.</p>
            ) : (
              sections.map((section) => (
                <RenderSection key={section.path} onSelectRow={onSelectRow} section={section} />
              ))
            )}
          </article>
        </StateScrollArea>

        <div className={styles.commitBar}>
          <button
            className={cn(styles.commitButton, canCommit && styles.commitButtonReady)}
            disabled={!canCommit}
            onClick={onCommit}
            type="button"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <GitFork aria-hidden="true" className="size-3.5" />
            )}
            Commit changes
          </button>
          {!canCommit && blockedReason ? (
            <span className={styles.commitReason}>{blockedReason}</span>
          ) : null}
        </div>
      </div>

      <aside aria-label="Selected section" className={styles.inspector}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Selected section</h2>
            <button className={styles.copyPath} onClick={() => void copyPath()} type="button">
              <Copy aria-hidden="true" className="size-3.5" />
              {copied ? 'Copied' : 'Copy path'}
            </button>
          </div>
          <h3 className={styles.sectionName}>{inspectorTitle}</h3>
          <p className={styles.path}>{dottedPath || 'No path selected'}</p>
          {selectedRow?.changed ? (
            <span className={styles.modified}>
              <span aria-hidden="true">↗</span>
              Modified
            </span>
          ) : null}

          <div className={styles.sourceLabel}>Source</div>
          <div className={styles.sourceCard}>
            <FileText aria-hidden="true" className="size-4 shrink-0 text-[#7C3AED]" />
            <span className={styles.sourceTitle}>{source.label}</span>
            {source.page ? <span className={styles.sourcePage}>{source.page}</span> : null}
          </div>

          {whyText ? (
            <>
              <h4 className={styles.whyTitle}>{whyHeading(selectedRow)}</h4>
              <p className={styles.whyBody}>{whyText}</p>
            </>
          ) : null}

          <button className={styles.showDiff} onClick={onOpenStructureDiff} type="button">
            <GitCompare aria-hidden="true" className="size-3.5" />
            Show in structure diff
          </button>

          <button className={styles.revise} onClick={onAskAiToRevise} type="button">
            <Sparkles aria-hidden="true" className="size-4" />
            Ask AI to revise
          </button>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Checks for draft {draftLabel}</h2>
          <div>
            {visibleChecks.map((check) =>
              check.requirement === 'action' ? (
                <div className={styles.actionRow} key={check.id}>
                  <div className={styles.actionTop}>
                    {statusGlyph(check.status, 'action')}
                    <div className={styles.checkCopy}>
                      <div className={styles.checkName}>{check.label}</div>
                      <div className={styles.checkDetail}>{check.detail}</div>
                    </div>
                    <StatusPill status={check.status} />
                  </div>
                  {check.runnable ? (
                    <button
                      className={styles.runAction}
                      disabled={busy}
                      onClick={onRunAction}
                      type="button"
                    >
                      <Play aria-hidden="true" className="size-3 fill-current" />
                      {check.runLabel ?? 'Run T3X Action'}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className={styles.checkRow} key={check.id}>
                  {statusGlyph(check.status)}
                  <div className={styles.checkCopy}>
                    <div className={styles.checkName}>{check.label}</div>
                    <div className={styles.checkDetail}>{check.detail}</div>
                  </div>
                  <StatusPill status={check.status} />
                </div>
              )
            )}
          </div>
          <div className={styles.notice}>
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Results tied to this draft; edits require recheck.
          </div>
        </section>
      </aside>
    </div>
  );
}

function RenderSection({
  onSelectRow,
  section,
}: {
  onSelectRow: (rowId: string) => void;
  section: RenderSectionModel;
}) {
  const marked = section.changed && !section.highlight;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{section.title}</h2>
        {section.updated ? <span className={styles.updated}>Updated</span> : null}
      </div>
      {section.highlight ? (
        <button
          className="w-full text-left"
          onClick={() => onSelectRow(section.rowId)}
          type="button"
        >
          <p className={cn(styles.highlight, section.changed && styles.highlightChanged)}>
            {section.highlight}
          </p>
        </button>
      ) : null}
      {section.ready ||
      section.body ||
      section.tableRows.length > 0 ||
      section.checkRows.length > 0 ||
      section.listRows.length > 0 ? (
        <div className={cn(marked && styles.changedBlock)}>
          {section.ready ? (
            <div className={styles.ready}>
              <Check aria-hidden="true" className="size-3.5 stroke-[3]" />
              Ready
            </div>
          ) : null}
          {section.tableRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {section.tableRows.map((row) => (
                    <tr key={row.id}>
                      <th>{row.label}</th>
                      <td>
                        <button
                          className="text-left"
                          onClick={() => onSelectRow(row.id)}
                          type="button"
                        >
                          {row.value}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {section.checkRows.length > 0 ? (
            <div className={styles.checksInline}>
              {section.checkRows.map((row) => (
                <button
                  className={styles.checkItem}
                  key={row.id}
                  onClick={() => onSelectRow(row.id)}
                  type="button"
                >
                  <Check aria-hidden="true" className="size-4 stroke-[3]" />
                  {row.label}
                </button>
              ))}
            </div>
          ) : null}
          {section.listRows.length > 0 ? (
            <ul className={styles.list}>
              {section.listRows.map((row) => (
                <li key={row.id}>
                  <button
                    className={styles.listItem}
                    onClick={() => onSelectRow(row.id)}
                    type="button"
                  >
                    {row.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {section.body ? (
            <p className={cn(styles.body, section.clampBody && styles.bodyClamp)}>{section.body}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ status }: { status: ReviewCheckView['status'] }) {
  return (
    <span
      className={cn(
        styles.pill,
        status === 'passed' && styles.pillPassed,
        status === 'failed' && styles.pillFailed,
        status === 'pending' && styles.pillPending
      )}
    >
      {reviewCheckStatusLabel(status)}
    </span>
  );
}

function statusGlyph(status: ReviewCheckView['status'], variant: 'action' | 'check' = 'check') {
  if (status === 'passed') {
    return (
      <span className="mt-0.5 flex size-[18px] items-center justify-center rounded-full bg-[#16a34a] text-white">
        <Check aria-hidden="true" className="size-2.5 stroke-[3]" />
      </span>
    );
  }
  if (status === 'failed') {
    return <Circle aria-hidden="true" className="mt-0.5 size-[18px] text-[#dc2626]" />;
  }
  if (variant === 'action') {
    return (
      <span className="mt-0.5 flex size-[18px] items-center justify-center rounded-full border border-[#d1d5db] text-[#9ca3af]">
        <Play aria-hidden="true" className="size-2.5 fill-current" />
      </span>
    );
  }
  return <Circle aria-hidden="true" className="mt-0.5 size-[18px] text-[#d1d5db]" />;
}

interface RenderSectionModel {
  body?: string;
  changed: boolean;
  checkRows: Array<{ id: string; label: string; value: string }>;
  clampBody?: boolean;
  highlight?: string;
  listRows: Array<{ id: string; label: string; value: string }>;
  path: string;
  ready: boolean;
  rowId: string;
  tableRows: Array<{ id: string; label: string; value: string }>;
  title: string;
  updated: boolean;
}

function buildRenderSections(
  rows: WorkspaceRenderTreeRow[],
  selectedPath: string | null,
  hiddenKeys: Set<string>
): RenderSectionModel[] {
  const topLevel = rows.filter((row) => row.depth === 1 && !hiddenKeys.has(row.key.toLowerCase()));
  const sections = topLevel.length > 0 ? topLevel : synthesizeSectionsFromLeaves(rows, hiddenKeys);
  return sections
    .map((section) => toRenderSection(rows, section, selectedPath))
    .filter((section) => sectionHasContent(section));
}

function toRenderSection(
  rows: WorkspaceRenderTreeRow[],
  section: WorkspaceRenderTreeRow,
  selectedPath: string | null
): RenderSectionModel {
  const children = rows.filter(
    (row) => row.parentPath === section.path && row.depth === section.depth + 1
  );
  const changed = Boolean(section.changed) || children.some((child) => child.changed);
  const title = humanizeKey(section.key);
  const scalarChildren = children.filter((child) => !child.expandable);
  const objectChildren = children.filter((child) => child.expandable);
  const indexedChildren = objectChildren.filter((child) => isIndexKey(child.key));
  const nestedObjects = objectChildren.filter((child) => !isIndexKey(child.key));
  const booleanChildren = scalarChildren.filter((child) => isTruthyReady(child.value));
  const highlightPreferred = isSummaryKey(section.key)
    ? sectionHighlightValue(section, children)
    : undefined;
  const tableCandidates = scalarChildren.filter(
    (child) =>
      !isTruthyReady(child.value) &&
      isTableValue(rowText(child)) &&
      !isSummaryPreferredChild(child) &&
      highlightPreferred !== rowText(child)
  );
  const tableChildren = tableCandidates.length >= 2 ? tableCandidates : [];
  const tableIds = new Set(tableChildren.map((child) => child.id));
  const narrativeChildren = scalarChildren.filter(
    (child) =>
      !tableIds.has(child.id) &&
      !isTruthyReady(child.value) &&
      !isSummaryPreferredChild(child) &&
      Boolean(rowText(child))
  );
  const nestedItems = [...indexedChildren, ...nestedObjects].flatMap((child) =>
    nestedDisplayItems(rows, child)
  );
  const checkRows = [
    ...booleanChildren.map((child) => ({
      id: child.id,
      label: humanizeKey(child.key),
      value: rowText(child),
    })),
    ...nestedItems.filter((item) => item.kind === 'check').map(toDisplayRow),
  ];
  const listRows = nestedItems.filter((item) => item.kind === 'list').map(toDisplayRow);
  const ready = looksReady(section, children);
  const bodyFromSection =
    highlightPreferred || ready
      ? undefined
      : firstText(
          ...narrativeChildren.map((child) => rowText(child)),
          isPlaceholderValue(section.value) || isTruthyReady(section.value)
            ? undefined
            : displayValue(section.value)
        );
  const readyBody =
    ready && highlightPreferred && !isTruthyReady(highlightPreferred)
      ? highlightPreferred
      : firstText(...narrativeChildren.map((child) => rowText(child)));

  return {
    body: ready ? readyBody : bodyFromSection,
    changed,
    checkRows: ready ? [] : checkRows,
    clampBody: /note/i.test(section.key),
    highlight: highlightPreferred,
    listRows: ready ? [] : listRows,
    path: section.path,
    ready,
    rowId: leafRowId(section, children, selectedPath),
    tableRows:
      ready || highlightPreferred
        ? []
        : tableChildren.map((child) => ({
            id: child.id,
            label: humanizeKey(child.key),
            value: rowText(child),
          })),
    title,
    updated: changed,
  };
}

function nestedDisplayItems(
  rows: WorkspaceRenderTreeRow[],
  child: WorkspaceRenderTreeRow
): Array<{ id: string; kind: 'check' | 'list'; label: string; value: string }> {
  const nested = rows.filter((row) => row.parentPath === child.path && !row.expandable);
  const titleChild = nested.find((row) => row.key.toLowerCase() === 'title');
  if (titleChild) {
    const title = rowText(titleChild);
    if (title) return [{ id: child.id, kind: 'check', label: title, value: title }];
  }
  if (nested.length > 0 && nested.every((item) => isIndexKey(item.key))) {
    const kind = arrayItemKind(child.key);
    return nested.flatMap((item) => {
      const text = rowText(item);
      return text ? [{ id: item.id, kind, label: text, value: text }] : [];
    });
  }
  if (isTruthyReady(child.value) || isTruthyReady(child.afterValue)) {
    return [{ id: child.id, kind: 'check', label: humanizeKey(child.key), value: rowText(child) }];
  }
  return [];
}

function toDisplayRow(item: { id: string; label: string; value: string }): {
  id: string;
  label: string;
  value: string;
} {
  return { id: item.id, label: item.label, value: item.value };
}

function arrayItemKind(key: string): 'check' | 'list' {
  if (/avoid|forbid|risk|warn/i.test(key)) return 'list';
  if (/must|require|need|evidence|accept/i.test(key)) return 'check';
  return 'list';
}

function sectionHasContent(section: RenderSectionModel): boolean {
  return Boolean(
    section.highlight ||
      section.ready ||
      section.body ||
      section.tableRows.length > 0 ||
      section.checkRows.length > 0 ||
      section.listRows.length > 0
  );
}

function synthesizeSectionsFromLeaves(
  rows: WorkspaceRenderTreeRow[],
  hiddenKeys: Set<string>
): WorkspaceRenderTreeRow[] {
  return rows.filter(
    (row) => !row.expandable && row.depth > 0 && !hiddenKeys.has(row.key.toLowerCase())
  );
}

function sectionHighlightValue(
  section: WorkspaceRenderTreeRow,
  children: WorkspaceRenderTreeRow[]
): string | undefined {
  const preferredKeys = ['outcome', 'description', 'summary', 'lede', 'body', 'detail'];
  const preferred = children.find((child) => preferredKeys.includes(child.key.toLowerCase()));
  const textChild = children.find((child) => isNarrativeValue(rowText(child)));
  return (
    firstText(preferred ? rowText(preferred) : undefined) ||
    firstText(textChild ? rowText(textChild) : undefined) ||
    firstText(section.afterValue, isPlaceholderValue(section.value) ? undefined : section.value)
  );
}

function looksReady(section: WorkspaceRenderTreeRow, children: WorkspaceRenderTreeRow[]): boolean {
  if (/require/i.test(section.key)) return false;
  const selfReady = isTruthyReady(section.value) || isTruthyReady(section.afterValue);
  const childReady = children.some((child) => isTruthyReady(rowText(child)));
  if (/ready/i.test(section.key)) return selfReady || childReady;
  if (selfReady) {
    return children.filter((child) => !isTruthyReady(rowText(child))).length <= 1;
  }
  return children.length === 1 && isTruthyReady(children[0]?.value);
}

function leafRowId(
  section: WorkspaceRenderTreeRow,
  children: WorkspaceRenderTreeRow[],
  selectedPath: string | null
): string {
  const selected = children.find((child) => child.path === selectedPath);
  return selected?.id ?? children[0]?.id ?? section.id;
}

function documentIdentity(
  rows: WorkspaceRenderTreeRow[],
  fallbackTitle: string,
  fallbackLede: string
): { hiddenKeys: Set<string>; lede: string; title: string } {
  const hiddenKeys = new Set(['id', 'schema', 'metadata', 'owner']);
  const titleRow = rows.find((row) => row.depth <= 1 && row.key.toLowerCase() === 'title');
  const titleFromSlot = titleRow ? firstText(rowText(titleRow)) : undefined;
  const root = rows.find((row) => row.depth === 0);
  const genericRoot =
    !root || ['prd', 'workspace', 'root', 'state', 'document'].includes(root.key.toLowerCase());
  const title =
    titleFromSlot ||
    (!genericRoot && root ? humanizeKey(root.key) : fallbackTitle) ||
    fallbackTitle;
  if (titleFromSlot) hiddenKeys.add('title');

  const ledeRow = rows.find((row) => {
    if (row.depth > 1) return false;
    return ['description', 'subtitle', 'lede', 'objective'].includes(row.key.toLowerCase());
  });
  const ledeFromTree = ledeRow ? firstText(rowText(ledeRow)) : undefined;
  if (ledeFromTree && ledeRow) hiddenKeys.add(ledeRow.key.toLowerCase());
  hiddenKeys.add('title');
  hiddenKeys.add('description');
  hiddenKeys.add('subtitle');
  hiddenKeys.add('lede');

  return {
    hiddenKeys,
    lede: ledeFromTree || fallbackLede,
    title,
  };
}

function isSummaryKey(key: string): boolean {
  return ['summary', 'outcome', 'lede'].includes(key.toLowerCase());
}

function isSummaryPreferredChild(row: WorkspaceRenderTreeRow): boolean {
  return ['outcome', 'description', 'summary', 'lede', 'body', 'detail'].includes(
    row.key.toLowerCase()
  );
}

function isTruthyReady(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'ready' || normalized === 'yes';
}

function isTableValue(value: string): boolean {
  return value.trim().length > 0 && value.trim().length < 80 && !value.includes('\n');
}

function isNarrativeValue(value: string): boolean {
  return value.trim().length > 24 || /\s/.test(value.trim());
}

function isIndexKey(key: string): boolean {
  return /^\d+$/.test(key);
}

function isPlaceholderValue(value: string): boolean {
  return (
    !value ||
    value === 'empty' ||
    value === 'undefined' ||
    value === '-' ||
    /^\d+ items?$/.test(value)
  );
}

function displayValue(value: string): string {
  if (isPlaceholderValue(value)) return '';
  return value;
}

function rowText(row: WorkspaceRenderTreeRow): string {
  return firstText(row.afterValue, displayValue(row.value)) ?? '';
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => displayValue(value ?? '')).find(Boolean);
}

function toDottedPath(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/\//g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function inspectorHeading(path: string): string {
  const parts = toDottedPath(path).split('.').filter(Boolean);
  const last = parts.slice(-2);
  if (last.length === 2) return `${humanizeKey(last[0]!)} · ${last[1]}`;
  return humanizeKey(last[0] ?? path);
}

function humanizeKey(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function whyHeading(row: WorkspaceRenderTreeRow | null): string {
  if (row?.reason?.trim()) {
    const compact = row.reason.trim();
    if (compact.length <= 64) return compact;
  }
  if (row?.changed) return `Updated ${humanizeKey(row.key)}`;
  return 'Why this section';
}
