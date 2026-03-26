import { z } from 'zod';

// ── ID Patterns ──

/** Accepts both legacy f_NNN IDs and path-based IDs (e.g., hangzhou_trip/activity_plan) */
const FRAME_ID_PATTERN = /^(f_\d{3,}|[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*)$/;

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
    z.record(
      z.string(),
      z.lazy(() => SlotValueSchema)
    ),
    z.array(SlotValueSchema),
  ])
);

// ── Frame ──

export const FrameSchema = z.object({
  id: z.string().regex(FRAME_ID_PATTERN),
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
  'elaborates', // Legacy only — tree-native uses TreeNode.children instead
  'follows',
  'depends',
]);

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: FrameRelationTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
});

// ── Tree Node ──

export const TreeNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    key: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_]*$/),
    slots: z.record(z.string(), SlotValueSchema),
    children: z.array(TreeNodeSchema),
    slot_quotes: z.record(z.string(), z.string()).optional(),
    source: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
);

// ── SemanticContent ──

/**
 * Schema for committed SemanticContent (final state).
 * Requires at least one frame. For intermediate/draft states
 * (e.g. buildDraft result), use the SemanticContent TypeScript type directly.
 */
export const SemanticContentSchema = z.object({
  topic: z.string().optional(),
  root_frame_id: z.string().optional(),
  tree: z.lazy(() => TreeNodeSchema).optional(),
  frames: z.array(FrameSchema).min(1).max(1000),
  relations: z.array(RelationSchema).max(5000),
});

// ── Delta ──

// NOTE: LegacyFrameChangeSchema uses FRAME_ID_PATTERN (accepts both f_NNN and path-based IDs)
// because the legacy applyDelta code path may be invoked with flattened tree-native frames
// that have path-based IDs. This is intentional.
const LegacyFrameChangeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    frame: FrameSchema,
  }),
  z.object({
    action: z.literal('update'),
    target: z.string().regex(FRAME_ID_PATTERN),
    slots: z.record(z.string(), SlotValueSchema.nullable()),
  }),
  z.object({
    action: z.literal('remove'),
    target: z.string().regex(FRAME_ID_PATTERN),
    reason: z.string().optional(),
  }),
]);

export const DeltaSchema = z.object({
  changes: z.array(LegacyFrameChangeSchema).min(1),
  new_relations: z.array(RelationSchema).optional(),
  remove_relations: z.array(RelationSchema).optional(),
});

// ── Tree-Native Delta ──

const TreeNativeChangeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    parent_path: z.string(),
    node: z.record(z.string(), z.unknown()),
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

export const TreeNativeDeltaSchema = z.object({
  changes: z.array(TreeNativeChangeSchema).min(1),
  drift_detected: z.boolean().optional(),
  new_relations: z.array(RelationSchema).optional(),
  remove_relations: z.array(RelationSchema).optional(),
});
