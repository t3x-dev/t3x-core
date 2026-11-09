'use client';

import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDotDashed,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  Link2,
  LockKeyhole,
  MessageSquareText,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SquareArrowOutUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  buildWorkspaceReviewStructureRows,
  WorkspaceReviewStructureTree,
} from '@/components/workspaces/WorkspaceComposeReviewSurface';
import { stateYamlLinePaths } from '@/domain/diff/stateYamlReview';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { commitTitle, formatDate, shortHash } from '@/domain/format/formatters';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { buildCanonicalStateYaml, buildStatePointRows } from '@/domain/project/stateViewModel';
import type { ApiCommit } from '@/types/api';
import styles from './CommitHistoryDiffView.module.css';
import listStyles from './HistoryList.module.css';

const EMPTY_CONTENT: ApiCommit['content'] = { relations: [], trees: [] };

interface CommitHistoryDiffViewProps {
  commit: ApiCommit;
  onBack: () => void;
  parentCommit: ApiCommit | null;
  stateHref?: string;
}

type ViewMode = 'structure' | 'yaml';

function humanPath(path: string): string {
  return path.replaceAll('/', '.');
}

function absoluteDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function lineMatches(linePath: string | null, changePath: string): boolean {
  if (!linePath) return false;
  return linePath === changePath || linePath.startsWith(`${changePath}/`);
}

function yamlLine(line: string) {
  const pair = /^(\s*)(-\s+)?([^:]+):(.*)$/.exec(line);
  if (!pair) return line || ' ';
  const [, indent, listMarker = '', key, value] = pair;
  const valueClass = /^(\s*(true|false|null|[-+]?\d+(\.\d+)?))\s*$/.test(value)
    ? styles.yamlLiteral
    : styles.yamlValue;
  return (
    <>
      {indent}
      {listMarker}
      <span className={styles.yamlKey}>{key}</span>:<span className={valueClass}>{value}</span>
    </>
  );
}

function YamlPane({
  label,
  digest,
  content,
  side,
  changes,
  selectedId,
  onSelect,
}: {
  label: string;
  digest: string;
  content: ApiCommit['content'];
  side: 'before' | 'after';
  changes: ReturnType<typeof buildStructuredStateDiff>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const text = buildCanonicalStateYaml(content);
  const lines = text.split('\n');
  const paths = stateYamlLinePaths(text);

  return (
    <section className={styles.yamlPane} aria-label={`${label} YAML`}>
      <header className={styles.yamlHeader}>
        <strong>{label}</strong>
        <code>{digest}</code>
      </header>
      <div className={styles.codeScroller}>
        {lines.map((line, index) => {
          const path = paths[index] ?? null;
          const change = changes.find((candidate) =>
            lineMatches(path, candidate.structurePath ?? candidate.path)
          );
          const changed =
            change &&
            ((side === 'before' && change.kind !== 'added') ||
              (side === 'after' && change.kind !== 'removed'));
          const active = changed && selectedId === change.id;
          return (
            <button
              className={styles.codeLine}
              data-change={changed ? side : undefined}
              data-selected={active ? 'true' : undefined}
              disabled={!change || !onSelect}
              key={`${side}-${index}-${line}`}
              onClick={() => change && onSelect?.(change.id)}
              type="button"
            >
              <span className={styles.lineNumber}>{index + 1}</span>
              <span className={styles.marker} aria-hidden="true">
                {changed ? (side === 'before' ? '−' : '+') : ''}
              </span>
              <code>{yamlLine(line)}</code>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CommitHistoryDiffCard({
  commit,
  parentCommit,
  parentError,
  onParentSelect,
  onListFocus,
}: Pick<CommitHistoryDiffViewProps, 'commit' | 'parentCommit'> & {
  parentError?: string;
  onParentSelect: (hash: string) => void;
  onListFocus: () => void;
}) {
  const [mode, setMode] = useState<ViewMode>('structure');
  const parentHash = commit.parents[0];
  const baseline = parentCommit?.content ?? (parentHash ? null : EMPTY_CONTENT);
  const changes = useMemo(
    () =>
      baseline
        ? buildStructuredStateDiff({ baseline, head: commit.content, literalValues: true })
        : [],
    [baseline, commit.content]
  );
  return (
    <>
      <header className={listStyles.detailHeader}>
        <div className={listStyles.detailActions}>
          <details className={listStyles.commitId}>
            <summary>
              Commit <code>{shortHash(commit.hash)}</code>
            </summary>
            <code>{commit.hash}</code>
          </details>
          <button className={listStyles.mobileListLink} type="button" onClick={onListFocus}>
            <ArrowUpRight aria-hidden="true" size={14} /> Commit list
          </button>
        </div>
        <h2>{commitTitle(commit.message)}</h2>
        <div className={listStyles.commitMeta}>
          <span>
            {commit.author?.name ||
              commit.author?.id ||
              commit.author?.type ||
              'Author not recorded'}
          </span>
          <time dateTime={commit.committed_at}>{formatDate(commit.committed_at)}</time>
          <span>{commit.branch || 'Detached'}</span>
        </div>
      </header>
      <div className={listStyles.detailBody}>
        <div className={listStyles.baseline}>
          <strong>Compared with</strong>
          {parentHash ? (
            <button
              className={listStyles.textAction}
              type="button"
              title={parentHash}
              onClick={() => onParentSelect(parentHash)}
            >
              First parent <code>{shortHash(parentHash)}</code>
            </button>
          ) : (
            <span>Empty base · initial commit</span>
          )}
        </div>
        {parentError ? (
          <p role="alert">Comparison unavailable. {parentError}</p>
        ) : !baseline ? (
          <output>Loading parent commit…</output>
        ) : (
          <>
            <fieldset className={listStyles.diffFormats} aria-label="Diff format">
              <button
                type="button"
                aria-pressed={mode === 'structure'}
                onClick={() => setMode('structure')}
              >
                Structure diff
              </button>
              <button type="button" aria-pressed={mode === 'yaml'} onClick={() => setMode('yaml')}>
                Structure YAML
              </button>
            </fieldset>
            <p className={listStyles.scope}>
              Shows tree nodes and stored fields. Relations are outside this comparison.
            </p>
            {mode === 'yaml' ? (
              <div className={listStyles.yaml}>
                <YamlPane
                  label="Parent"
                  digest={parentHash ? shortHash(parentHash) : 'empty'}
                  content={baseline}
                  side="before"
                  changes={changes}
                />
                <YamlPane
                  label="Commit"
                  digest={shortHash(commit.hash)}
                  content={commit.content}
                  side="after"
                  changes={changes}
                />
              </div>
            ) : (
              <>
                <div className={listStyles.changesHeading}>
                  <h3>Changes</h3>
                  <span>
                    {changes.length} {changes.length === 1 ? 'change' : 'changes'}
                  </span>
                </div>
                {changes.length === 0 && (
                  <p className={listStyles.scope}>No structural changes in this commit.</p>
                )}
                {changes.map((change, index) => (
                  <details className={listStyles.changeCard} key={change.id} open={index === 0}>
                    <summary>
                      <span className={listStyles.changeKind} data-kind={change.kind}>
                        {change.kind}
                      </span>
                      <code>{change.structurePath ?? change.path}</code>
                    </summary>
                    <div className={listStyles.values}>
                      <div data-side={change.kind !== 'added' ? 'before' : undefined}>
                        <b>Before</b>
                        <pre>{change.kind === 'added' ? 'Absent' : change.beforeValue}</pre>
                      </div>
                      <div data-side={change.kind !== 'removed' ? 'after' : undefined}>
                        <b>After</b>
                        <pre>{change.kind === 'removed' ? 'Absent' : change.afterValue}</pre>
                      </div>
                    </div>
                    <p className={listStyles.generated}>
                      <strong>Generated summary</strong> · {change.summary}
                    </p>
                  </details>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function CommitHistoryDiffView({
  commit,
  onBack,
  parentCommit,
  stateHref,
}: CommitHistoryDiffViewProps) {
  const baseline = parentCommit?.content ?? EMPTY_CONTENT;
  const changes = useMemo(
    () => buildStructuredStateDiff({ baseline, head: commit.content }),
    [baseline, commit.content]
  );
  const [mode, setMode] = useState<ViewMode>('yaml');
  const [selectedId, setSelectedId] = useState<string | null>(changes[0]?.id ?? null);
  const [step, setStep] = useState<number | null>(changes.length ? 1 : null);
  const [playing, setPlaying] = useState(changes.length > 1);
  const visibleCount = step ?? changes.length;
  const parentDigest = parentCommit ? shortHash(parentCommit.hash) : 'empty';
  const commitDigest = shortHash(commit.hash);
  const rows = useMemo(() => buildStatePointRows(commit.content), [commit.content]);
  const structureRows = useMemo(
    () => buildWorkspaceReviewStructureRows(rows, changes),
    [changes, rows]
  );
  const selectedRow = structureRows.find((row) => `structure:${row.id}` === selectedId);
  const changeIndexFor = (id: string | null) => {
    const row = structureRows.find((item) => `structure:${item.id}` === id);
    return Math.max(
      0,
      changes.findIndex((change) => {
        if (change.id === id) return true;
        if (!row) return false;
        const path = change.structurePath ?? change.path;
        return (
          row.path === path || row.path.startsWith(`${path}/`) || path.startsWith(`${row.path}/`)
        );
      })
    );
  };
  const selectedIndex = changeIndexFor(selectedId);
  const selectedChange = changes[selectedIndex];
  const selected = selectedRow?.diff?.exact
    ? { ...selectedRow.diff, path: selectedRow.path }
    : selectedChange
      ? { ...selectedChange, path: selectedChange.structurePath ?? selectedChange.path }
      : null;

  useEffect(() => {
    if (!selectedRow?.diff && !changes.some((change) => change.id === selectedId))
      setSelectedId(changes[0]?.id ?? null);
  }, [changes, selectedId, selectedRow]);

  useEffect(() => {
    if (!playing) return;
    if (visibleCount >= changes.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const next = visibleCount + 1;
      setStep(next);
      setSelectedId(changes[Math.max(0, next - 1)]?.id ?? null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [changes, playing, visibleCount]);

  const moveTo = (next: number) => {
    const clamped = Math.max(0, Math.min(changes.length, next));
    setPlaying(false);
    setStep(clamped);
    if (clamped > 0) setSelectedId(changes[clamped - 1]?.id ?? null);
  };

  const selectChange = (id: string) => {
    setStep(changeIndexFor(id) + 1);
    setPlaying(false);
    setSelectedId(id);
  };

  const copyPath = async () => {
    if (selected) await navigator.clipboard?.writeText(humanPath(selected.path));
  };

  const added = changes.filter((change) => change.kind === 'added').length;
  const modified = changes.filter((change) => change.kind === 'modified').length;
  const removed = changes.filter((change) => change.kind === 'removed').length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
            <button type="button" onClick={onBack}>
              History
            </button>
            <ChevronRight aria-hidden="true" />
            <code>{commitDigest}</code>
          </nav>
          <h1>{commitTitle(commit.message)}</h1>
          <div className={styles.metadata}>
            <span>
              <GitCommitHorizontal /> <code>{commitDigest}</code>
            </span>
            <i />
            <span>
              <GitBranch /> {commit.branch || 'detached'}
            </span>
            <i />
            <span>
              <CalendarDays /> {absoluteDate(commit.committed_at)}
            </span>
            <i />
            <span className={styles.committed}>
              <CheckCircle2 /> committed
            </span>
          </div>
        </div>
        <div className={styles.headerAside}>
          <div className={styles.revisionCompare}>
            <span>
              Parent <code>{parentDigest}</code>
            </span>
            <span>
              Commit <code>{commitDigest}</code>
            </span>
          </div>
          <span className={styles.readOnly}>
            <LockKeyhole /> Read-only
          </span>
        </div>
      </header>

      <main className={styles.main}>
        <aside className={styles.sidebar} aria-label="History change walkthrough">
          <section className={styles.card}>
            <header className={styles.cardHeader}>
              <h2>Selected Change</h2>
              <button type="button" aria-label="Copy selected path" onClick={copyPath}>
                <Copy />
              </button>
            </header>
            {selected ? (
              <>
                <code className={styles.path}>{humanPath(selected.path)}</code>
                <span className={styles.kind} data-kind={selected.kind}>
                  {selected.kind === 'added' ? (
                    <Plus />
                  ) : selected.kind === 'removed' ? (
                    <Minus />
                  ) : (
                    <CircleDotDashed />
                  )}
                  {selected.kind[0].toUpperCase() + selected.kind.slice(1)}
                </span>
                <div className={styles.values}>
                  {selected.kind !== 'added' && (
                    <div>
                      <b>Before</b>
                      <pre data-side="before">{selected.beforeValue}</pre>
                    </div>
                  )}
                  {selected.kind !== 'removed' && (
                    <div>
                      <b>After</b>
                      <pre data-side="after">{selected.afterValue}</pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className={styles.empty}>No state changes in this commit.</p>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.detailBlock}>
              <h3>
                <MessageSquareText /> Commit message
              </h3>
              <p className={styles.reason}>{commitTitle(commit.message)}</p>
            </div>
            <div className={styles.detailBlock}>
              <h3>Field-level rationale</h3>
              <em>No field-level rationale recorded.</em>
            </div>
            <div className={styles.detailBlock}>
              <h3>
                <Link2 /> Source
              </h3>
              <p className={styles.source}>No linked source</p>
            </div>
          </section>

          <section className={styles.sequence} aria-label="Change walkthrough controls">
            <header>
              <strong>Review Sequence</strong>
              <span>
                {Math.min(selectedIndex + 1, changes.length)} of {changes.length}
              </span>
            </header>
            <div className={styles.transportRow}>
              <div className={styles.transport}>
                <button
                  type="button"
                  aria-label="Previous change"
                  disabled={!changes.length || selectedIndex === 0}
                  onClick={() => moveTo(selectedIndex)}
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.play}
                  aria-label={
                    playing
                      ? 'Pause walkthrough'
                      : visibleCount >= changes.length
                        ? 'Replay again'
                        : 'Resume walkthrough'
                  }
                  disabled={!changes.length}
                  onClick={() => {
                    if (playing) setPlaying(false);
                    else {
                      if (visibleCount >= changes.length) {
                        setStep(0);
                        setSelectedId(changes[0]?.id ?? null);
                      }
                      setPlaying(true);
                    }
                  }}
                >
                  {playing ? <Pause /> : visibleCount >= changes.length ? <RotateCcw /> : <Play />}
                </button>
                <button
                  type="button"
                  aria-label="Next change"
                  disabled={!changes.length || visibleCount >= changes.length}
                  onClick={() => moveTo(visibleCount + 1)}
                >
                  <ChevronRight />
                </button>
              </div>
              <div className={styles.segments} aria-hidden="true">
                {changes.map((change, index) => (
                  <i key={change.id} data-active={index <= selectedIndex ? 'true' : undefined} />
                ))}
              </div>
            </div>
            <input
              className={styles.range}
              type="range"
              min={0}
              max={changes.length}
              value={visibleCount}
              aria-label="Walkthrough progress"
              aria-valuetext={`${visibleCount} of ${changes.length} changes shown`}
              onChange={(event) => moveTo(Number(event.target.value))}
            />
            <button
              type="button"
              className={styles.fullDiff}
              onClick={() => {
                setStep(null);
                setPlaying(false);
              }}
            >
              Show full diff
            </button>
            <Link
              className={styles.workspaceButton}
              href={
                stateHref ??
                `${getProjectIdRepoPath(commit.project_id)}?${new URLSearchParams({
                  view: 'overview',
                  branch: commit.branch,
                  commit: commit.hash,
                })}`
              }
            >
              <SquareArrowOutUpRight /> View this version in State
            </Link>
          </section>
        </aside>

        <section className={styles.diffPanel}>
          <header className={styles.diffToolbar}>
            <div className={styles.tabs} role="tablist" aria-label="Diff format">
              <button
                role="tab"
                aria-selected={mode === 'structure'}
                onClick={() => setMode('structure')}
                type="button"
              >
                Structure diff
              </button>
              <button
                role="tab"
                aria-selected={mode === 'yaml'}
                onClick={() => setMode('yaml')}
                type="button"
              >
                YAML diff
              </button>
            </div>
            <fieldset className={styles.stats} aria-label="Change totals">
              <span data-kind="added">
                <Plus /> {added}
              </span>
              <i />
              <span data-kind="modified">
                <CircleDotDashed /> {modified}
              </span>
              <i />
              <span data-kind="removed">
                <Minus /> {removed}
              </span>
            </fieldset>
          </header>
          {mode === 'yaml' ? (
            <div className={styles.splitDiff}>
              <YamlPane
                label="Parent"
                digest={parentDigest}
                content={baseline}
                side="before"
                changes={changes}
                selectedId={selectedChange?.id ?? null}
                onSelect={selectChange}
              />
              <YamlPane
                label="Commit"
                digest={commitDigest}
                content={commit.content}
                side="after"
                changes={changes}
                selectedId={selectedChange?.id ?? null}
                onSelect={selectChange}
              />
            </div>
          ) : (
            <div className={styles.structureMode}>
              <WorkspaceReviewStructureTree
                activeRowId={
                  selectedRow?.id ??
                  structureRows.find((row) => row.path === selected?.path)?.id ??
                  null
                }
                modifiedLabel={absoluteDate(commit.committed_at)}
                onSelectRow={(rowId) => {
                  if (structureRows.find((row) => row.id === rowId)?.diff)
                    selectChange(`structure:${rowId}`);
                }}
                rows={structureRows}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
