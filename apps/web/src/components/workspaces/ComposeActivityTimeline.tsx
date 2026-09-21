import {
  ArrowRight,
  ChevronDown,
  Clock3,
  GitCompareArrows,
  History,
  Minus,
  Pencil,
  Plus,
} from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import {
  activityChangeKind,
  activityChannelLabel,
  activityOperation,
  activityValue,
  type ComposeActivityMeta,
  composeEventCards,
  groupComposeActivity,
} from '@/domain/composeActivity';
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

export function ComposeActivityTimeline({
  activity,
  scope,
  renderCard,
  fallback,
  updatedAt,
}: {
  activity: ReturnType<typeof useComposeActivity>;
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
        <p className={styles.date}>{day(updatedAt)}</p>
        <section className={styles.event} data-latest="true" aria-label="Current proposal">
          <span
            className={styles.icon}
            data-kind="recorded"
            role="img"
            aria-label="Event history unavailable"
            title="Event history unavailable"
          >
            <History size={18} aria-hidden="true" />
          </span>
          <div className={styles.heading}>
            <strong>Current proposal</strong>
            <small>Earlier event history is not available for this draft.</small>
          </div>
          {fallback}
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
        {activity.view?.netDiff.map((card) =>
          renderCard(activityOperation(card), { eventId: 'all', comparison: 'draft' })
        )}
        {!activity.view?.netDiff.length ? (
          <p className={styles.message}>Current draft matches Base. Event history is retained.</p>
        ) : null}
      </div>
    );
  const events = groupComposeActivity(activity.actions);
  return (
    <section className={styles.timeline} aria-label="Change activity timeline">
      {!events.length ? <p className={styles.message}>No saved change events yet.</p> : null}
      {events.map((event, index) => {
        const latest = event.actions.at(-1)!;
        const eventCards = composeEventCards(event, activity.cards);
        const open = expanded[event.id] ?? index === 0;
        const toggle = () => setExpanded((current) => ({ ...current, [event.id]: !open }));
        // Use each saved delta so an add-then-remove event does not lose its meaning.
        const kind = activityChangeKind(
          event.actions.flatMap((action) => activity.cards[action.actionId] ?? [])
        );
        const { Icon, label } = changeMarkers[kind];
        const title =
          event.actions.length > 1
            ? 'Continuous manual edits'
            : latest.reason || `${activityChannelLabel(latest.channel)} changes`;
        const actor = latest.actor.id === 'human:local-user' ? 'You' : latest.actor.id;
        const minutes = Math.floor(
          (Date.parse(event.endedAt) - Date.parse(event.startedAt)) / 60000
        );
        return (
          <Fragment key={event.id}>
            {index === 0 || day(event.endedAt) !== day(events[index - 1].endedAt) ? (
              <p className={styles.date}>{day(event.endedAt)}</p>
            ) : null}
            <section
              className={styles.event}
              data-latest={index === 0}
              aria-label={`Event: ${title}`}
            >
              <button
                className={styles.eventToggle}
                onClick={toggle}
                aria-expanded={open}
                type="button"
              >
                <span
                  className={styles.icon}
                  data-kind={kind}
                  role="img"
                  aria-label={label}
                  title={label}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className={styles.heading}>
                  <strong title={title}>{title}</strong>
                  <span className={styles.meta}>
                    <span title={actor}>{actor}</span>
                    <span className={styles.channel} data-channel={latest.channel}>
                      {activityChannelLabel(latest.channel)}
                    </span>
                    <time dateTime={event.startedAt}>
                      {time(event.startedAt)}
                      {event.endedAt !== event.startedAt ? ` – ${time(event.endedAt)}` : ''}
                    </time>
                    <span>
                      {eventCards.length} {eventCards.length === 1 ? 'field' : 'fields'}
                    </span>
                    {minutes >= 60 ? (
                      <span className={styles.channel}>
                        {Math.floor(minutes / 60)}h {minutes % 60 || ''}
                        {minutes % 60 ? 'm' : ''} continuous · 1 event
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronDown size={14} className={open ? styles.openChevron : undefined} />
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
                      actor: lastTouch.actor.id === 'human:local-user' ? 'You' : lastTouch.actor.id,
                      channel: lastTouch.channel,
                      timestamp: lastTouch.publishedAt,
                      comparison: 'event',
                    });
                  })}
                  {!eventCards.length ? (
                    <p className={styles.message}>No field changes; the event is retained.</p>
                  ) : null}
                </div>
              ) : (
                <div className={styles.preview}>
                  {eventCards.map((card) => (
                    <button
                      type="button"
                      onClick={toggle}
                      key={`${card.nodeId}:${card.path}`}
                      aria-label={`Expand ${card.path}`}
                    >
                      <span title={card.path}>{card.path}</span>
                      <strong className={composeStyles.before} title={activityValue(card.before)}>
                        {activityValue(card.before)}
                      </strong>
                      <ArrowRight size={13} />
                      <strong className={composeStyles.after} title={activityValue(card.after)}>
                        {activityValue(card.after)}
                      </strong>
                      <ChevronDown size={14} />
                    </button>
                  ))}
                  {!eventCards.length ? (
                    <button type="button" onClick={toggle}>
                      View event <ChevronDown size={14} />
                    </button>
                  ) : null}
                </div>
              )}
            </section>
            {event.idleBeforeMs > 0 ? (
              <div className={styles.gap}>
                <span
                  className={styles.icon}
                  role="img"
                  aria-label="Idle interval"
                  title="Idle interval"
                >
                  <Clock3 size={18} aria-hidden="true" />
                </span>
                <strong>{Math.floor(event.idleBeforeMs / 60000)} min idle · New event</strong>
                <small>
                  {time(events[index + 1]?.endedAt ?? event.startedAt)} to {time(event.startedAt)}
                </small>
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
