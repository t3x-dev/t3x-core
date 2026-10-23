'use client';

import { ArrowLeft, GitCommitHorizontal } from 'lucide-react';
import { activityOperation } from '@/domain/composeActivity';
import { shortHash } from '@/domain/format/formatters';
import {
  composeDraftChangeCards,
  composeDraftValueAtPath,
} from '@/domain/workspaces/composeDraftChanges';
import { useWorkspaceCommitChanges } from '@/hooks/workspaces/useWorkspaceCommitChanges';
import type { ApiCommit } from '@/types/api';
import { ComposeActivityChangeRow } from './ComposeActivityChangeRow';
import type { CommitChangeInspection } from './WorkspaceCommitChangeDetails';
import styles from './WorkspaceCommitHistoryPanel.module.css';

export function WorkspaceCommitHistoryPanel({
  projectId,
  commit,
  onReturn,
  onInspect,
  selectedId,
}: {
  projectId: string;
  commit: ApiCommit;
  onReturn: () => void;
  onInspect: (inspection: CommitChangeInspection) => void;
  selectedId?: string;
}) {
  const history = useWorkspaceCommitChanges(projectId, commit.hash);
  const data = history.data;
  const groups = data
    ? data.source === 'authoring'
      ? data.actions.map(({ action, cards, before, after }) => ({
          id: action.actionId,
          title: action.reason || 'Committed content change',
          date: action.publishedAt,
          action,
          cards: composeDraftChangeCards(cards, before, after),
        }))
      : [
          {
            id: commit.hash,
            title: 'Committed content differences',
            date: commit.committed_at,
            action: undefined,
            cards: composeDraftChangeCards(data.netDiff, data.base, data.current),
          },
        ]
    : [];
  return (
    <section className={styles.panel} aria-label="Committed changes">
      <header className={styles.header}>
        <button type="button" onClick={onReturn}>
          <ArrowLeft size={14} /> Return to current Draft
        </button>
        <span>Read-only · {shortHash(commit.hash)}</span>
      </header>
      <h2>
        <GitCommitHorizontal size={16} /> {commit.message?.trim() || 'Untitled commit'}
      </h2>
      <p className={styles.hint}>
        Historical submission · {commit.committed_at}. Your current Draft is unchanged.
      </p>
      {history.error ? <p role="alert">{history.error}</p> : null}
      {history.loading ? <output>Loading committed changes…</output> : null}
      {data?.source === 'commit_diff' ? (
        <p className={styles.hint}>
          Original action cards were not archived for this Commit. Showing verified Base → Result
          differences.
        </p>
      ) : null}
      {groups.map((group) => (
        <article className={styles.group} key={group.id}>
          <h3>
            {group.title}
            <time>{group.date}</time>
          </h3>
          {group.cards.length ? (
            group.cards.map((card, index) => {
              const id = `${group.id}:${index}`;
              return (
                <div key={id}>
                  <ComposeActivityChangeRow
                    operation={activityOperation(card)}
                    selected={selectedId === id}
                    applied={false}
                    onSelect={() =>
                      onInspect({
                        id,
                        commitDigest: commit.hash,
                        kind: 'content',
                        card,
                        current: composeDraftValueAtPath(
                          data!.current,
                          card.afterPath ?? card.path
                        ),
                        reason: group.title,
                        timestamp: group.date,
                        action: group.action,
                      })
                    }
                  />
                </div>
              );
            })
          ) : (
            <p className={styles.hint}>No net content differences.</p>
          )}
        </article>
      ))}
      {data?.schemaCards.map((card) => (
        <article className={styles.schema} key={card.settingsId}>
          <button
            type="button"
            className={styles.inspect}
            aria-label={`Inspect committed Schema ${card.settings.name}`}
            aria-pressed={selectedId === card.settingsId}
            onClick={() =>
              onInspect({
                id: card.settingsId,
                commitDigest: commit.hash,
                kind: 'schema',
                record: card,
              })
            }
          >
            <h3>
              {card.settings.action.replaceAll('_', ' ')} ·{' '}
              {card.settings.newName ?? card.settings.name}
              <span>Committed Schema</span>
            </h3>
            <p>
              {[
                card.settings.targetNodePath ?? card.settings.nodePath,
                card.settings.newName ?? card.settings.name,
              ]
                .filter(Boolean)
                .join('/')}
            </p>
          </button>
        </article>
      ))}
      {data?.schemaReview ? (
        <article className={styles.schema}>
          <button
            type="button"
            className={styles.inspect}
            aria-label="Inspect committed Schema differences"
            aria-pressed={selectedId === 'schema-diff'}
            onClick={() =>
              onInspect({
                id: 'schema-diff',
                commitDigest: commit.hash,
                kind: 'schema-diff',
                review: data.schemaReview!,
              })
            }
          >
            <h3>
              Schema differences<span>Committed</span>
            </h3>
            {data.schemaReview.changes.length ? (
              data.schemaReview.changes.map((change, index) => (
                <p key={`${change.path}:${index}`}>
                  <code>
                    {change.kind} {change.path}
                  </code>
                </p>
              ))
            ) : (
              <p className={styles.hint}>
                {data.schemaReview.base.status === 'unknown'
                  ? 'Earlier Schema evidence is unavailable; no difference is inferred.'
                  : 'No Schema differences.'}
              </p>
            )}
          </button>
        </article>
      ) : data ? (
        <p className={styles.hint}>Original Schema review was not archived for this Commit.</p>
      ) : null}
      {data?.nextBeforeSequence ? (
        <button type="button" disabled={history.loading} onClick={history.loadMore}>
          Load earlier change cards
        </button>
      ) : null}
      {data ? (
        <button
          type="button"
          className={`${styles.snapshot} ${styles.inspect}`}
          aria-pressed={selectedId === 'snapshot'}
          onClick={() =>
            onInspect({
              id: 'snapshot',
              commitDigest: commit.hash,
              kind: 'snapshot',
              current: data.current,
            })
          }
        >
          Submitted content snapshot
        </button>
      ) : null}
    </section>
  );
}
