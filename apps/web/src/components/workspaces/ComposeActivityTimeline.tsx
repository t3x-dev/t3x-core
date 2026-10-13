import type { WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { parsePath } from '@t3x-dev/yops';
import { GitCompareArrows, History, Minus, Pencil, Plus } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import {
  activityChangeKind,
  activityChannelLabel,
  activityOperation,
  type ComposeActivityMeta,
  composeEventCards,
  groupComposeActivity,
} from '@/domain/composeActivity';
import {
  composeActorLabel,
  composeNodeTitle,
  composePathLabel,
} from '@/domain/composePresentation';
import { composeDraftChangeCards } from '@/domain/workspaces/composeDraftChanges';
import {
  MANUAL_STAGING_EVENT_ID,
  type ManualStagingControls,
  stagedObjectGroups,
} from '@/domain/workspaces/manualStaging';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import styles from './ComposeActivityTimeline.module.css';
import draftStyles from './ComposeDraftChanges.module.css';

function stagedFieldLabel(card: WorkspaceAuthoringCard) {
  const parts = parsePath(card.path);
  const parent = parts.at(-2);
  const field = parts.at(-1);
  return parent?.type === 'key' && parent.value === 'slots' && field?.type === 'key'
    ? field.value
    : composePathLabel(card.path, card.nodeId);
}

const changeMarkers = {
  added: { Icon: Plus, label: 'Added fields' },
  removed: { Icon: Minus, label: 'Removed fields' },
  modified: { Icon: Pencil, label: 'Modified fields' },
  mixed: { Icon: GitCompareArrows, label: 'Mixed changes' },
  recorded: { Icon: History, label: 'Recorded event' },
};

const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (value: string) =>
  new Date(value).toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
const dayLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

type ComposeChangeFilter = 'all' | 'modified' | 'added' | 'attention';

function matchesFilter(card: WorkspaceAuthoringCard, filter: ComposeChangeFilter) {
  if (filter === 'all') return true;
  const kind = activityChangeKind([card]);
  if (filter === 'added') return kind === 'added';
  if (filter === 'modified') return kind === 'modified' || kind === 'mixed';
  return kind === 'removed';
}

export function ComposeActivityTimeline({
  activity,
  filter = 'all',
  scope,
  renderRow,
  fallback,
  updatedAt,
  staging,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  filter?: ComposeChangeFilter;
  scope: 'latest' | 'all';
  renderRow: (operation: WorkspaceYOpsDraftOperation, meta: ComposeActivityMeta) => ReactNode;
  fallback: ReactNode;
  updatedAt: string;
  staging?: ManualStagingControls;
}) {
  if (!activity.enabled)
    return scope === 'all' ? (
      fallback
    ) : (
      <div className={styles.timeline}>
        <p className={styles.date} title={day(updatedAt)}>
          <span data-compact={dayLabel(updatedAt).length > 9 || undefined}>
            {dayLabel(updatedAt)}
          </span>
        </p>
        <section className={styles.event} data-latest="true" aria-label="Current proposal">
          <time className={styles.eventTime} dateTime={updatedAt}>
            {time(updatedAt)}
          </time>
          <span
            className={styles.icon}
            data-kind="recorded"
            role="img"
            aria-label="Event history unavailable"
            title="Event history unavailable"
          >
            <History size={13} aria-hidden="true" />
          </span>
          <div className={styles.eventBody}>
            <div className={styles.heading}>
              <span className={styles.titleLine}>
                <strong>Current proposal</strong>
              </span>
              <span className={styles.meta}>
                Earlier event history is not available for this draft.
              </span>
            </div>
            {fallback}
          </div>
        </section>
      </div>
    );
  if (activity.loading) return <p className={styles.message}>Loading change activity…</p>;
  if (activity.error)
    return (
      <div className={styles.message} role="alert">
        {activity.error}{' '}
        <button onClick={activity.refresh} type="button">
          Retry
        </button>
      </div>
    );
  if (scope === 'all') {
    const changes = composeDraftChangeCards(
      activity.view?.netDiff ?? [],
      activity.view?.base,
      activity.view?.current
    ).filter((card) => matchesFilter(card, filter));
    return (
      <section className={draftStyles.panel} aria-label="All draft changes">
        <header className={draftStyles.header}>
          <div>
            <h2>All draft changes</h2>
            <p>The combined result of every saved action.</p>
          </div>
          <span>Base → Draft r{activity.compositionRevision ?? '—'}</span>
        </header>
        <ul className={draftStyles.list}>
          {changes.map((card) =>
            renderRow(activityOperation(card), { eventId: 'all', comparison: 'draft' })
          )}
        </ul>
        {!changes.length ? (
          <p className={draftStyles.empty}>
            Current draft matches Base. Event history is retained.
          </p>
        ) : null}
      </section>
    );
  }
  const events = groupComposeActivity(activity.actions);
  const visibleEvents = events
    .map((event) => ({
      event,
      cards: composeEventCards(event, activity.cards).filter((card) => matchesFilter(card, filter)),
    }))
    .filter(({ cards }) => cards.length > 0);
  const stagedItems = staging?.items ?? [];
  const stagedGroups = stagedObjectGroups(stagedItems, staging?.current);
  const showStaging = stagedItems.length > 0;
  const stagingEndedAt = stagedItems.at(-1)?.createdAt ?? updatedAt;
  const selectedCount = stagedItems.filter((item) => item.selected).length;
  const stagingKind = activityChangeKind(stagedItems.map((item) => item.card));
  const StagingIcon = changeMarkers[stagingKind].Icon;
  return (
    <section className={styles.timeline} aria-label="Change activity timeline">
      {!visibleEvents.length && !showStaging ? (
        <p className={styles.message}>No matching changes.</p>
      ) : null}
      {showStaging ? (
        <>
          <p className={styles.date} title={day(stagingEndedAt)}>
            <span data-compact={dayLabel(stagingEndedAt).length > 9 || undefined}>
              {dayLabel(stagingEndedAt)}
            </span>
          </p>
          <section
            className={styles.event}
            data-latest="true"
            aria-label="Event: Ungrouped manual changes"
          >
            <time className={styles.eventTime} dateTime={stagingEndedAt}>
              {time(stagingEndedAt)}
            </time>
            <span
              className={styles.icon}
              data-kind={stagingKind}
              data-latest="true"
              role="img"
              aria-label={changeMarkers[stagingKind].label}
              title={changeMarkers[stagingKind].label}
            >
              <StagingIcon size={13} aria-hidden="true" />
            </span>
            <div className={styles.eventBody}>
              <div className={styles.heading}>
                <span className={styles.titleLine}>
                  <strong title="Ungrouped manual changes">Ungrouped manual changes</strong>
                  <span className={styles.latestBadge}>Latest</span>
                </span>
                <span className={styles.meta}>
                  {stagedItems.length === 1
                    ? '1 change · select changes to save as one P'
                    : `${stagedItems.length} changes · select changes to save as one P`}
                </span>
              </div>
              <div className={styles.preview}>
                {stagedGroups.map((group) => {
                  const item = group.items[0]!;
                  const sharedOperation = group.items.some((source) =>
                    stagedGroups.some((other) => other !== group && other.items.includes(source))
                  );
                  const cardLabel =
                    composeNodeTitle(group.card.after) ??
                    composeNodeTitle(group.card.before) ??
                    composePathLabel(group.card.path, group.card.nodeId);
                  return (
                    <div
                      className={styles.stagingRow}
                      data-multiple={group.items.length > 1 || sharedOperation}
                      key={`${group.card.path}:${item.id}`}
                    >
                      <div className={styles.stagingChecks}>
                        {group.items.map((source) => (
                          <label key={source.id} title={source.card.path}>
                            <input
                              aria-label={`Include ${group.items.length > 1 || sharedOperation ? stagedFieldLabel(source.card) : cardLabel} in the next P`}
                              checked={source.selected}
                              onChange={() => staging?.onToggle(source.id)}
                              type="checkbox"
                            />
                            {group.items.length > 1 || sharedOperation ? (
                              <code>{stagedFieldLabel(source.card)}</code>
                            ) : null}
                          </label>
                        ))}
                        {sharedOperation ? <small>Includes other objects</small> : null}
                      </div>
                      {renderRow(activityOperation(group.card, item.reason), {
                        eventId: MANUAL_STAGING_EVENT_ID,
                        actor: 'You',
                        channel: 'manual',
                        timestamp: item.createdAt,
                        comparison: 'event',
                      })}
                    </div>
                  );
                })}
              </div>
              <div className={styles.stagingActions}>
                <button
                  disabled={Boolean(staging?.pending) || selectedCount === 0}
                  onClick={() => staging?.onSaveSelected()}
                  type="button"
                >
                  {staging?.pending
                    ? 'Saving…'
                    : selectedCount
                      ? `Save selected as P (${selectedCount})`
                      : 'Save selected as P'}
                </button>
                {staging?.error ? <p role="alert">{staging.error}</p> : null}
              </div>
            </div>
          </section>
        </>
      ) : null}
      {visibleEvents.map(({ event, cards: eventCards }, index) => {
        const latest = event.actions.at(-1)!;
        // Keep the event node consistent with the concrete rows the user can inspect.
        const kind = activityChangeKind(eventCards);
        const { Icon, label } = changeMarkers[kind];
        const title =
          event.actions.length > 1
            ? 'Continuous manual edits'
            : latest.reason || `${activityChannelLabel(latest.channel)} changes`;
        const actor =
          latest.actor.id === 'human:local-user' ? 'You' : composeActorLabel(latest.actor.id);
        const isLatest = !showStaging && index === 0;
        const previousDay =
          index === 0
            ? showStaging
              ? day(stagingEndedAt)
              : null
            : day(visibleEvents[index - 1]!.event.endedAt);
        return (
          <Fragment key={event.id}>
            {previousDay === null || day(event.endedAt) !== previousDay ? (
              <p className={styles.date} title={day(event.endedAt)}>
                <span data-compact={dayLabel(event.endedAt).length > 9 || undefined}>
                  {dayLabel(event.endedAt)}
                </span>
              </p>
            ) : null}
            <section
              className={styles.event}
              data-latest={isLatest || undefined}
              aria-label={`Event: ${title}`}
            >
              <time className={styles.eventTime} dateTime={event.endedAt}>
                {time(event.endedAt)}
                {event.endedAt !== event.startedAt ? (
                  <small>from {time(event.startedAt)}</small>
                ) : null}
              </time>
              <span
                className={styles.icon}
                data-kind={kind}
                data-latest={isLatest || undefined}
                role="img"
                aria-label={label}
                title={label}
              >
                <Icon size={13} aria-hidden="true" />
              </span>
              <div className={styles.eventBody}>
                <div className={styles.eventHeader}>
                  <span className={styles.heading}>
                    <span className={styles.titleLine}>
                      <strong title={title}>{title}</strong>
                      <span className={styles.proposalId}>
                        P-{String(latest.sequence).padStart(2, '0')}
                      </span>
                      {isLatest ? <span className={styles.latestBadge}>Latest</span> : null}
                    </span>
                  </span>
                  <span className={styles.author} title={actor}>
                    <span>
                      {latest.channel === 'assistant' ? 'AI' : actor.slice(0, 1).toUpperCase()}
                    </span>
                    {actor}
                  </span>
                </div>
                <div className={styles.preview}>
                  {eventCards.map((card) => {
                    const lastTouch = event.actions.findLast((action) =>
                      activity.cards[action.actionId]?.some((item) => item.nodeId === card.nodeId)
                    )!;
                    return renderRow(activityOperation(card, lastTouch.reason), {
                      eventId: event.id,
                      actionId: lastTouch.actionId,
                      actor: lastTouch.actor.id === 'human:local-user' ? 'You' : lastTouch.actor.id,
                      channel: lastTouch.channel,
                      timestamp: lastTouch.publishedAt,
                      comparison: 'event',
                    });
                  })}
                </div>
              </div>
            </section>
          </Fragment>
        );
      })}
      {activity.cursor !== null ? (
        <button className={styles.loadOlder} type="button" onClick={activity.loadOlder}>
          Load older events
        </button>
      ) : null}
    </section>
  );
}
