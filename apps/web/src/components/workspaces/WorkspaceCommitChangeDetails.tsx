'use client';

import type {
  AssistantSchemaSettingsView,
  TransitionProtocolValue,
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceFullSchemaReview,
} from '@t3x-dev/api-client';
import { ListTree } from 'lucide-react';
import { composeNodeTitle, composePathLabel } from '@/domain/composePresentation';
import { shortHash } from '@/domain/format/formatters';
import { AssistantSchemaSettingsDetails } from './AssistantSchemaSettingsCard';
import styles from './ComposeFieldDetails.module.css';
import {
  ComposeChangeContext,
  ComposeChangeReason,
  ComposeDetailValue,
  ComposeObjectDelta,
} from './ComposeNodeHistoryPanel';

type InspectionContext = { id: string; commitDigest: string };
export type CommitChangeInspection = InspectionContext &
  (
    | {
        kind: 'content';
        card: WorkspaceAuthoringCard;
        current: TransitionProtocolValue | undefined;
        reason: string;
        timestamp: string;
        action?: WorkspaceAuthoringAction;
      }
    | { kind: 'schema'; record: AssistantSchemaSettingsView }
    | { kind: 'schema-diff'; review: WorkspaceFullSchemaReview }
    | { kind: 'snapshot'; current: TransitionProtocolValue }
  );

/** Same Details presentation as the live Workspace, with immutable inputs and no mutation ports. */
export function WorkspaceCommitChangeDetails({
  inspection,
}: {
  inspection: CommitChangeInspection | null;
}) {
  if (!inspection)
    return (
      <div className={styles.empty}>
        <ListTree aria-hidden="true" />
        <p>Select a change card to inspect its committed value and differences.</p>
        <p>Read-only · Your current Draft is unchanged.</p>
      </div>
    );
  if (inspection.kind === 'schema')
    return (
      <AssistantSchemaSettingsDetails
        record={inspection.record}
        committedHash={inspection.commitDigest}
      />
    );
  const revisionLabel = `Commit ${shortHash(inspection.commitDigest)} · Read-only`;
  if (inspection.kind === 'content') {
    const { card, current, action } = inspection;
    const path = card.afterPath ?? card.path;
    const title =
      composeNodeTitle(current) ??
      composeNodeTitle(card.after) ??
      composeNodeTitle(card.before) ??
      composePathLabel(path, card.nodeId);
    return (
      <section className={styles.panel} aria-label="Selected committed change details">
        <ComposeChangeContext
          title={title}
          path={path}
          revisionLabel={revisionLabel}
          current={current}
          unknown={false}
          currentLabel="Value at this Commit"
          comparison={card}
          comparisonLabel={
            action
              ? `Selected action · A${action.sequence}`
              : 'Selected committed change · Base → Result'
          }
        />
        <div className={styles.body}>
          <ComposeChangeReason
            reason={inspection.reason}
            actor={action?.actor.id}
            channel={action?.channel}
            channelLabel={action ? undefined : 'Commit'}
            timestamp={inspection.timestamp}
          />
        </div>
        <footer className={styles.footer}>Historical change · Read-only</footer>
      </section>
    );
  }
  if (inspection.kind === 'schema-diff') {
    const { review } = inspection;
    return (
      <section className={styles.panel} aria-label="Selected committed Schema details">
        <div className={styles.context}>
          <div className={styles.revision}>{revisionLabel}</div>
          <h2>Schema differences</h2>
          <ComposeDetailValue
            label="Schema at this Commit"
            value={review.draft.definition}
            unknown={review.draft.status === 'unknown'}
          />
          <div className={styles.selectedDelta}>
            <span>Committed Schema · Base → Result</span>
            {review.base.status === 'unknown' ? (
              <p className={styles.helper}>
                Earlier Schema evidence is unavailable; no difference is inferred.
              </p>
            ) : (
              <ComposeObjectDelta
                before={review.base.definition as TransitionProtocolValue}
                after={review.draft.definition as TransitionProtocolValue}
              />
            )}
          </div>
        </div>
        <div className={styles.body}>
          {review.changes.map((change, index) => (
            <p key={`${change.path}:${index}`} className={styles.helper}>
              {change.kind} {change.path} · {change.summary}
            </p>
          ))}
        </div>
        <footer className={styles.footer}>Historical Schema · Read-only</footer>
      </section>
    );
  }
  return (
    <section className={styles.panel} aria-label="Committed snapshot details">
      <div className={styles.context}>
        <div className={styles.revision}>{revisionLabel}</div>
        <h2>Submitted content snapshot</h2>
        <ComposeDetailValue
          label="Content at this Commit"
          value={inspection.current}
          unknown={false}
        />
      </div>
    </section>
  );
}
