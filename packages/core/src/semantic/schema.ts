import { z } from 'zod';

// ── Slot Values (recursive) ──

export const SlotValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.lazy(() => SlotValueSchema)),
    z.array(SlotValueSchema),
  ])
);

// ── Tree Node ──

export const TreeNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
    slots: z.record(z.string(), SlotValueSchema),
    children: z.array(TreeNodeSchema),
    slot_quotes: z.record(z.string(), z.string()).optional(),
    source: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
);

// ── Relation ──

export const RelationTypeSchema = z.enum([
  'causes',
  'conditions',
  'contrasts',
  'follows',
  'depends',
]);

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: RelationTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
});

// ── SemanticContent ──

export const SemanticContentSchema = z.object({
  trees: z.array(z.lazy(() => TreeNodeSchema)).min(1).max(1000),
  relations: z.array(RelationSchema).max(5000).default([]),
});

// ── Internal: FlatNode Schema (for diff/merge validation only) ──

/** @internal */
export const FlatNodeSchema = z.object({
  id: z.string(),
  type: z.string().min(1),
  slots: z.record(z.string(), SlotValueSchema)
    .refine((s) => Object.keys(s).length >= 1, { message: 'FlatNode must have at least one slot' }),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
