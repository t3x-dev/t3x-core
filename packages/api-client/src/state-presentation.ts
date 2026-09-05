import { z } from 'zod';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const resourceInput = z
  .object({
    path: z.string().min(1).max(200),
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    alt: z
      .string()
      .min(1)
      .max(512)
      .refine((value) => value.trim().length > 0),
    base64: z.string().max(700_000),
  })
  .strict();
export const StatePresentationInputSchema = z
  .object({
    description: z.string().max(4096),
    readme: z
      .string()
      .max(128 * 1024)
      .optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    avatarPath: z.string().max(200).optional(),
    resources: z.array(resourceInput).max(16).optional(),
  })
  .strict();
export const StatePresentationSchema = z.object({
  digest,
  document: z.object({
    schema: z.literal('t3x.dev/state-presentation/v1'),
    description: z.string(),
    readme: z.string(),
    tags: z.array(z.string()),
    avatarPath: z.string().nullable(),
    resources: z.array(resourceInput.extend({ digest, byteLength: z.number().int().positive() })),
  }),
});
export const StatePresentationResultSchema = z.object({
  commitDigest: digest,
  stateDigest: digest,
  presentation: StatePresentationSchema.nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type StatePresentationInput = z.infer<typeof StatePresentationInputSchema>;
export type StatePresentationResult = z.infer<typeof StatePresentationResultSchema>;
