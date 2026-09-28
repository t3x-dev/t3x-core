'use client';

import {
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
import { StateExportButton } from '@/components/shared/StateExportButton';
import {
  buildWorkspaceReviewStructureRows,
  WorkspaceReviewStructureTree,
} from '@/components/workspaces/WorkspaceComposeReviewSurface';
import { stateYamlLinePaths } from '@/domain/diff/stateYamlReview';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { shortHash } from '@/domain/format/formatters';
import { buildCanonicalStateYaml, buildStatePointRows } from '@/domain/project/stateViewModel';
import type { ApiCommit } from '@/types/api';
import styles from './CommitHistoryDiffView.module.css';
import { StateNodeHistoryPanel } from './StateNodeHistoryPanel';

const EMPTY_CONTENT: ApiCommit['content'] = { relations: [], trees: [] };

interface CommitHistoryDiffViewProps {
  commit: ApiCommit;
  onBack: () => void;
  parentCommit: ApiCommit | null;
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
  selectedId: string | null;
  onSelect: (id: string) => void;
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
          const change = changes.find((candidate) => lineMatches(path, candidate.path));
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
              disabled={!change}
              key={`${side}-${index}-${line}`}
              onClick={() => change && onSelect(change.id)}
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

export function CommitHistoryDiffView({
  commit,
  onBack,
  parentCommit,
}: CommitHistoryDiffViewProps) {
  const baseline = parentCommit?.content ?? EMPTY_CONTENT;
  const changes = useMemo(
    () => buildStructuredStateDiff({ baseline, head: commit.content }),
    [baseline, commit.content]
  );
  const [mode, setMode] = useState<ViewMode>('yaml');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectedPath, setInspectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(changes[0]?.id ?? null);
  const [step, setStep] = useState<number | null>(changes.length ? 1 : null);
  const [playing, setPlaying] = useState(changes.length > 1);
  const selectedIndex = Math.max(
    0,
    changes.findIndex((change) => change.id === selectedId)
  );
  const selected = changes[selectedIndex] ?? null;
  const visibleCount = step ?? changes.length;
  const parentDigest = parentCommit ? shortHash(parentCommit.hash) : 'empty';
  const commitDigest = shortHash(commit.hash);
  const rows = useMemo(() => buildStatePointRows(commit.content), [commit.content]);
  const structureRows = useMemo(
    () => buildWorkspaceReviewStructureRows(rows, changes),
    [changes, rows]
  );

  useEffect(() => {
    if (!changes.some((change) => change.id === selectedId)) setSelectedId(changes[0]?.id ?? null);
  }, [changes, selectedId]);

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
              State
            </button>
            <ChevronRight aria-hidden="true" />
            <button type="button" onClick={onBack}>
              History
            </button>
            <ChevronRight aria-hidden="true" />
            <code>{commitDigest}</code>
          </nav>
          <h1>{commit.message || 'No commit message'}</h1>
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
          <StateExportButton projectId={commit.project_id} commitDigest={commit.hash} />
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
          {historyOpen && (inspectedPath || selected?.path) ? (
            <StateNodeHistoryPanel
              commit={commit}
              path={inspectedPath || selected!.path}
              name={(inspectedPath || selected!.path).split('/').at(-1) ?? 'Node'}
              onBack={() => setHistoryOpen(false)}
            />
          ) : (
            <>
              <button
                type="button"
                disabled={!inspectedPath && !selected}
                onClick={() => {
                  setPlaying(false);
                  setHistoryOpen(true);
                }}
              >
                View node history
              </button>
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
                    <MessageSquareText /> Why
                  </h3>
                  <p className={styles.reason}>
                    <strong>Commit message:</strong>{' '}
                    {commit.message || 'No commit message recorded.'}
                  </p>
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
                      onClick={() => {
                        setPlaying(false);
                        setSelectedId(changes[selectedIndex - 1]?.id ?? null);
                      }}
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
                      {playing ? (
                        <Pause />
                      ) : visibleCount >= changes.length ? (
                        <RotateCcw />
                      ) : (
                        <Play />
                      )}
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
                      <i
                        key={change.id}
                        data-active={index <= selectedIndex ? 'true' : undefined}
                      />
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
                  href={`/project/${encodeURIComponent(commit.project_id)}`}
                >
                  <SquareArrowOutUpRight /> Open in Workspace Editor
                </Link>
              </section>
            </>
          )}
        </aside>

        <section className={styles.diffPanel}>
          <header className={styles.diffToolbar}>
            {mode === 'structure' ? (
              <input
                aria-label="Search historical state"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search state"
              />
            ) : null}
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
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <YamlPane
                label="Commit"
                digest={commitDigest}
                content={commit.content}
                side="after"
                changes={changes}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          ) : (
            <div className={styles.structureMode}>
              <WorkspaceReviewStructureTree
                query={query}
                activeRowId={
                  structureRows.find((row) => row.path === (inspectedPath ?? selected?.path))?.id ??
                  null
                }
                modifiedLabel={absoluteDate(commit.committed_at)}
                onSelectRow={(rowId) => {
                  const path = structureRows.find((row) => row.id === rowId)?.path;
                  if (!path) return;
                  setPlaying(false);
                  setInspectedPath(path);
                  const change =
                    changes.find((candidate) => candidate.path === path) ??
                    changes.find((candidate) => candidate.path.startsWith(`${path}/`));
                  if (change) setSelectedId(change.id);
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
