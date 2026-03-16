import { z } from 'zod';

// ── Slot Values (recursive) ──

const SlotRefSchema = z.object({ ref: z.string() });

// Note: typed as Record<string, unknown> instead of Record<string, SlotValue> because
// Zod's z.lazy() cannot express recursive generic types — runtime validation is correct.
const InlineFrameSchema: z.ZodType<{ type: string; slots: Record<string, unknown> }> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    slots: z.record(z.string(), SlotValueSchema),
  })
);

export const SlotValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    SlotRefSchema,
    InlineFrameSchema,
    z.array(SlotValueSchema),
  ])
);

// ── Frame ──

export const FrameSchema = z.object({
  id: z.string().regex(/^f_\d{3,}$/),
  type: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/),
  slots: z
    .record(z.string(), SlotValueSchema)
    .refine((s) => Object.keys(s).length >= 1, { message: 'Frame must have at least one slot' })
    .refine((s) => Object.keys(s).length <= 100, {
      message: 'Frame cannot have more than 100 slots',
    }),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

// ── Relation ──

export const FrameRelationTypeSchema = z.enum([
  'causes',
  'conditions',
  'contrasts',
  'elaborates',
  'follows',
  'depends',
]);

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: FrameRelationTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
});

// ── SemanticContent ──

/**
 * Schema for committed SemanticContent (final state).
 * Requires at least one frame. For intermediate/draft states
 * (e.g. buildDraft result), use the SemanticContent TypeScript type directly.
 */
export const SemanticContentSchema = z.object({
  frames: z.array(FrameSchema).min(1).max(1000),
  relations: z.array(RelationSchema).max(5000),
});

// ── Delta ──

const FrameChangeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    frame: FrameSchema,
  }),
  z.object({
    action: z.literal('update'),
    target: z.string().regex(/^f_\d{3,}$/),
    slots: z.record(z.string(), SlotValueSchema.nullable()),
  }),
  z.object({
    action: z.literal('remove'),
    target: z.string().regex(/^f_\d{3,}$/),
    reason: z.string().optional(),
  }),
]);

export const DeltaSchema = z.object({
  changes: z.array(FrameChangeSchema).min(1),
  new_relations: z.array(RelationSchema).optional(),
  remove_relations: z.array(RelationSchema).optional(),
});
