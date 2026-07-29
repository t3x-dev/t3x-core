import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './schema';

/** Canonical bytes for all content-addressed Transition protocol objects. */
export const transitionObjects = pgTable('transition_objects', {
  digest: text('digest').primaryKey(),
  kind: text('kind').notNull(),
  schema: text('schema').notNull(),
  canonicalJson: text('canonical_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Project membership for immutable CommitV2 objects. Refs remain separate. */
export const transitionCommits = pgTable(
  'transition_commits',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    digest: text('digest')
      .notNull()
      .references(() => transitionObjects.digest),
    mediaType: text('media_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.digest] }),
    index('idx_transition_commits_project_created').on(table.projectId, table.createdAt),
  ]
);

/**
 * Server-side authority fact. This record is intentionally outside Decision
 * and Commit identity and is written only from a trusted issued capability.
 */
export const transitionDecisionAuthorizations = pgTable(
  'transition_decision_authorizations',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    refName: text('ref_name').notNull(),
    decisionDigest: text('decision_digest')
      .notNull()
      .references(() => transitionObjects.digest),
    policyUri: text('policy_uri').notNull(),
    policyDigest: text('policy_digest').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    outcome: text('outcome').notNull(),
    observationScope: jsonb('observation_scope')
      .$type<{ completeness: 'complete' | 'partial'; sources: string[] }>()
      .notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.refName, table.decisionDigest] }),
    index('idx_transition_decision_authorizations_decision').on(table.decisionDigest),
  ]
);

export type TransitionObjectRecord = typeof transitionObjects.$inferSelect;
export type TransitionCommitRecord = typeof transitionCommits.$inferSelect;
export type TransitionDecisionAuthorizationRecord =
  typeof transitionDecisionAuthorizations.$inferSelect;
