import { z } from 'zod';

export interface CreateCommitYSchemaRunInput {
  commit_hash: string;
  schema_name: string;
  schema_version: string;
}

export const CommitYSchemaRunSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  commit_hash: z.string(),
  schema_name: z.string(),
  schema_version: z.string(),
  schema_hash: z.string(),
  validator_version: z.string(),
  status: z.enum(['pending', 'running', 'passed', 'failed', 'stale']),
  valid: z.boolean(),
  ready: z.boolean(),
  error_count: z.number().int(),
  gap_count: z.number().int(),
  fix_count: z.number().int(),
  result: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

export type CommitYSchemaRun = z.infer<typeof CommitYSchemaRunSchema>;
