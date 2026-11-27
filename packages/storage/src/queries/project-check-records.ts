import { sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import type { WorkspaceOwner } from './drafts';
import { publicValidationRunResult, validationRunVisibility } from './validation-runs';

export type ProjectCheckRecordKind = 'review' | 'validation' | 'schema' | 'pull-request';
export interface ProjectCheckRecord extends Record<string, unknown> {
  id: string;
  address: string | null;
  kind: ProjectCheckRecordKind;
  created_at: string;
  payload: Record<string, unknown>;
}
export interface ProjectCheckRecordQuery {
  projectId: string;
  validationOwner?: WorkspaceOwner | null;
  id?: string;
  summary?: boolean;
  kind?: ProjectCheckRecordKind;
  workspace?: string;
  pr?: number;
  commit?: string;
  q?: string;
  before?: { createdAt: string; id: string };
  limit: number;
}

function reviewCheckSummary(kind: 'replay' | 'validation' | 'runner') {
  const check = sql`s.snapshot #> ARRAY['transition', 'checks', ${kind}::text]`;
  return sql`jsonb_build_object(
    'observation', (${check})->'observation',
    'outcomes', (${check})->'outcomes',
    'has_runs', (${check}) #> '{runs,0}' is not null
  )`;
}

const reviewSummary = sql`jsonb_build_object(
  'workspace_id', s.workspace_id,
  'snapshot_id', s.snapshot_id,
  'transition_id', s.transition_id,
  'snapshot', jsonb_build_object(
    'review', jsonb_build_object('precondition', s.snapshot #> '{review,precondition}'),
    'objects', jsonb_build_object('commit', jsonb_build_object('digest', s.snapshot #> '{objects,commit,digest}')),
    'transition', jsonb_build_object(
      'decision', jsonb_build_object('outcome', s.snapshot #> '{transition,decision,outcome}'),
      'checks', jsonb_build_object(
        'objectIntegrity', s.snapshot #> '{transition,checks,objectIntegrity}',
        'replay', ${reviewCheckSummary('replay')},
        'validation', ${reviewCheckSummary('validation')},
        'runner', ${reviewCheckSummary('runner')}
      )
    )
  )
)`;

/** Read existing evidence without turning review snapshots or current PR checks into runs. */
export async function listProjectCheckRecords(
  db: AnyDB,
  input: ProjectCheckRecordQuery
): Promise<ProjectCheckRecord[]> {
  const result = await db.execute<ProjectCheckRecord>(sql`
    WITH records AS (
      SELECT 'review:' || s.snapshot_id AS id, 'review' AS kind, s.created_at,
        s.workspace_id AS workspace, NULL::integer AS pr,
        s.snapshot #>> '{objects,commit,digest}' AS commit_hash,
        ${input.summary ? reviewSummary : sql`to_jsonb(s)`} || jsonb_build_object(
          'content_validation', prep.canonical_json::jsonb #> '{schemaReview,contentValidation}'
        ) AS payload
      FROM transition_review_snapshots s
      LEFT JOIN transition_proposal_preparations prep ON prep.transition_id = s.transition_id
      WHERE s.project_id = ${input.projectId}
      UNION ALL
      SELECT 'validation:' || v.id, 'validation', v.created_at,
        v.workspace_id, NULL::integer, NULL::text,
        ${
          input.summary
            ? sql`jsonb_build_object('workspace_id', v.workspace_id, 'workflow_name', v.workflow_name, 'status', v.status)`
            : sql`to_jsonb(v) || jsonb_build_object('result_json', ${publicValidationRunResult(sql`v.result_json`)})`
        }
      FROM validation_runs v WHERE v.project_id = ${input.projectId}
        AND ${validationRunVisibility(sql`v.result_json`, input.validationOwner)}
      UNION ALL
      SELECT 'schema:' || y.id, 'schema', y.created_at,
        NULL::text, NULL::integer, y.commit_hash,
        ${
          input.summary
            ? sql`jsonb_build_object('schema_name', y.schema_name, 'commit_hash', y.commit_hash, 'status', y.status)`
            : sql`to_jsonb(y)`
        }
      FROM yschema_validation_runs y WHERE y.project_id = ${input.projectId}
      UNION ALL
      SELECT 'pull-request:' || p.pull_request_id, 'pull-request', p.updated_at,
        NULL::text, p.number, p.source_commit_hash,
        ${
          input.summary
            ? sql`jsonb_build_object('number', p.number, 'title', p.title, 'source_branch', p.source_branch, 'target_branch', p.target_branch)`
            : sql`to_jsonb(p)`
        }
      FROM pull_requests p WHERE p.project_id = ${input.projectId}
    ), addressed AS (
      SELECT records.*,
        CASE WHEN records.kind = 'pull-request' THEN 'pr-' || records.pr::text
          ELSE records.kind || '-' || address.number::text END AS address
      FROM records
      LEFT JOIN repository_object_addresses address
        ON address.project_id = ${input.projectId} AND address.kind = records.kind
        AND address.object_id = substring(records.id FROM strpos(records.id, ':') + 1)
    )
    SELECT id, kind, created_at::text, payload, address FROM addressed
    WHERE TRUE
      ${input.id ? sql`AND (id = ${input.id} OR address = ${input.id})` : sql``}
      ${input.kind ? sql`AND kind = ${input.kind}` : sql``}
      ${input.workspace ? sql`AND workspace = ${input.workspace}` : sql``}
      ${input.pr ? sql`AND pr = ${input.pr}` : sql``}
      ${input.commit ? sql`AND commit_hash = ${input.commit}` : sql``}
      ${input.q ? sql`AND concat_ws(' ', address, id, workspace, commit_hash, pr::text, payload->>'title', payload->>'workflow_name', payload->>'schema_name') ILIKE ${`%${input.q.replace(/[\\%_]/g, '\\$&')}%`}` : sql``}
      ${input.before ? sql`AND (created_at, id) < (${input.before.createdAt}::timestamptz, ${input.before.id})` : sql``}
    ORDER BY addressed.created_at DESC, id DESC
    LIMIT ${Math.max(1, Math.min(input.limit, 101))}
  `);
  return Array.isArray(result) ? result : (result as { rows: ProjectCheckRecord[] }).rows;
}
