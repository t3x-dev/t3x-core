/**
 * Merge Schemas for API validation and OpenAPI spec
 *
 * Schemas for frame-level merge operations (FrameMergeResult / FrameMergeDecision)
 */
import { z } from '@hono/zod-openapi';

// ============================================================================
// Base Schemas (Frame-level)
// ============================================================================

/**
 * Slot value schema (recursive: string | number | boolean | ref | inline | array)
 * Kept loose (z.any()) for flexibility — core types enforce structure.
 */
const SlotValueSchema = z.any();

/**
 * Frame schema — matches @t3x-dev/core Frame
 */
export const FrameSchema = z.object({
  id: z.string().openapi({ description: 'Frame ID (e.g. f_001)', example: 'f_001' }),
  type: z.string().openapi({ description: 'Semantic type', example: 'budget' }),
  slots: z.record(z.string(), SlotValueSchema).openapi({
    description: 'Key-value slots',
    example: { amount: '$3000', currency: 'USD' },
  }),
  source: z.string().optional().openapi({ description: 'Source turn reference' }),
  slot_sources: z.record(z.string(), z.any()).optional().openapi({
    description: 'Per-slot source references',
  }),
  status: z.enum(['active', 'collapsed']).optional().openapi({
    description: 'Frame display status',
  }),
});

/**
 * Relation schema — matches @t3x-dev/core Relation
 */
export const RelationSchema = z.object({
  from: z.string().openapi({ description: 'Source frame ID' }),
  to: z.string().openapi({ description: 'Target frame ID' }),
  type: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .openapi({ description: 'Relation type' }),
});

/**
 * SlotConflict schema
 */
export const SlotConflictSchema = z.object({
  key: z.string().openapi({ description: 'Conflicting slot key' }),
  baseValue: SlotValueSchema.optional(),
  sourceValue: SlotValueSchema.optional(),
  targetValue: SlotValueSchema.optional(),
});

/**
 * Frame conflict schema (for merge preparation)
 */
export const FrameConflictSchema = z.object({
  path: z.string().openapi({ description: 'Path of the conflicting node' }),
  slotConflicts: z.array(SlotConflictSchema).openapi({
    description: 'Slot-level conflicts between source and target',
  }),
});

/**
 * FrameMergeResult schema (output of prepareFrameMerge)
 */
export const FrameMergeResultSchema = z.object({
  autoKept: z.array(z.string()).openapi({
    description: 'Paths identical in both commits (auto-kept)',
  }),
  conflicts: z.array(FrameConflictSchema).openapi({
    description: 'Nodes modified differently in source and target',
  }),
  onlyInSource: z.array(z.string()).openapi({
    description: 'Paths only present in source commit',
  }),
  onlyInTarget: z.array(z.string()).openapi({
    description: 'Paths only present in target commit',
  }),
  relationsOnlyInSource: z.array(RelationSchema).openapi({
    description: 'Relations only in source',
  }),
  relationsOnlyInTarget: z.array(RelationSchema).openapi({
    description: 'Relations only in target',
  }),
  relationsInBoth: z.array(RelationSchema).openapi({
    description: 'Relations present in both',
  }),
});

/**
 * MergeResolution schema — how to resolve a single conflict
 */
const MergeResolutionSchema = z.union([
  z.literal('source'),
  z.literal('target'),
  z.literal('both'),
  z.object({ edit: FrameSchema }),
]);

/**
 * FrameMergeDecision schema (user decisions for executeFrameMerge)
 */
export const FrameMergeDecisionSchema = z.object({
  conflictResolutions: z.record(z.string(), MergeResolutionSchema).openapi({
    description: 'How to resolve each conflicted frame (frameId -> resolution)',
  }),
  keepFromSource: z.array(z.string()).openapi({
    description: 'Frame IDs from onlyInSource to keep',
  }),
  keepFromTarget: z.array(z.string()).openapi({
    description: 'Frame IDs from onlyInTarget to keep',
  }),
  keepRelationsFromSource: z.boolean().openapi({
    description: 'Whether to keep source-only relations',
  }),
  keepRelationsFromTarget: z.boolean().openapi({
    description: 'Whether to keep target-only relations',
  }),
});

/**
 * SemanticContent schema (frames + relations)
 */
export const SemanticContentSchema = z.object({
  frames: z.array(FrameSchema),
  relations: z.array(RelationSchema),
});

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * POST /v1/merge/prepare request body
 */
export const PrepareMergeRequestSchema = z.object({
  source_hash: z.string().min(1).openapi({
    description: 'Source commit hash (sha256:...)',
    example: 'sha256:abc123...',
  }),
  target_hash: z.string().min(1).openapi({
    description: 'Target commit hash (sha256:...)',
    example: 'sha256:def456...',
  }),
});

/**
 * POST /v1/merge/execute request body
 */
export const ExecuteMergeRequestSchema = z.object({
  source_hash: z.string().min(1).openapi({
    description: 'Source commit hash',
    example: 'sha256:abc123...',
  }),
  target_hash: z.string().min(1).openapi({
    description: 'Target commit hash',
    example: 'sha256:def456...',
  }),
  prepared: FrameMergeResultSchema.openapi({
    description: 'Frame merge preparation result from the prepare step',
  }),
  decisions: FrameMergeDecisionSchema.openapi({
    description: 'User decisions for resolving conflicts and keeping frames',
  }),
  message: z.string().openapi({
    description: 'Merge commit message',
    example: 'Merge feature-branch into main',
  }),
  branch: z.string().optional().openapi({
    description: 'Target branch name (optional)',
    example: 'main',
  }),
});

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Commit author schema
 */
export const CommitAuthorSchema = z.object({
  name: z.string().openapi({
    description: 'Author name',
    example: 'Alice',
  }),
  identity: z.string().optional().openapi({
    description: 'Author identity (email, etc.)',
    example: 'alice@example.com',
  }),
  verification: z.enum(['none', 'device', 'verified']).optional().openapi({
    description: 'Verification status',
    example: 'verified',
  }),
});

/**
 * Merge commit schema (response from execute)
 */
export const MergeCommitSchema = z.object({
  hash: z.string().openapi({
    description: 'Commit hash (sha256:...)',
    example: 'sha256:merge789...',
  }),
  parents: z.array(z.string()).openapi({
    description: 'Parent commit hashes [source, target]',
    example: ['sha256:abc123...', 'sha256:def456...'],
  }),
  author: z.any().openapi({
    description: 'Commit author',
  }),
  committed_at: z.string().openapi({
    description: 'Commit timestamp (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
  }),
  content: SemanticContentSchema.openapi({
    description: 'Merged state content (frames + relations)',
  }),
  message: z.string().openapi({
    description: 'Commit message',
    example: 'Merge feature-branch into main',
  }),
  branch: z.string().optional().openapi({
    description: 'Branch name',
    example: 'main',
  }),
  merge_summary: z.any().optional().openapi({
    description: 'Merge summary statistics',
  }),
});

/**
 * Prepare merge response data schema
 */
export const PrepareMergeResponseSchema = FrameMergeResultSchema;

/**
 * Execute merge response data schema
 */
export const ExecuteMergeResponseSchema = MergeCommitSchema;
