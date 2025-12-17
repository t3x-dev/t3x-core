/**
 * Drafts V2 CRUD operations
 */

import { getDb } from '../db';
import type {
  DraftV2Record,
  CreateDraftV2Input,
  ListDraftsV2Options,
} from './types';
import { generateDraftId, isoNow, computeTextHash } from './utils';

export async function createDraftV2(input: CreateDraftV2Input): Promise<DraftV2Record> {
  const db = getDb();
  const draft_id = generateDraftId();
  const created_at = isoNow();

  const bridge_payload_json = JSON.stringify(input.bridge_payload);
  const must_have_json = input.must_have ? JSON.stringify(input.must_have) : null;
  const mustnt_have_json = input.mustnt_have ? JSON.stringify(input.mustnt_have) : null;
  const llm_config_json = JSON.stringify(input.llm_config);

  // ephemeral drafts have NULL completed_at until adopted/superseded
  await db.prepare(
    `INSERT INTO drafts_v2
     (draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
      bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
      llm_config_json, text, status, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ephemeral', ?, NULL)`
  ).run(
    draft_id,
    input.project_id,
    input.conversation_id,
    input.base_commit_hash ?? null,
    input.turn_anchor_hash ?? null,
    input.bridge_id,
    bridge_payload_json,
    must_have_json,
    mustnt_have_json,
    llm_config_json,
    input.text,
    created_at
  );

  return {
    draft_id,
    project_id: input.project_id,
    conversation_id: input.conversation_id,
    base_commit_hash: input.base_commit_hash ?? null,
    turn_anchor_hash: input.turn_anchor_hash ?? null,
    bridge_id: input.bridge_id,
    bridge_payload_json,
    must_have_json,
    mustnt_have_json,
    llm_config_json,
    text: input.text,
    status: 'ephemeral',
    created_at,
    completed_at: null,
  };
}

export async function getDraftV2(draft_id: string): Promise<DraftV2Record | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT * FROM drafts_v2 WHERE draft_id = ?`)
    .get(draft_id) as DraftV2Record | undefined;
  return row ?? null;
}

export async function listDraftsV2(options: ListDraftsV2Options): Promise<DraftV2Record[]> {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  if (options.status) {
    return await db
      .prepare(
        `SELECT * FROM drafts_v2
         WHERE project_id = ? AND status = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(options.project_id, options.status, limit, offset) as DraftV2Record[];
  }

  return await db
    .prepare(
      `SELECT * FROM drafts_v2
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(options.project_id, limit, offset) as DraftV2Record[];
}

export async function updateDraftV2Status(
  draft_id: string,
  status: 'ephemeral' | 'adopted' | 'superseded'
): Promise<DraftV2Record | null> {
  const db = getDb();
  const existing = await getDraftV2(draft_id);
  if (!existing) return null;

  // Set completed_at when transitioning to adopted/superseded
  // Clear it when reverting to ephemeral
  const completed_at = status !== 'ephemeral' ? isoNow() : null;

  await db.prepare(
    `UPDATE drafts_v2 SET status = ?, completed_at = ? WHERE draft_id = ?`
  ).run(status, completed_at, draft_id);

  return await getDraftV2(draft_id);
}

export async function adoptDraft(draft_id: string): Promise<DraftV2Record | null> {
  return await updateDraftV2Status(draft_id, 'adopted');
}

export async function supersedeDraft(draft_id: string): Promise<DraftV2Record | null> {
  return await updateDraftV2Status(draft_id, 'superseded');
}

export async function getDraftTextHash(draft_id: string): Promise<string | null> {
  const draft = await getDraftV2(draft_id);
  if (!draft) return null;
  return computeTextHash(draft.text);
}

export async function deleteDraftV2(draft_id: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .prepare(`DELETE FROM drafts_v2 WHERE draft_id = ?`)
    .run(draft_id);
  return result.changes > 0;
}
