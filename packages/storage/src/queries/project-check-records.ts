import { sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';

export type ProjectCheckRecordKind = 'review' | 'validation' | 'schema' | 'pull-request';
export interface ProjectCheckRecord extends Record<string, unknown> {
  id: string;
  kind: ProjectCheckRecordKind;
  created_at: string;
  payload: Record<string, unknown>;
}
export interface ProjectCheckRecordQuery {
  projectId: string;
  id?: string;
  kind?: ProjectCheckRecordKind;
  workspace?: string;
  pr?: number;
  commit?: string;
  q?: string;
  before?: { createdAt: string; id: string };
  limit: number;
}

/** Read existing evidence without turning review snapshots or current PR checks into runs. */
export async function listProjectCheckRecords(
  db: AnyDB,
  input: ProjectCheckRecordQuery
): Promise<ProjectCheckRecord[]> {
  const result = await db.execute<ProjectCheckRecord>(sql`
    WITH records AS (
      SELECT 'review:' || s.snapshot_id AS id, 'review' AS kind, s.created_at,
        s.workspace_id AS workspace, NULL::integer AS pr,
        s.snapshot #>> '{objects,commit,digest}' AS commit_hash, to_jsonb(s) AS payload
      FROM transition_review_snapshots s WHERE s.project_id = ${input.projectId}
      UNION ALL
      SELECT 'validation:' || v.id, 'validation', v.created_at,
        v.workspace_id, NULL::integer, NULL::text, to_jsonb(v)
      FROM validation_runs v WHERE v.project_id = ${input.projectId}
      UNION ALL
      SELECT 'schema:' || y.id, 'schema', y.created_at,
        NULL::text, NULL::integer, y.commit_hash, to_jsonb(y)
      FROM yschema_validation_runs y WHERE y.project_id = ${input.projectId}
      UNION ALL
      SELECT 'pull-request:' || p.pull_request_id, 'pull-request', p.updated_at,
        NULL::text, p.number, p.source_commit_hash, to_jsonb(p)
      FROM pull_requests p WHERE p.project_id = ${input.projectId}
    )
    SELECT id, kind, created_at::text, payload FROM records
    WHERE TRUE
      ${input.id ? sql`AND id = ${input.id}` : sql``}
      ${input.kind ? sql`AND kind = ${input.kind}` : sql``}
      ${input.workspace ? sql`AND workspace = ${input.workspace}` : sql``}
      ${input.pr ? sql`AND pr = ${input.pr}` : sql``}
      ${input.commit ? sql`AND commit_hash = ${input.commit}` : sql``}
      ${input.q ? sql`AND concat_ws(' ', id, workspace, commit_hash, pr::text, payload->>'title', payload->>'workflow_name', payload->>'schema_name') ILIKE ${`%${input.q.replace(/[\\%_]/g, '\\$&')}%`}` : sql``}
      ${input.before ? sql`AND (created_at, id) < (${input.before.createdAt}::timestamptz, ${input.before.id})` : sql``}
    ORDER BY records.created_at DESC, id DESC
    LIMIT ${Math.max(1, Math.min(input.limit, 101))}
  `);
  return Array.isArray(result) ? result : (result as { rows: ProjectCheckRecord[] }).rows;
}
