import { z } from 'zod';

export interface RunWorkspaceValidationInput {
  expected_workspace_revision: number;
  expected_composition_revision?: number;
}

const draftRevision = z.object({
  workspace_revision: z.number().int().positive(),
  composition_revision: z.number().int().nonnegative().nullable(),
});

export const WorkspaceValidationDetailsSchema = z.object({
  run: z
    .object({
      id: z.string(),
      project_id: z.string(),
      workspace_id: z.string(),
      subject_type: z.literal('candidate'),
      subject_hash: z.string(),
      input_hash: z.string(),
      status: z.enum([
        'pending',
        'running',
        'passed',
        'failed',
        'stale',
        'environment_required',
        'timed_out',
      ]),
      result_json: z.object({ draft_revision: draftRevision.optional() }).passthrough(),
    })
    .passthrough(),
  steps: z.array(z.record(z.string(), z.unknown())),
  findings: z.array(z.record(z.string(), z.unknown())),
});

export type WorkspaceValidationDetails = z.infer<typeof WorkspaceValidationDetailsSchema>;
