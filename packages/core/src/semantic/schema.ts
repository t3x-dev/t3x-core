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

// ── Tree Change Batch ──

const TreeChangeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    parent_path: z.string(),
    node: z.lazy(() => TreeNodeSchema) as z.ZodType<unknown>,
    slot_quotes: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    action: z.literal('update'),
    target_path: z.string(),
    slots: z.record(z.string(), SlotValueSchema.nullable()),
    slot_quotes: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    action: z.literal('remove'),
    target_path: z.string(),
    reason: z.string().optional(),
  }),
]);

export const TreeChangeBatchSchema = z.object({
  changes: z.array(TreeChangeSchema).min(1),
  new_relations: z.array(RelationSchema).optional(),
  remove_relations: z.array(RelationSchema).optional(),
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
