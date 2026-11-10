import { z } from 'zod';
import { DownloadArtifactSchema } from './state-export.js';
export const WorkspaceDeliveryInputSchema = z
  .object({
    targetId: z.string().min(1).max(200),
    commitDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    format: z.enum(['json', 'yaml', 'bundle']),
    workspaceRevision: z.number().int().positive(),
    idempotencyKey: z.string().uuid(),
    retryOf: z.string().uuid().optional(),
  })
  .strict();
export const WorkspaceDeliveryReceiptSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  workspaceId: z.string(),
  targetId: z.string(),
  commitDigest: z.string(),
  idempotencyKey: z.string().uuid(),
  requestDigest: z.string(),
  adapter: z.enum(['t3x.download/v1', 't3x.portable/v1']),
  format: z.enum(['json', 'yaml', 'bundle']),
  artifactDigest: z.string().nullable(),
  status: z.enum(['prepared', 'failed']),
  errorCode: z.string().nullable(),
  retryOf: z.string().uuid().nullable(),
  attempt: z.number().int().positive(),
  createdAt: z.string(),
});
export const WorkspaceDeliveryResultSchema = z.object({
  receipt: WorkspaceDeliveryReceiptSchema,
  artifact: DownloadArtifactSchema.nullable(),
});
export type WorkspaceDeliveryInput = z.infer<typeof WorkspaceDeliveryInputSchema>;
export type WorkspaceDeliveryReceipt = z.infer<typeof WorkspaceDeliveryReceiptSchema>;
export type WorkspaceDeliveryResult = z.infer<typeof WorkspaceDeliveryResultSchema>;
export const WorkspaceDeliveryListSchema = z.object({
  workspaceRevision: z.number().int().positive(),
  commitDigest: z.string().nullable(),
  receipts: z.array(WorkspaceDeliveryReceiptSchema),
  targets: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      mode: z.enum(['download', 'legacy']),
      format: z.string(),
      reason: z.string().nullable(),
      configurable: z.boolean(),
    })
  ),
});
export type WorkspaceDeliveryList = z.infer<typeof WorkspaceDeliveryListSchema>;
