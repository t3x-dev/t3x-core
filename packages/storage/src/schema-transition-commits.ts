import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { projects } from './schema';

/** Immutable canonical AcceptancePolicy bytes, addressed by their digest. */
export const transitionPolicyResources = pgTable('transition_policy_resources', {
  digest: text('digest').primaryKey(),
  canonicalJson: text('canonical_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Mutable server-selected policy pointer for one project ref. */
export const transitionPolicyBindings = pgTable(
  'transition_policy_bindings',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    refName: text('ref_name').notNull(),
    policyDigest: text('policy_digest')
      .notNull()
      .references(() => transitionPolicyResources.digest),
    policyUri: text('policy_uri').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.refName] }),
    index('idx_transition_policy_bindings_digest').on(table.policyDigest),
    check(
      'transition_policy_bindings_actor_kind_check',
      sql`${table.actorKind} IN ('human', 'agent', 'service')`
    ),
  ]
);

/** Canonical bytes for all content-addressed Transition protocol objects. */
export const transitionObjects = pgTable('transition_objects', {
  digest: text('digest').primaryKey(),
  kind: text('kind').notNull(),
  schema: text('schema').notNull(),
  canonicalJson: text('canonical_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only project membership for a server-built Proposal graph.
 *
 * The request bytes and trusted actor facts are application metadata. They do
 * not participate in protocol identity and must never be interpreted as a
 * mutable lifecycle status.
 */
export const transitionProposalMemberships = pgTable(
  'transition_proposal_memberships',
  {
    transitionId: text('transition_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    workspaceRevision: integer('workspace_revision').notNull(),
    refName: text('ref_name').notNull(),
    refHead: text('ref_head'),
    proposalDigest: text('proposal_digest')
      .notNull()
      .references(() => transitionObjects.digest),
    effectDigest: text('effect_digest')
      .notNull()
      .references(() => transitionObjects.digest),
    requestKind: text('request_kind').notNull(),
    requestCanonicalJson: text('request_canonical_json').notNull(),
    requestDigest: text('request_digest').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_transition_proposal_memberships_idempotency').on(
      table.projectId,
      table.actorKind,
      table.actorId,
      table.requestId
    ),
    index('idx_transition_proposal_memberships_project_created').on(
      table.projectId,
      table.createdAt,
      table.transitionId
    ),
    check(
      'transition_proposal_memberships_actor_kind_check',
      sql`${table.actorKind} IN ('human', 'agent', 'service')`
    ),
    check(
      'transition_proposal_memberships_request_kind_check',
      sql`${table.requestKind} IN ('structured_yops', 'exact_source_import', 'exact_source_edit', 'exact_source_revert')`
    ),
  ]
);

/**
 * Append-only trusted issuer membership for an observed Statement.
 * Array ordering and derived assurance are deliberately absent from storage.
 */
export const transitionStatementMemberships = pgTable(
  'transition_statement_memberships',
  {
    transitionId: text('transition_id')
      .notNull()
      .references(() => transitionProposalMemberships.transitionId, { onDelete: 'cascade' }),
    statementDigest: text('statement_digest')
      .notNull()
      .references(() => transitionObjects.digest),
    source: text('source').notNull(),
    issuerKind: text('issuer_kind').notNull(),
    issuerId: text('issuer_id').notNull(),
    requestId: text('request_id').notNull(),
    requestDigest: text('request_digest').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.transitionId, table.statementDigest] }),
    uniqueIndex('idx_transition_statement_memberships_idempotency').on(
      table.transitionId,
      table.source,
      table.issuerKind,
      table.issuerId,
      table.requestId
    ),
    index('idx_transition_statement_memberships_transition_created').on(
      table.transitionId,
      table.createdAt,
      table.statementDigest
    ),
    check(
      'transition_statement_memberships_issuer_kind_check',
      sql`${table.issuerKind} IN ('human', 'agent', 'service')`
    ),
  ]
);

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
    statementIssuers: jsonb('statement_issuers')
      .$type<
        Array<{
          statement: { kind: 'statement'; schema: 't3x/statement/v1'; digest: string };
          actor: { kind: 'human' | 'agent' | 'service'; id: string };
        }>
      >()
      .notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.refName, table.decisionDigest] }),
    index('idx_transition_decision_authorizations_decision').on(table.decisionDigest),
  ]
);

/**
 * Repository-API append-only membership for every trusted Decision outcome.
 * Soft-deleting a project preserves this audit history. Explicit permanent
 * project deletion removes it through the project foreign-key cascade so
 * tenant data can still be erased deliberately.
 *
 * This is audit metadata, never CommitV2 authorization or protocol identity.
 */
export const transitionDecisionLedger = pgTable(
  'transition_decision_ledger',
  {
    decisionDigest: text('decision_digest')
      .primaryKey()
      .references(() => transitionObjects.digest),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    refName: text('ref_name').notNull(),
    policyUri: text('policy_uri').notNull(),
    policyDigest: text('policy_digest').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    outcome: text('outcome').notNull(),
    observationScope: jsonb('observation_scope')
      .$type<{ completeness: 'complete' | 'partial'; sources: string[] }>()
      .notNull(),
    statementIssuers: jsonb('statement_issuers')
      .$type<
        Array<{
          statement: { kind: 'statement'; schema: 't3x/statement/v1'; digest: string };
          actor: { kind: 'human' | 'agent' | 'service'; id: string };
        }>
      >()
      .notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_transition_decision_ledger_project_ref_recorded').on(
      table.projectId,
      table.refName,
      table.recordedAt,
      table.decisionDigest
    ),
  ]
);

export type TransitionObjectRecord = typeof transitionObjects.$inferSelect;
export type TransitionProposalMembershipRecord = typeof transitionProposalMemberships.$inferSelect;
export type TransitionStatementMembershipRecord =
  typeof transitionStatementMemberships.$inferSelect;
export type TransitionCommitRecord = typeof transitionCommits.$inferSelect;
export type TransitionDecisionAuthorizationRecord =
  typeof transitionDecisionAuthorizations.$inferSelect;
export type TransitionDecisionLedgerRecord = typeof transitionDecisionLedger.$inferSelect;
export type TransitionPolicyResourceRecord = typeof transitionPolicyResources.$inferSelect;
export type TransitionPolicyBindingRecord = typeof transitionPolicyBindings.$inferSelect;
