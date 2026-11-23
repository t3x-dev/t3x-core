import { z } from 'zod';

export const RepositoryRunTriggerInputSchema = z
  .object({
    request_id: z.string().min(1).max(200),
    commit_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  })
  .strict();

export const RepositoryRunReceiptSchema = z.object({
  run_id: z.string(),
  commit_digest: z.string(),
  configuration_digest: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
});
export type RepositoryRunTriggerInput = z.infer<typeof RepositoryRunTriggerInputSchema>;

export interface ListRepositoryRunsInput {
  project_id: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  limit: number;
  offset: number;
}

const RepositoryRunSummarySchema = z.object({
  runId: z.string(),
  projectId: z.string().nullable(),
  runnerRunId: z.string().nullable(),
  commitRef: z.string().nullable(),
  leafId: z.string().nullable(),
  status: z.string(),
  title: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RepositoryRunDetailsSchema = RepositoryRunSummarySchema.extend({
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  resultJson: z.string().nullable(),
});

export const RepositoryRunsPageSchema = z.object({
  runs: z.array(RepositoryRunSummarySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type RepositoryRunSummary = z.infer<typeof RepositoryRunSummarySchema>;
export type RepositoryRunDetails = z.infer<typeof RepositoryRunDetailsSchema>;
export type RepositoryRunsPage = z.infer<typeof RepositoryRunsPageSchema>;
