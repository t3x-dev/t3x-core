'use client';

import { ChevronDown, ChevronRight, GitBranch, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { shortHash } from '@/domain/format/formatters';
import {
  COMPACT_GRAPH_ROW_HEIGHT,
  layoutCompactCommitGraph,
} from '@/domain/history/compactCommitGraph';
import { getProjectIdRepoPath, getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import {
  useWorkspaceCommitGraph,
  WORKSPACE_GRAPH_LIMIT,
} from '@/hooks/workspaces/useWorkspaceCommitGraph';
import type { ApiCommit } from '@/types/api';
import { withReturnTo } from '@/utils/navigationReturn';
import styles from './WorkspaceCommitGraph.module.css';

export function WorkspaceCommitGraph({
  projectId,
  branch,
  refreshKey,
  onSelectCommit,
  selectedCommitHash,
}: {
  projectId: string;
  branch: string;
  refreshKey?: string;
  onSelectCommit?: (commit: ApiCommit) => void;
  selectedCommitHash?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState('all');
  const history = useWorkspaceCommitGraph(
    projectId,
    filter === 'current' ? branch : undefined,
    refreshKey
  );
  const graph = useMemo(() => layoutCompactCommitGraph(history.commits), [history.commits]);
  const currentHead = history.branches.find((item) => item.name === branch)?.head_commit_hash;
  const fullGraph = withReturnTo(
    `${getProjectIdRepoPath(projectId)}/history${filter === 'current' ? `?${new URLSearchParams({ branch })}` : ''}`,
    getProjectIdWorkspacePath(projectId, { branch })
  );
  return (
    <section
      className={styles.panel}
      aria-label="Commit graph"
      data-collapsed={!expanded || undefined}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-label="Toggle commit graph"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <h2>Graph</h2>
        </button>
        <GitBranch aria-hidden="true" className={styles.branchIcon} />
        <select
          aria-label="Commit graph branches"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All branches</option>
          <option value="current">{branch}</option>
        </select>
        <button
          type="button"
          className={styles.refresh}
          aria-label="Refresh commit graph"
          title="Refresh commit graph"
          disabled={history.loading}
          onClick={history.refresh}
        >
          <RotateCw aria-hidden="true" />
        </button>
      </header>
      {expanded ? (
        <>
          <div className={styles.scroll} aria-busy={history.loading}>
            {history.error ? <p role="alert">{history.error}</p> : null}
            {history.loading && !graph.rows.length ? <output>Loading history…</output> : null}
            {!history.loading && !history.error && !graph.rows.length ? (
              <p>No commits yet.</p>
            ) : null}
            {graph.rows.length ? (
              <div
                className={styles.graph}
                style={{ minWidth: graph.width + 140, paddingLeft: graph.width }}
              >
                <svg
                  aria-hidden="true"
                  className={styles.lines}
                  width={graph.width}
                  height={graph.rows.length * COMPACT_GRAPH_ROW_HEIGHT}
                >
                  {graph.rows.map((row, index) => (
                    <g
                      key={row.commit.hash}
                      transform={`translate(0 ${index * COMPACT_GRAPH_ROW_HEIGHT})`}
                    >
                      {row.segments.map((segment) => (
                        <path
                          key={segment.d}
                          d={segment.d}
                          stroke={segment.color}
                          fill="none"
                          strokeWidth="1.3"
                        />
                      ))}
                      <circle
                        cx={row.x}
                        cy={COMPACT_GRAPH_ROW_HEIGHT / 2}
                        r={row.commit.hash === currentHead ? 4 : 3}
                        fill={row.commit.parents.length > 1 ? 'var(--surface-panel)' : row.color}
                        stroke={row.color}
                        strokeWidth="1.5"
                      />
                    </g>
                  ))}
                </svg>
                <ol className={styles.rows}>
                  {graph.rows.map(({ commit, color }) => {
                    const labels = history.branches.filter(
                      (item) => item.head_commit_hash === commit.hash
                    );
                    const message = commit.message?.trim() || 'Untitled commit';
                    const params = new URLSearchParams({
                      view: 'overview',
                      branch: filter === 'current' ? branch : (labels[0]?.name ?? commit.branch),
                      commit: commit.hash,
                    });
                    const content = (
                      <>
                        <span className={styles.message}>{message}</span>
                        {labels.length ? (
                          <span className={styles.labels}>
                            {labels.map((label) => (
                              <span
                                key={label.name}
                                className={styles.badge}
                                data-current={label.name === branch || undefined}
                                style={{ color, borderColor: color }}
                              >
                                <GitBranch aria-hidden="true" />
                                <span className={styles.branchName}>{label.name}</span>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </>
                    );
                    return (
                      <li key={commit.hash}>
                        {onSelectCommit ? (
                          <button
                            type="button"
                            className={styles.row}
                            data-selected={selectedCommitHash === commit.hash || undefined}
                            data-head={commit.hash === currentHead || undefined}
                            aria-pressed={selectedCommitHash === commit.hash}
                            aria-label={`View commit ${shortHash(commit.hash)}: ${message}`}
                            title={`${message}\n${shortHash(commit.hash)} · ${commit.committed_at}`}
                            onClick={() => onSelectCommit(commit)}
                          >
                            {content}
                          </button>
                        ) : (
                          <Link
                            prefetch={false}
                            href={`${getProjectIdRepoPath(projectId)}?${params}`}
                            className={styles.row}
                            data-head={commit.hash === currentHead || undefined}
                            title={`${message}\n${shortHash(commit.hash)} · ${commit.author.name ?? commit.author.type}\n${commit.committed_at}`}
                            aria-label={`View commit ${shortHash(commit.hash)}: ${message}`}
                          >
                            <span className={styles.message}>{message}</span>
                            {labels.length ? (
                              <span className={styles.labels}>
                                {labels.map((label) => (
                                  <span
                                    key={label.name}
                                    className={styles.badge}
                                    data-current={label.name === branch || undefined}
                                    style={{ color, borderColor: color }}
                                    title={`${label.name}${label.name === branch ? ' · current branch' : ''}`}
                                  >
                                    <GitBranch aria-hidden="true" />
                                    <span className={styles.branchName}>{label.name}</span>
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </div>
          <footer className={styles.footer}>
            <span>
              {history.error ? (
                'History unavailable'
              ) : history.loading && !history.commits.length ? (
                'Loading…'
              ) : (
                <>
                  {history.commits.length >= WORKSPACE_GRAPH_LIMIT ? 'Latest ' : ''}
                  {history.commits.length} commits
                </>
              )}
            </span>
            <Link href={fullGraph} prefetch={false}>
              Open full graph ↗
            </Link>
          </footer>
        </>
      ) : null}
    </section>
  );
}
