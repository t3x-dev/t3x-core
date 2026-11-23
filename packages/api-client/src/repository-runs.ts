import { z } from 'zod';

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
