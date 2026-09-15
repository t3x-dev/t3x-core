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
  const sections = useMemo(
    () => buildRenderSections(rows, selectedRow?.path ?? null),
    [rows, selectedRow?.path]
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
              Rendered result · {title} {draftLabel}
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
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.lede}>{subtitle}</p> : null}
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
                    {statusGlyph(check.status)}
                    <div className={styles.checkCopy}>
                      <div className={styles.checkName}>
                        {check.label}
                        <span className={styles.required}>Required</span>
                      </div>
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
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{section.title}</h2>
        {section.updated ? <span className={styles.updated}>Updated</span> : null}
      </div>
      {section.kind === 'highlight' ? (
        <button
          className={cn(section.changed && styles.changedBlock, 'w-full text-left')}
          onClick={() => onSelectRow(section.rowId)}
          type="button"
        >
          <p className={styles.highlight}>{section.body}</p>
        </button>
      ) : null}
      {section.kind === 'ready' ? (
        <div className={cn(section.changed && styles.changedBlock)}>
          <div className={styles.ready}>
            <Check aria-hidden="true" className="size-3.5 stroke-[3]" />
            Ready
          </div>
          {section.body ? <p className={styles.body}>{section.body}</p> : null}
        </div>
      ) : null}
      {section.kind === 'table' ? (
        <table className={styles.table}>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.id}>
                <th>{row.label}</th>
                <td>
                  <button className="text-left" onClick={() => onSelectRow(row.id)} type="button">
                    {row.value}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {section.kind === 'checks' ? (
        <div className={styles.checksInline}>
          {section.rows.map((row) => (
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
      {section.kind === 'body' ? (
        <div className={cn(section.changed && styles.changedBlock)}>
          <p className={styles.body}>{section.body}</p>
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

function statusGlyph(status: ReviewCheckView['status']) {
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
  return <Circle aria-hidden="true" className="mt-0.5 size-[18px] text-[#d1d5db]" />;
}

interface RenderSectionModel {
  body?: string;
  changed: boolean;
  kind: 'body' | 'checks' | 'highlight' | 'ready' | 'table';
  path: string;
  rowId: string;
  rows: Array<{ id: string; label: string; value: string }>;
  title: string;
  updated: boolean;
}

function buildRenderSections(
  rows: WorkspaceRenderTreeRow[],
  selectedPath: string | null
): RenderSectionModel[] {
  const topLevel = rows.filter((row) => row.depth === 1 && !isHiddenSectionKey(row.key));
  const sections = topLevel.length > 0 ? topLevel : synthesizeSectionsFromLeaves(rows);
  return sections.map((section) => {
    const children = rows.filter(
      (row) => row.parentPath === section.path && row.depth === section.depth + 1
    );
    const changed = Boolean(section.changed) || children.some((child) => child.changed);
    const title = humanizeKey(section.key);
    const scalarChildren = children.filter((child) => !child.expandable);
    const booleanChildren = scalarChildren.filter((child) => isTruthyReady(child.value));
    const highlightValue = sectionHighlightValue(section, children);

    if (isSummaryKey(section.key) && highlightValue) {
      return {
        body: highlightValue,
        changed,
        kind: 'highlight' as const,
        path: section.path,
        rowId: leafRowId(section, children, selectedPath),
        rows: [],
        title,
        updated: changed,
      };
    }

    if (looksReady(section, children)) {
      return {
        body: highlightValue && !isTruthyReady(highlightValue) ? highlightValue : undefined,
        changed,
        kind: 'ready' as const,
        path: section.path,
        rowId: section.id,
        rows: [],
        title,
        updated: changed,
      };
    }

    if (booleanChildren.length >= 2 && booleanChildren.length === scalarChildren.length) {
      return {
        changed,
        kind: 'checks' as const,
        path: section.path,
        rowId: section.id,
        rows: booleanChildren.map((child) => ({
          id: child.id,
          label: humanizeKey(child.key),
          value: child.value,
        })),
        title,
        updated: changed,
      };
    }

    if (scalarChildren.length >= 2 && scalarChildren.every((child) => isTableValue(child.value))) {
      return {
        changed,
        kind: 'table' as const,
        path: section.path,
        rowId: section.id,
        rows: scalarChildren.map((child) => ({
          id: child.id,
          label: humanizeKey(child.key),
          value: child.value,
        })),
        title,
        updated: changed,
      };
    }

    return {
      body: highlightValue || displayValue(section.value),
      changed,
      kind: 'body' as const,
      path: section.path,
      rowId: section.id,
      rows: [],
      title,
      updated: changed,
    };
  });
}

function synthesizeSectionsFromLeaves(rows: WorkspaceRenderTreeRow[]): WorkspaceRenderTreeRow[] {
  return rows.filter((row) => !row.expandable && row.depth > 0 && !isHiddenSectionKey(row.key));
}

function sectionHighlightValue(
  section: WorkspaceRenderTreeRow,
  children: WorkspaceRenderTreeRow[]
): string | undefined {
  const preferredKeys = ['outcome', 'description', 'summary', 'lede', 'body', 'detail'];
  const preferred = children.find((child) => preferredKeys.includes(child.key.toLowerCase()));
  const textChild = children.find((child) => isNarrativeValue(child.value));
  return (
    firstText(preferred?.afterValue, preferred?.value) ||
    firstText(textChild?.afterValue, textChild?.value) ||
    firstText(section.afterValue, section.value)
  );
}

function looksReady(section: WorkspaceRenderTreeRow, children: WorkspaceRenderTreeRow[]): boolean {
  if (isTruthyReady(section.value) || isTruthyReady(section.afterValue)) return true;
  if (/ready/i.test(section.key) && children.some((child) => isTruthyReady(child.value)))
    return true;
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

function isHiddenSectionKey(key: string): boolean {
  return ['title', 'id', 'schema', 'metadata', 'owner'].includes(key.toLowerCase());
}

function isSummaryKey(key: string): boolean {
  return ['summary', 'outcome', 'lede'].includes(key.toLowerCase());
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

function displayValue(value: string): string {
  if (!value || value === 'empty' || value === 'undefined') return '';
  return value;
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
