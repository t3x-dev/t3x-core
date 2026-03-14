/**
 * Turn Creator
 *
 * Creates turns from imported content using @t3x-dev/storage queries.
 * The storage layer handles hash computation automatically.
 * Records turn_map provenance for traceability (RFC §2.3.1b).
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertTurn, updateConversation } from '@t3x-dev/storage';
import type { ImportMetadata, ParsedParagraph, PlatformMessage, TurnProvenance } from './types';

/** Progress callback for streaming imports */
export type ImportProgressCallback = (current: number, total: number) => void;

/**
 * Create a conversation and turns from parsed paragraphs (URL/document import).
 * Each paragraph becomes a system-role turn.
 * Records turn_map provenance mapping each turn back to source paragraph.
 */
export async function createTurnsFromParagraphs(
  db: AnyDB,
  projectId: string,
  paragraphs: ParsedParagraph[],
  metadata: ImportMetadata,
  onProgress?: ImportProgressCallback
): Promise<{ conversationId: string; turnsCreated: number }> {
  const title = metadata.title ?? metadata.source_url ?? metadata.source_filename ?? 'Imported';

  const conversation = await insertConversation(db, {
    projectId,
    title,
    metadata: {
      import: metadata,
    },
  });

  const nonEmpty = paragraphs.filter((p) => p.text.trim());
  const total = nonEmpty.length;
  let turnsCreated = 0;
  const turnMap: TurnProvenance[] = [];

  for (const para of nonEmpty) {
    const content = para.type === 'heading' ? `# ${para.text}` : para.text;

    const turn = await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: 'system',
      content,
    });

    turnMap.push({
      turn_hash: turn.turnHash,
      paragraph_index: para.index,
      element_type: para.type,
    });

    turnsCreated++;
    onProgress?.(turnsCreated, total);
  }

  // Update conversation metadata with turn_map provenance
  if (turnMap.length > 0) {
    await updateConversation(db, conversation.conversationId, {
      metadata: {
        import: { ...metadata, turn_map: turnMap },
      },
    });
  }

  return { conversationId: conversation.conversationId, turnsCreated };
}

/**
 * Create a conversation and turns from platform messages.
 * Preserves original user/assistant roles.
 * Records turn_map provenance mapping each turn back to source message index.
 */
export async function createTurnsFromMessages(
  db: AnyDB,
  projectId: string,
  messages: PlatformMessage[],
  title: string,
  metadata: ImportMetadata,
  onProgress?: ImportProgressCallback
): Promise<{ conversationId: string; turnsCreated: number }> {
  const conversation = await insertConversation(db, {
    projectId,
    title,
    metadata: {
      import: metadata,
    },
  });

  const nonEmpty = messages.filter((m) => m.content.trim());
  const total = nonEmpty.length;
  let turnsCreated = 0;
  const turnMap: TurnProvenance[] = [];

  for (let i = 0; i < nonEmpty.length; i++) {
    const msg = nonEmpty[i];

    const turn = await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: msg.role,
      content: msg.content,
    });

    turnMap.push({
      turn_hash: turn.turnHash,
      paragraph_index: i,
      element_type: 'message',
    });

    turnsCreated++;
    onProgress?.(turnsCreated, total);
  }

  // Update conversation metadata with turn_map provenance
  if (turnMap.length > 0) {
    await updateConversation(db, conversation.conversationId, {
      metadata: {
        import: { ...metadata, turn_map: turnMap },
      },
    });
  }

  return { conversationId: conversation.conversationId, turnsCreated };
}
