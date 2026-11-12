'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { stateYamlLinePaths } from '@/domain/diff/stateYamlReview';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { commitTitle, formatDate, shortHash } from '@/domain/format/formatters';
import { buildCanonicalStateYaml } from '@/domain/project/stateViewModel';
import type { ApiCommit } from '@/types/api';
import styles from './CommitHistoryDiffView.module.css';
import listStyles from './HistoryList.module.css';

const EMPTY_CONTENT: ApiCommit['content'] = { relations: [], trees: [] };

type ViewMode = 'structure' | 'yaml';

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
}: {
  label: string;
  digest: string;
  content: ApiCommit['content'];
  side: 'before' | 'after';
  changes: ReturnType<typeof buildStructuredStateDiff>;
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
          return (
            <div
              className={styles.codeLine}
              data-change={changed ? side : undefined}
              key={`${side}-${index}-${line}`}
            >
              <span className={styles.lineNumber}>{index + 1}</span>
              <span className={styles.marker} aria-hidden="true">
                {changed ? (side === 'before' ? '−' : '+') : ''}
              </span>
              <code>{yamlLine(line)}</code>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CommitHistoryDiffCard({
  commit,
  structureHref,
  parentCommit,
  parentError,
  onParentSelect,
  onListFocus,
}: {
  commit: ApiCommit;
  structureHref: string;
  parentCommit: ApiCommit | null;
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
          <Link className={listStyles.textAction} href={structureHref}>
            View Structure
          </Link>
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
