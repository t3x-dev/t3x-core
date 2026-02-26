/**
 * Turn Creator
 *
 * Creates turns from imported content using @t3x/storage queries.
 * The storage layer handles hash computation automatically.
 */

import type { AnyDB } from '@t3x/storage/pglite';
import { insertConversation, insertTurn } from '@t3x/storage/pglite';
import type { ImportMetadata, ParsedParagraph, PlatformMessage } from './types';

/** Progress callback for streaming imports */
export type ImportProgressCallback = (current: number, total: number) => void;

/**
 * Create a conversation and turns from parsed paragraphs (URL/document import).
 * Each paragraph becomes a system-role turn.
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

  for (const para of nonEmpty) {
    const content = para.type === 'heading' ? `# ${para.text}` : para.text;

    await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: 'system',
      content,
    });

    turnsCreated++;
    onProgress?.(turnsCreated, total);
  }

  return { conversationId: conversation.conversationId, turnsCreated };
}

/**
 * Create a conversation and turns from platform messages.
 * Preserves original user/assistant roles.
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

  for (const msg of nonEmpty) {
    await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: msg.role,
      content: msg.content,
    });

    turnsCreated++;
    onProgress?.(turnsCreated, total);
  }

  return { conversationId: conversation.conversationId, turnsCreated };
}
