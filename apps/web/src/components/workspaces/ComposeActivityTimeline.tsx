import type { WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import {
  CheckCircle2,
  Clock3,
  FileText,
  GitCompareArrows,
  History,
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
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
  composePathLabel,
  composeTextChangeSegments,
  composeValueChangeLabels,
} from '@/domain/composePresentation';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import styles from './ComposeActivityTimeline.module.css';
import composeStyles from './WorkspaceComposeSurface.module.css';

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
  const prefix = date.toDateString() === new Date().toDateString() ? 'TODAY · ' : '';
  return `${prefix}${date
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()}`;
};

function durationLabel(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min idle`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return days ? `${days} d${remainingHours ? ` ${remainingHours} h` : ''} idle` : `${hours} h idle`;
}

type ComposeChangeFilter = 'all' | 'modified' | 'added' | 'attention';

function matchesFilter(card: WorkspaceAuthoringCard, filter: ComposeChangeFilter) {
  if (filter === 'all') return true;
  const kind = activityChangeKind([card]);
  if (filter === 'added') return kind === 'added';
  if (filter === 'modified') return kind === 'modified' || kind === 'mixed';
  return kind === 'removed';
}

function ValueChange({ before, after, kind }: { before: string; after: string; kind: string }) {
  if (kind === 'added') return <ins title={after}>{after}</ins>;
  if (kind === 'removed') return <del title={before}>{before}</del>;
  if (before === after) return <span title={after}>{after}</span>;
  const change = composeTextChangeSegments(before, after);
  return (
    <span title={`${before} → ${after}`}>
      {change.prefix}
      {change.before ? <del>{change.before}</del> : null}
      {change.after ? <ins>{change.after}</ins> : null}
      {change.suffix}
    </span>
  );
}

export function ComposeActivityTimeline({
  activity,
  filter = 'all',
  scope,
  renderCard,
  fallback,
  updatedAt,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  filter?: ComposeChangeFilter;
  scope: 'latest' | 'all';
  renderCard: (operation: WorkspaceYOpsDraftOperation, meta: ComposeActivityMeta) => ReactNode;
  fallback: ReactNode;
  updatedAt: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!activity.enabled)
    return scope === 'all' ? (
      fallback
    ) : (
      <div className={styles.timeline}>
        <p className={styles.date}>
          <span>{dayLabel(updatedAt)}</span>
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
  if (scope === 'all')
    return (
      <div className={composeStyles.actionList}>
        {activity.view?.netDiff
          .filter((card) => matchesFilter(card, filter))
          .map((card) =>
            renderCard(activityOperation(card), { eventId: 'all', comparison: 'draft' })
          )}
        {!activity.view?.netDiff.filter((card) => matchesFilter(card, filter)).length ? (
          <p className={styles.message}>Current draft matches Base. Event history is retained.</p>
        ) : null}
      </div>
    );
  const events = groupComposeActivity(activity.actions);
  const visibleEvents = events
    .map((event) => ({
      event,
      cards: composeEventCards(event, activity.cards).filter((card) => matchesFilter(card, filter)),
    }))
    .filter(({ cards }) => cards.length > 0);
  return (
    <section className={styles.timeline} aria-label="Change activity timeline">
      {!visibleEvents.length ? <p className={styles.message}>No matching changes.</p> : null}
      {visibleEvents.map(({ event, cards: eventCards }, index) => {
        const latest = event.actions.at(-1)!;
        const open = expanded[event.id] ?? false;
        const toggle = () => setExpanded((current) => ({ ...current, [event.id]: !open }));
        // Keep the event node consistent with the concrete rows the user can inspect.
        const kind = activityChangeKind(eventCards);
        const { Icon, label } = changeMarkers[kind];
        const title =
          event.actions.length > 1
            ? 'Continuous manual edits'
            : latest.reason || `${activityChannelLabel(latest.channel)} changes`;
        const actor =
          latest.actor.id === 'human:local-user' ? 'You' : composeActorLabel(latest.actor.id);
        return (
          <Fragment key={event.id}>
            {index === 0 || day(event.endedAt) !== day(visibleEvents[index - 1].event.endedAt) ? (
              <p className={styles.date}>
                <span>{dayLabel(event.endedAt)}</span>
              </p>
            ) : null}
            <section
              className={styles.event}
              data-latest={index === 0}
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
                data-latest={index === 0}
                role="img"
                aria-label={label}
                title={label}
              >
                <Icon size={13} aria-hidden="true" />
              </span>
              <div className={styles.eventBody}>
                <button
                  className={styles.eventToggle}
                  onClick={toggle}
                  aria-expanded={open}
                  type="button"
                >
                  <span className={styles.heading}>
                    <span className={styles.titleLine}>
                      <strong title={title}>{title}</strong>
                      <span className={styles.proposalId}>
                        P-{String(latest.sequence).padStart(2, '0')}
                      </span>
                      {index === 0 ? <span className={styles.latestBadge}>Latest</span> : null}
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.channel} data-channel={latest.channel}>
                        {latest.channel === 'assistant' ? <Sparkles aria-hidden="true" /> : null}
                        {latest.channel === 'import' ? <FileText aria-hidden="true" /> : null}
                        {latest.channel === 'manual' ? <Pencil aria-hidden="true" /> : null}
                        {latest.channel === 'mcp' ? <MessageSquare aria-hidden="true" /> : null}
                        {activityChannelLabel(latest.channel)}
                      </span>
                    </span>
                  </span>
                  <span className={styles.author} title={actor}>
                    <span>
                      {latest.channel === 'assistant' ? 'AI' : actor.slice(0, 1).toUpperCase()}
                    </span>
                    {actor}
                  </span>
                </button>
                {open ? (
                  <div className={composeStyles.actionList}>
                    {eventCards.map((card) => {
                      const lastTouch = event.actions.findLast((action) =>
                        activity.cards[action.actionId]?.some((item) => item.nodeId === card.nodeId)
                      )!;
                      return renderCard(activityOperation(card, lastTouch.reason), {
                        eventId: event.id,
                        actionId: lastTouch.actionId,
                        actor:
                          lastTouch.actor.id === 'human:local-user' ? 'You' : lastTouch.actor.id,
                        channel: lastTouch.channel,
                        timestamp: lastTouch.publishedAt,
                        comparison: 'event',
                      });
                    })}
                  </div>
                ) : (
                  <div className={styles.preview}>
                    {eventCards.map((card) => {
                      const cardLabel = composePathLabel(card.path, card.nodeId);
                      const { before, after } = composeValueChangeLabels(card.before, card.after);
                      const cardKind = activityChangeKind([card]);
                      return (
                        <button
                          type="button"
                          onClick={toggle}
                          key={`${card.nodeId}:${card.path}`}
                          aria-label={`Expand ${cardLabel}`}
                        >
                          <span className={styles.changeMark} data-kind={cardKind}>
                            {cardKind === 'added' ? '+' : cardKind === 'removed' ? '−' : '~'}
                          </span>
                          <span className={styles.cardLabel} title={cardLabel}>
                            {cardLabel}
                          </span>
                          <span className={styles.valueSummary}>
                            <ValueChange before={before} after={after} kind={cardKind} />
                          </span>
                          <CheckCircle2 aria-label="Verified" className={styles.verified} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
            {event.idleBeforeMs > 0 ? (
              <div className={styles.gap}>
                <span aria-hidden="true" />
                <span className={styles.gapRail} aria-hidden="true" />
                <span className={styles.gapCopy}>
                  <strong>
                    <Clock3 aria-hidden="true" /> {durationLabel(event.idleBeforeMs)}
                  </strong>
                  <small>
                    {time(visibleEvents[index + 1]?.event.endedAt ?? event.startedAt)} →{' '}
                    {time(event.startedAt)}
                  </small>
                </span>
              </div>
            ) : null}
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
