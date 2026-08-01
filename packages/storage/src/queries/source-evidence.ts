/**
 * Repository-owned source evidence reads.
 *
 * This projection deliberately reuses durable conversation, turn, revision,
 * and commit-source records. It does not create a second source truth.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type Conversation,
  conversations,
  type SourceTextRevision,
  sourceTextRevisions,
  type Turn,
} from '../schema';
import { commits } from '../schema-commits';
import { getConversationTurnCount } from './conversations';
import { findTurnsByConversation } from './turns';

export interface ConversationSourceCommitReference {
  commitHash: string;
  branch: string;
  message: string | null;
  recordedAt: Date;
  sourceTitle: string | null;
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

type StoredCommitSource = {
  type: 'conversation' | 'import' | 'leaf';
  id: string;
  title?: string;
};

async function listConversationCommitReferences(
  db: AnyDB,
  projectId: string,
  conversationId: string
): Promise<ConversationSourceCommitReference[]> {
  const sourceRef = JSON.stringify([{ type: 'conversation', id: conversationId }]);
  const rows = await db
    .select({
      commitHash: commits.hash,
      branch: commits.branch,
      message: commits.message,
      recordedAt: commits.committedAt,
      sources: commits.sources,
    })
    .from(commits)
    .where(and(eq(commits.projectId, projectId), sql`${commits.sources} @> ${sourceRef}::jsonb`))
    .orderBy(desc(commits.committedAt), desc(commits.hash));

  return rows.map((row) => {
    const source = ((row.sources ?? []) as StoredCommitSource[]).find(
      (candidate) => candidate.type === 'conversation' && candidate.id === conversationId
    );
    return {
      commitHash: row.commitHash,
      branch: row.branch ?? 'main',
      message: row.message ?? null,
      recordedAt: row.recordedAt,
      sourceTitle: source?.title ?? null,
    };
  });
}

/**
 * Resolve a conversation source inside one project.
 *
 * A missing conversation can still produce a record when legacy commit JSON
 * references its ID. That is an explicit unavailable source, not a 404 and
 * never a fabricated conversation.
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
