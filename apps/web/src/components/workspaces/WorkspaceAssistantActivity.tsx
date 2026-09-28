'use client';

import type { WorkspaceAuthoringAction, WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import * as yaml from 'js-yaml';
import { Check, ChevronDown, Circle, Loader2, Pencil, Search, Sparkles } from 'lucide-react';
import { expandComposeActivityCards } from '@/domain/composeActivity';
import type { WorkspaceAssistantActivity as Activity } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import styles from './WorkspaceAssistantActivity.module.css';

export interface AssistantPublication {
  turnId: string;
  kind: 'published' | 'reused' | 'no_change';
  action?: WorkspaceAuthoringAction;
  cards?: WorkspaceAuthoringCard[];
}

export interface AssistantActivityRecord {
  activity: Activity;
  publication?: AssistantPublication | null;
}

const operationLabels: Record<string, string> = {
  readConversationHistory: 'Read conversation history',
  readSchema: 'Read workspace schema',
  readBaseStructure: 'Read base structure',
  readStructure: 'Read current Draft',
  readAction: 'Read saved action',
  readNodeHistory: 'Read node history',
  searchSources: 'Search selected sources',
  requestProposal: 'Generate proposed changes',
  applyUserEdit: 'Apply exact edit',
};

function phaseLabel(
  activity: Activity,
  publication?: AssistantPublication | null,
  publishing = false
) {
  if (publishing) return 'Verifying and publishing Draft changes…';
  if (publication?.kind === 'no_change') return 'Draft already contains this change';
  if (publication?.action) return 'Draft updated';
  if (activity.phase === 'saving') return 'Preparing workspace context…';
  if (activity.phase === 'reading') return 'Reading workspace context…';
  if (activity.phase === 'generating') return 'Generating changes…';
  if (activity.phase === 'responding') return 'Writing response…';
  if (activity.phase === 'error') return 'Processing stopped';
  return 'Processed';
}

function operationPath(operation: unknown): string | null {
  if (!operation || typeof operation !== 'object') return null;
  for (const value of Object.values(operation)) {
    if (value && typeof value === 'object' && 'path' in value && typeof value.path === 'string')
      return value.path;
  }
  return null;
}

function displayValue(value: unknown) {
  if (value === undefined) return 'Absent';
  if (typeof value === 'string') return value || 'Empty';
  return JSON.stringify(value, null, 2);
}

function changeLabel(path: string, after: unknown) {
  if (after && typeof after === 'object' && 'slots' in after) {
    const slots = after.slots;
    if (slots && typeof slots === 'object' && 'title' in slots && typeof slots.title === 'string')
      return slots.title;
  }
  const lastSegment = path.split('/').at(-1) ?? path;
  const key = lastSegment.match(/^\[key=(.+)\]$/)?.[1] ?? lastSegment;
  return key.replaceAll('_', ' ');
}

function yopsForPath(operations: WorkspaceAuthoringAction['operations'], path: string) {
  const related = operations.filter((operation) => {
    const operationTarget = operationPath(operation);
    return (
      operationTarget === path ||
      path.startsWith(`${operationTarget}/`) ||
      operationTarget?.startsWith(`${path}/`)
    );
  });
  return related.length ? related : operations;
}

function yopsYaml(operations: WorkspaceAuthoringAction['operations']) {
  return yaml
    .dump({ yops: operations }, { lineWidth: -1, noRefs: true, sortKeys: false })
    .trimEnd();
}

export function WorkspaceAssistantActivity({
  activity,
  publication,
  publishing = false,
}: {
  activity: Activity;
  publication?: AssistantPublication | null;
  publishing?: boolean;
}) {
  const running =
    publishing || (!['complete', 'error'].includes(activity.phase) && !publication?.action);
  const action = publication?.action;
  const cards = action ? expandComposeActivityCards(publication?.cards ?? []) : [];
  const paths = cards.length
    ? cards.map((card) => ({ path: card.path, before: card.before, after: card.after }))
    : (action?.operations ?? []).flatMap((operation) => {
        const path = operationPath(operation);
        return path ? [{ path, before: undefined, after: undefined }] : [];
      });
  const label = phaseLabel(activity, publication, publishing);

  return (
    <section className={styles.activity} aria-label="Assistant activity" aria-live="polite">
      <details className={styles.process} open={running ? true : undefined}>
        <summary className={styles.processToggle}>
          <span className={styles.chevron}>
            <ChevronDown aria-hidden="true" />
          </span>
          <strong>{label}</strong>
          {running ? <Loader2 className={styles.spinner} aria-hidden="true" /> : null}
        </summary>
        <div className={styles.steps}>
          <div className={styles.step} data-running={activity.phase === 'saving'}>
            {activity.phase === 'saving' ? (
              <Circle aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            <span>Prepare current Draft and selected sources</span>
          </div>
          {activity.operations.map((operation) => {
            const done = operation.status === 'completed';
            const Icon = done ? Check : operation.name === 'requestProposal' ? Sparkles : Search;
            return (
              <div className={styles.step} data-running={!done} key={operation.id}>
                <Icon aria-hidden="true" />
                <span>{operationLabels[operation.name] ?? operation.name}</span>
                {operation.name === 'requestProposal' && done ? (
                  <small>Candidate created</small>
                ) : null}
              </div>
            );
          })}
          {action ? (
            <div className={styles.step}>
              <Check aria-hidden="true" />
              <span>Published to Draft r{action.afterRevision}</span>
            </div>
          ) : null}
          {!running && activity.operations.length === 0 ? (
            <div className={styles.step}>
              <Circle aria-hidden="true" />
              <span>
                {activity.phase === 'error' ? 'No change was confirmed' : 'No edit requested'}
              </span>
            </div>
          ) : null}
        </div>
      </details>
      {action ? (
        <div className={styles.changes}>
          <strong className={styles.changesTitle}>
            <Pencil aria-hidden="true" />
            {paths.length} YAML {paths.length === 1 ? 'path' : 'paths'} changed
          </strong>
          {paths.map((item, index) => (
            <details className={styles.change} key={`${item.path}-${index}`}>
              <summary>
                <span className={styles.changeIcon}>
                  <ChevronDown aria-hidden="true" />
                </span>
                <span className={styles.changeHeading}>
                  <strong>{changeLabel(item.path, item.after)}</strong>
                  <code title={item.path}>{item.path}</code>
                </span>
              </summary>
              <div className={styles.changeDetail}>
                {cards.length ? (
                  <div className={styles.values}>
                    <span>
                      Before<code>{displayValue(item.before)}</code>
                    </span>
                    <span>
                      After<code>{displayValue(item.after)}</code>
                    </span>
                  </div>
                ) : null}
                <strong>YOps in this Action</strong>
                <pre>{yopsYaml(yopsForPath(action.operations, item.path))}</pre>
              </div>
            </details>
          ))}
          {paths.length === 0 ? (
            <details className={styles.change}>
              <summary>View YOps for this Action</summary>
              <pre>{yopsYaml(action.operations)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
