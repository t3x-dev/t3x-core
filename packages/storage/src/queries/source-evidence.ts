/**
 * Repository-owned source evidence reads.
 *
 * This projection deliberately reuses durable conversation, turn, revision,
 * and immutable Transition EvidenceRefs. It does not create a second source
 * truth or scan deprecated commit metadata.
 */

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
  type ConversationSourceCommitReference,
  listConversationCommitReferences,
} from './source-evidence-references';
import { findTurnsByConversation } from './turns';

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
