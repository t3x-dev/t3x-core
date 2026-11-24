import { z } from 'zod';

export const MAX_SOURCE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const identity = z.string().min(1).max(200);
export const SourceIngestionInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_thread'),
      title: z
        .string()
        .min(1)
        .max(200)
        .refine((value) => value.trim().length > 0),
    })
    .strict(),
  z
    .object({
      action: z.literal('append_turn'),
      source_thread_id: identity,
      expected_parent_turn_hash: identity.nullable(),
      content: z.string().min(1).max(20_000),
    })
    .strict(),
  z
    .object({
      action: z.literal('upload_material'),
      filename: z.string().min(1).max(255),
      mime_type: z.string().max(200).optional(),
      bytes_base64: z
        .base64()
        .min(4)
        .max(4 * Math.ceil(MAX_SOURCE_ATTACHMENT_BYTES / 3)),
    })
    .strict(),
]);
export type SourceIngestionInput = z.infer<typeof SourceIngestionInputSchema>;

export const SourceIngestionReceiptSchema = z.object({
  request_id: identity,
  project_id: identity,
  actor: z.object({ kind: z.literal('agent'), id: z.string().min(1) }),
  result: z.discriminatedUnion('action', [
    z.object({ action: z.literal('create_thread'), source_thread_id: identity }),
    z.object({
      action: z.literal('append_turn'),
      source_thread_id: identity,
      turn_hash: identity,
      parent_turn_hash: identity.nullable(),
      content_digest: z.string(),
    }),
    z.object({
      action: z.literal('upload_material'),
      material_id: identity,
      attachment_digest: z.string(),
      content_hash: z.string(),
      material_created_by: z.string().nullable(),
    }),
  ]),
});
export type SourceIngestionReceipt = z.infer<typeof SourceIngestionReceiptSchema>;
