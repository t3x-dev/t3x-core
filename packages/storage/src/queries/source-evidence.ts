/**
 * Repository-owned source evidence reads.
 *
 * This projection deliberately reuses durable conversation, turn, revision,
 * and immutable Transition EvidenceRefs. It does not create a second source
 * truth or scan deprecated commit metadata.
 */

import { describeCommitV2, describeTransitionObject } from '@t3x-dev/core';
import type { EvidenceRef } from '@t3x-dev/transition';
import { and, asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type Conversation,
  conversations,
  type SourceTextRevision,
  sourceTextRevisions,
  type Turn,
} from '../schema';
import { getConversationTurnCount } from './conversations';
import {
  getRepositoryDecisionAuditByDigest,
  getVerifiedTransitionCommitGraph,
  listTransitionCommits,
} from './transition-commits';
import { findTurnsByConversation } from './turns';

export interface ConversationSourceCommitReference {
  commitDigest: string;
  recordedAt: Date;
  intent: string | null;
  evidence: EvidenceRef[];
}

export interface ConversationSourceEvidenceRecord {
  conversation: Conversation | null;
  turns: Turn[];
  turnCount: number;
  revisions: SourceTextRevision[];
  commitReferences: ConversationSourceCommitReference[];
  limit: number;
  offset: number;
}

export interface GetConversationSourceEvidenceInput {
  projectId: string;
  conversationId: string;
  limit?: number;
  offset?: number;
}

function claimEvidence(claim: { mode: string; evidence?: readonly EvidenceRef[] }): EvidenceRef[] {
  return claim.mode === 'unspecified' ? [] : [...(claim.evidence ?? [])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEvidenceRef(value: unknown): value is EvidenceRef {
  if (!isRecord(value) || !isRecord(value.resource) || !isRecord(value.locator)) return false;
  return (
    typeof value.resource.uri === 'string' &&
    typeof value.resource.mediaType === 'string' &&
    typeof value.resource.digest === 'string' &&
    typeof value.locator.scheme === 'string' &&
    'value' in value.locator
  );
}

function collectStatementEvidence(value: unknown, found: EvidenceRef[] = []): EvidenceRef[] {
  if (isEvidenceRef(value)) {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const member of value) collectStatementEvidence(member, found);
  } else if (isRecord(value)) {
    for (const member of Object.values(value)) collectStatementEvidence(member, found);
  }
  return found;
}

function conversationEvidencePrefix(projectId: string, conversationId: string): string {
  return `t3x://projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`;
}

function uniqueEvidence(refs: readonly EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((reference) => {
    const identity = JSON.stringify(reference);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function listConversationCommitReferences(
  db: AnyDB,
  projectId: string,
  conversationId: string
): Promise<ConversationSourceCommitReference[]> {
  const prefix = conversationEvidencePrefix(projectId, conversationId);
  const references: ConversationSourceCommitReference[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const commits = await listTransitionCommits(db, projectId, { limit: pageSize, offset });
    for (const stored of commits) {
      const digest = describeCommitV2(stored.commit).digest;
      const graph = await getVerifiedTransitionCommitGraph(db, projectId, digest);
      if (graph === null) continue;
      const audit = await getRepositoryDecisionAuditByDigest(
        db,
        projectId,
        describeTransitionObject(graph.decision).digest
      );
      const evidence = uniqueEvidence([
        ...claimEvidence(graph.proposal.predicate.intent),
        ...claimEvidence(graph.proposal.predicate.rationale),
        ...(audit?.observations.flatMap((observation) =>
          collectStatementEvidence(observation.statement.predicate)
        ) ?? []),
      ]).filter(
        (reference) =>
          reference.resource.uri === prefix || reference.resource.uri.startsWith(`${prefix}/`)
      );
      if (evidence.length === 0) continue;
      references.push({
        commitDigest: digest,
        recordedAt: new Date(stored.recordedAt),
        intent:
          graph.proposal.predicate.intent.mode === 'unspecified'
            ? null
            : graph.proposal.predicate.intent.value,
        evidence,
      });
    }
    if (commits.length < pageSize) break;
  }
  return references.sort(
    (left, right) =>
      right.recordedAt.getTime() - left.recordedAt.getTime() ||
      right.commitDigest.localeCompare(left.commitDigest)
  );
}

/**
 * Resolve a conversation source inside one project.
 *
 * A missing conversation can still produce a record when an immutable
 * EvidenceRef references its ID. That is an explicit unavailable source, not
 * a 404 and never a fabricated conversation.
 */
export async function getConversationSourceEvidence(
  db: AnyDB,
  input: GetConversationSourceEvidenceInput
): Promise<ConversationSourceEvidenceRecord | null> {
  const limit = input.limit ?? 100;
  const offset = input.offset ?? 0;

  const [conversationRows, commitReferences] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.projectId, input.projectId),
          eq(conversations.conversationId, input.conversationId)
        )
      )
      .limit(1),
    listConversationCommitReferences(db, input.projectId, input.conversationId),
  ]);
  const conversation = conversationRows[0] ?? null;

  if (conversation === null) {
    if (commitReferences.length === 0) return null;
    return {
      conversation: null,
      turns: [],
      turnCount: 0,
      revisions: [],
      commitReferences,
      limit,
      offset,
    };
  }

  const [turns, turnCount, revisions] = await Promise.all([
    findTurnsByConversation(db, {
      conversationId: input.conversationId,
      limit,
      offset,
      order: 'asc',
    }),
    getConversationTurnCount(db, input.conversationId),
    db
      .select()
      .from(sourceTextRevisions)
      .where(
        and(
          eq(sourceTextRevisions.projectId, input.projectId),
          eq(sourceTextRevisions.conversationId, input.conversationId)
        )
      )
      .orderBy(asc(sourceTextRevisions.updatedAt), asc(sourceTextRevisions.revisionId)),
  ]);

  return {
    conversation,
    turns,
    turnCount,
    revisions,
    commitReferences,
    limit,
    offset,
  };
}
