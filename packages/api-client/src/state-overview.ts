import { z } from 'zod';
import { StateExportArtifactSchema } from './state-export';
import { StatePresentationSchema } from './state-presentation';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const valueType = z.enum(['object', 'array', 'null', 'string', 'number', 'boolean']);
export const StateOverviewSchema = z.object({
  revision: z.object({
    commitDigest: digest,
    stateDigest: digest,
    presentationDigest: digest.nullable(),
  }),
  author: StatePresentationSchema.nullable(),
  summary: z.object({
    kind: z.literal('sections'),
    rootType: valueType,
    total: z.number().int().nonnegative(),
    truncated: z.boolean(),
    items: z
      .array(
        z.object({
          key: z.string(),
          pointer: z.string(),
          type: valueType,
          childCount: z.number().int().nonnegative().nullable(),
        })
      )
      .max(100),
  }),
  render: z.object({
    context: z.object({
      sourceCommit: StateExportArtifactSchema.shape.sourceCommit,
      sourceState: StateExportArtifactSchema.shape.sourceState,
      value: z.unknown(),
      binding: z.null(),
      validation: z.literal('not-run'),
    }),
    status: z.object({
      state: z.literal('loaded'),
      schema: z.literal('not-requested'),
      renderer: z.literal('fallback'),
      validation: z.literal('not-run'),
    }),
    renderer: z.object({
      key: z.literal('t3x.generic'),
      version: z.literal(1),
      modelSchema: z.literal('t3x.render/generic-state/v1'),
    }),
    model: z.object({ value: z.unknown() }),
    recovery: z.object({ json: z.string(), yaml: z.string() }),
  }),
});
export type StateOverview = z.infer<typeof StateOverviewSchema>;
