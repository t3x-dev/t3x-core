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
import {
  buildWorkspaceRenderDocument,
  inspectorHeading,
  toDottedPath,
  type WorkspaceRenderSection,
  type WorkspaceRenderTreeRow,
  whyHeading,
} from '@/domain/workspaces/workspaceRenderDocument';
import { cn } from '@/utils/cn';
import styles from './WorkspaceRenderView.module.css';

export type { WorkspaceRenderTreeRow };

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
  schemaLabel?: string;
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
  schemaLabel,
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
  const document = useMemo(
    () =>
      buildWorkspaceRenderDocument(rows, {
        fallbackLede: subtitle,
        fallbackTitle: title,
        schemaLabel,
      }),
    [rows, schemaLabel, subtitle, title]
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
              Rendered result - {document.title} {draftLabel}
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
            <h1 className={styles.title}>{document.title}</h1>
            {document.lede ? <p className={styles.lede}>{document.lede}</p> : null}
            {document.sections.length === 0 ? (
              <p className={styles.empty}>No rendered sections are available for this draft yet.</p>
            ) : (
              document.sections.map((section) => (
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
  section: WorkspaceRenderSection;
}) {
  return (
    <section className={cn(styles.section, section.changed && styles.sectionChanged)}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{section.title}</h2>
        {section.updated ? <span className={styles.updated}>Updated</span> : null}
      </div>
      {section.ready ? (
        <div className={styles.ready}>
          <Check aria-hidden="true" className="size-3.5 stroke-[3]" />
          Ready
        </div>
      ) : null}
      {section.highlight ? (
        <button
          className={styles.highlightButton}
          onClick={() => onSelectRow(section.rowId)}
          type="button"
        >
          <p className={styles.highlight}>{section.highlight}</p>
        </button>
      ) : null}
      {section.tableRows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {section.tableRows.map((row) => (
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
              <span className={styles.checkGlyph}>
                <Check aria-hidden="true" className="size-2.5 stroke-[3]" />
              </span>
              {row.label}
            </button>
          ))}
        </div>
      ) : null}
      {section.listRows.length > 0 ? (
        <ul className={styles.list}>
          {section.listRows.map((row) => (
            <li key={row.id}>
              <button className={styles.listItem} onClick={() => onSelectRow(row.id)} type="button">
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {section.body ? (
        <p className={cn(styles.body, section.clampBody && styles.bodyClamp)}>{section.body}</p>
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
