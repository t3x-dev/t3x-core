/**
 * Deduplication
 *
 * Detects duplicate imports using content hash or URL matching.
 */

import { sha256 } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { findConversationsByProject } from '@t3x-dev/storage';

/**
 * Check if content has already been imported to a project.
 * Returns a warning string if duplicate found, or undefined.
 */
export async function checkDuplicate(
  db: AnyDB,
  projectId: string,
  contentHash: string,
  sourceUrl?: string
): Promise<string | undefined> {
  const conversations = await findConversationsByProject(db, { projectId, limit: 500 });

  for (const conv of conversations) {
    if (!conv.metadataJson) continue;

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(conv.metadataJson);
    } catch {
      continue;
    }

    const importMeta = metadata.import as
      | { content_hash?: string; source_url?: string }
      | undefined;
    if (!importMeta) continue;

    // Check by content hash
    if (importMeta.content_hash === contentHash) {
      return `Duplicate detected: content already imported as "${conv.title ?? conv.conversationId}"`;
    }

    // Check by source URL
    if (sourceUrl && importMeta.source_url === sourceUrl) {
      return `Duplicate URL detected: "${sourceUrl}" already imported as "${conv.title ?? conv.conversationId}"`;
    }
  }

  return undefined;
}

/**
 * Compute content hash for dedup.
 */
export function computeContentHash(content: string): string {
  return sha256(content);
}
