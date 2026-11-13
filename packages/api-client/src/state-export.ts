import { z } from 'zod';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const StateExportArtifactSchema = z.object({
  format: z.enum(['json', 'yaml']),
  scope: z.literal('full-state-value'),
  mimeType: z.enum(['application/json', 'application/yaml']),
  filename: z.string(),
  content: z.string(),
  byteLength: z.number().int().nonnegative(),
  byteDigest: digest,
  sourceCommit: z.object({ kind: z.literal('commit'), schema: z.literal('t3x/commit/v2'), digest }),
  sourceState: z.object({ kind: z.literal('state'), schema: z.literal('t3x/state/v1'), digest }),
  codec: z.object({ mediaType: z.string(), version: z.string() }),
  serialization: z.enum(['t3x.json-value/v1', 't3x.yaml-value/v1']),
});
export type StateExportArtifact = z.infer<typeof StateExportArtifactSchema>;

export const PortableArtifactSchema = z.object({
  format: z.literal('bundle'),
  scope: z.literal('portable-commit'),
  mimeType: z.literal('application/json'),
  filename: z.string(),
  content: z.string(),
  byteLength: z.number().int().nonnegative(),
  byteDigest: digest,
  sourceCommit: StateExportArtifactSchema.shape.sourceCommit,
  sourceState: StateExportArtifactSchema.shape.sourceState,
  schemaDigest: digest,
  serialization: z.literal('t3x.portable-artifact/v1'),
});
export type PortableArtifact = z.infer<typeof PortableArtifactSchema>;
export const DownloadArtifactSchema = z.union([StateExportArtifactSchema, PortableArtifactSchema]);
export type DownloadArtifact = z.infer<typeof DownloadArtifactSchema>;
