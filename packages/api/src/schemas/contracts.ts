/**
 * T3X API Contracts
 *
 * This defines the API request/response schemas.
 * All implementations must conform to these contracts.
 *
 * Naming convention:
 * - API JSON: snake_case
 * - TypeScript: camelCase
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

import { z } from '@hono/zod-openapi';
import { ALL_LEAF_TYPES, COMMIT_SCHEMA, LEAF_TYPES } from '@t3x-dev/core';

// ═══════════════════════════════════════════════════════════════════════════
// Local SemanticContent Schema (mirrors @t3x-dev/core SemanticContentSchema)
//
// Re-defined here using the local `z` from @hono/zod-openapi to avoid
// zod v3/v4 incompatibility. The core package uses plain zod (v3), but
// @hono/zod-openapi re-exports zod v4. Mixing schema instances across
// versions causes "Invalid element" errors at runtime.
// ═══════════════════════════════════════════════════════════════════════════

const OapiSlotRefSchema = z.object({ ref: z.string() });

const OapiSlotValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), OapiSlotRefSchema, z.array(OapiSlotValueSchema)])
);

const OapiTreeNodeSchema: z.ZodType<{
  key: string;
  slots: Record<string, unknown>;
  children: unknown[];
  slot_quotes?: Record<string, string>;
  source?: string;
}> = z.lazy(() =>
  z.object({
    key: z.string().min(1),
    slots: z.record(z.string(), OapiSlotValueSchema),
    children: z.array(OapiTreeNodeSchema).default([]),
    slot_quotes: z.record(z.string(), z.string()).optional(),
    source: z.string().optional(),
  })
);

const OapiRelationTypeSchema = z.enum(['causes', 'conditions', 'contrasts', 'follows', 'depends']);

const OapiRelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: OapiRelationTypeSchema,
});

const OapiSemanticContentSchema = z.object({
  trees: z.array(OapiTreeNodeSchema).min(1).max(1000),
  relations: z.array(OapiRelationSchema).max(5000),
});

// ═══════════════════════════════════════════════════════════════════════════
// Common Schemas
// ═══════════════════════════════════════════════════════════════════════════

const SuccessResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

// ═══════════════════════════════════════════════════════════════════════════
// Constraint Schema
// ═══════════════════════════════════════════════════════════════════════════

export const ConstraintSourceFrameSchema = z.object({
  frame_type: z.string(),
  slot_key: z.string().optional(),
});

export const ConstraintSchema = z.object({
  id: z.string().optional(), // Optional on create, required on response
  type: z.enum(['require', 'exclude']),
  match_mode: z.enum(['exact', 'semantic']),
  value: z.string().min(1).max(5000),
  description: z.string().max(2000).optional(),
  /** Link to source frame + slot (frame-based traceability) */
  source_frame: ConstraintSourceFrameSchema.optional(),
  reason: z.string().max(2000).optional(), // For exclude constraints
});

// ═══════════════════════════════════════════════════════════════════════════
// Assertion Schema
// ═══════════════════════════════════════════════════════════════════════════

export const AssertionSchema = z.object({
  id: z.string(),
  constraint_id: z.string(),
  passed: z.boolean(),
  details: z.string(),
  lesson: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Commit API
// ═══════════════════════════════════════════════════════════════════════════

// POST /v1/commits
// Use passthrough() to preserve unknown fields for invalid field detection
//
// Validation Rules:
// 1. If `schema` provided, must equal COMMIT_SCHEMA ('t3x/commit')
// 2. `content` required with trees (SemanticContent)
// 3. `author` required with type ('human' | 'agent')
// 4. `constraints` NOT allowed at commit level (use Leaves instead)
export const CreateCommitRequest = z
  .object({
    // Required fields
    author: z
      .object({
        type: z.enum(['human', 'agent']),
        id: z.string().optional(),
        name: z.string().optional(),
      })
      .describe('Author information. type is required.'),
    content: OapiSemanticContentSchema.describe(
      'Semantic tree content (trees + relations). Required.'
    ),
    project_id: z.string().min(1, 'project_id is required'),

    // Optional fields
    parents: z
      .array(z.string())
      .default([])
      .describe('Parent commit hashes (empty for root commit)'),
    message: z.string().max(2000).optional().describe('Human-readable commit message'),
    branch: z.string().optional().describe('Branch name (defaults to main)'),

    // Optional self-identifier; if present it must match COMMIT_SCHEMA.
    schema: z.string().optional().describe(`If provided, must equal '${COMMIT_SCHEMA}'`),
    constraints: z.unknown().optional().describe('Not allowed at commit level - use Leaves'),
  })
  .passthrough();

export const CommitResponse = z.object({
  hash: z.string(),
  schema: z.literal(COMMIT_SCHEMA),
  parents: z.array(z.string()),
  author: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  committed_at: z.string(),
  content: OapiSemanticContentSchema,
  project_id: z.string().nullable(),
  message: z.string().nullable(),
  branch: z.string().nullable(),
  provenance: z.unknown().nullable().optional(),
  created_at: z.string(),
  merge_summary: z
    .object({
      kept_identical: z.number(),
      resolved_conflicts: z.number(),
      kept_from_source: z.number(),
      kept_from_target: z.number(),
      discarded: z.number(),
      total_nodes: z.number(),
      release_note: z
        .object({
          title: z.string(),
          timestamp: z.string(),
          source_branch: z.string(),
          target_branch: z.string(),
          summary: z.string(),
          sections: z.array(
            z.object({
              heading: z.string(),
              items: z.array(z.string()),
            })
          ),
        })
        .optional(),
    })
    .nullable()
    .optional(),
});

export const CreateCommitResponse = SuccessResponse(CommitResponse);
export const GetCommitResponse = SuccessResponse(CommitResponse);
export const ListCommitsResponse = SuccessResponse(z.array(CommitResponse));

// ═══════════════════════════════════════════════════════════════════════════
// Leaves API
// ═══════════════════════════════════════════════════════════════════════════

// Use LEAF_TYPES from @t3x-dev/core as single source of truth
const LeafTypeEnum = z.enum(LEAF_TYPES);

// All valid types stored in leaves table (generation + deploy)
const AnyLeafTypeEnum = z.enum(ALL_LEAF_TYPES);

// POST /v1/leaves
export const CreateLeafRequest = z.object({
  commit_hash: z.string(),
  type: AnyLeafTypeEnum,
  title: z.string().optional(),
  constraints: z.array(ConstraintSchema).default([]),
  config: z
    .object({
      prompt_template: z.string().optional(),
      model: z.string().optional(),
      max_tokens: z.number().optional(),
    })
    .passthrough()
    .default({}),
  project_id: z.string(),
});

export const LeafResponse = z.object({
  id: z.string(),
  commit_hash: z.string(),
  type: AnyLeafTypeEnum,
  title: z.string().nullable(),
  constraints: z.array(ConstraintSchema),
  config: z.record(z.string(), z.unknown()),
  output: z.string().nullable(),
  generated_at: z.string().nullable(),
  assertions: z.array(AssertionSchema).nullable(),
  runner_assertions: z.array(AssertionSchema).nullable(),
  project_id: z.string(),
  created_at: z.string(),
  created_by: z.string().nullable(),
});

export const CreateLeafResponse = SuccessResponse(LeafResponse);
export const GetLeafResponse = SuccessResponse(LeafResponse);
export const ListLeavesResponse = SuccessResponse(z.array(LeafResponse));

// PATCH /v1/leaves/:id
export const UpdateLeafRequest = z.object({
  title: z.string().max(500).optional(),
  constraints: z.array(ConstraintSchema).max(100).optional(),
  config: z
    .object({
      prompt_template: z.string().optional(),
      model: z.string().optional(),
      max_tokens: z.number().optional(),
    })
    .passthrough()
    .optional(),
  output: z.string().max(1_000_000).nullable().optional(),
});

export const UpdateLeafResponse = SuccessResponse(LeafResponse);

// DELETE /v1/leaves/:id
export const DeleteLeafResponse = SuccessResponse(
  z.object({
    deleted: z.literal(true),
    id: z.string(),
  })
);

// POST /v1/leaves/:id/generate
export const GenerateLeafOutputRequest = z
  .object({
    /** Generation mode: 'fast' (1 round), 'standard' (2 rounds), 'thorough' (3 rounds) */
    mode: z.enum(['fast', 'standard', 'thorough']).optional(),
    /** Style preferences for thorough mode (Round 3) */
    style_preferences: z
      .object({
        tone: z.string().optional(),
        length: z.string().optional(),
        formality: z.string().optional(),
      })
      .optional(),
  })
  .optional();

export const GenerateLeafOutputResponse = SuccessResponse(
  z.object({
    output: z.string(),
    generated_at: z.string(),
    validation: z
      .object({
        all_passed: z.boolean(),
        passed_count: z.number(),
        failed_count: z.number(),
        attempts: z.number(),
      })
      .optional(),
    /** Multi-round generation details (present when mode is standard or thorough) */
    rounds: z
      .array(
        z.object({
          name: z.string(),
          round_number: z.number(),
          constraints_passed: z.boolean(),
          failed_constraints: z.array(z.string()),
        })
      )
      .optional(),
    /** Total rounds executed */
    total_rounds: z.number().optional(),
    /** Generation mode used */
    mode: z.enum(['fast', 'standard', 'thorough']).optional(),
  })
);

// POST /v1/leaves/:id/validate
export const ValidateLeafOutputRequest = z
  .object({
    use_semantic: z.boolean().default(false),
  })
  .optional();

export const ValidateLeafOutputResponse = SuccessResponse(
  z.object({
    leaf: LeafResponse,
    validation: z.object({
      all_passed: z.boolean(),
      passed_count: z.number(),
      failed_count: z.number(),
    }),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Leaf History API
// ═══════════════════════════════════════════════════════════════════════════

// LeafConfig schema (matches LeafConfig type from @t3x-dev/core)
const LeafConfigSchema = z
  .object({
    prompt_template: z.string().optional(),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
  })
  .passthrough();

// GET /v1/leaves/:id/history
export const LeafHistoryResponse = z.object({
  id: z.string(), // lhist_xxx
  leaf_id: z.string(), // 关联的 Leaf ID
  output: z.string(), // 生成的输出内容
  config: LeafConfigSchema, // 生成时使用的配置
  model: z.string(), // 使用的 LLM 模型
  generated_at: z.string(), // 生成时间 ISO8601
  created_by: z.string().nullable(), // 触发生成的用户/系统
});

export const GetLeafHistoryResponse = SuccessResponse(LeafHistoryResponse);
export const ListLeafHistoryResponse = SuccessResponse(z.array(LeafHistoryResponse));

// POST /v1/leaves/:id/restore
export const RestoreLeafOutputRequest = z.object({
  history_id: z.string(), // 要恢复的历史记录 ID
});

export const RestoreLeafOutputResponse = SuccessResponse(LeafResponse);

// DELETE /v1/leaf-history/:id
export const DeleteLeafHistoryResponse = SuccessResponse(
  z.object({
    deleted: z.literal(true),
    id: z.string(),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Batch Generation API
// ═══════════════════════════════════════════════════════════════════════════

// POST /v1/commits/{hash}/leaves/batch
// 单个 leaf 的配置（批量创建时使用）
export const BatchLeafConfig = z.object({
  type: LeafTypeEnum, // leaf 类型 (tweet, weibo, email 等)
  title: z.string().optional(), // 可选标题
  constraints: z.array(ConstraintSchema).default([]), // 约束条件
  config: LeafConfigSchema.default({}), // 生成配置
});

// 批量生成请求
export const BatchGenerateRequest = z.object({
  project_id: z.string().min(1), // 项目 ID
  leaves: z
    .array(BatchLeafConfig)
    .min(1, 'At least one leaf config is required')
    .max(10, 'Maximum 10 leaves per batch'), // leaf 配置数组 (1-10 个)
  skip_generation: z.boolean().default(false), // 是否跳过生成，仅创建 leaves
});

// 单个 leaf 的结果
export const BatchLeafResult = z.object({
  leaf: LeafResponse.nullable(), // 成功时返回 leaf 数据
  error: z
    .object({
      code: z.string(), // 错误码
      message: z.string(), // 错误信息
    })
    .nullable(), // 失败时返回错误信息
});

// 批量生成响应
export const BatchGenerateResponse = SuccessResponse(
  z.object({
    results: z.array(BatchLeafResult), // 每个 leaf 的结果
    summary: z.object({
      total: z.number(), // 总数
      succeeded: z.number(), // 成功数
      failed: z.number(), // 失败数
    }),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Pins API
// ═══════════════════════════════════════════════════════════════════════════

const PinTypeEnum = z.enum(['conversation', 'leaf']);

// POST /v1/projects/:id/pins
export const CreatePinRequest = z.object({
  type: PinTypeEnum,
  ref_id: z.string(),
  selected_assertion_ids: z.array(z.string()).optional(),
});

export const PinResponse = z.object({
  id: z.string(),
  project_id: z.string(),
  type: PinTypeEnum,
  ref_id: z.string(),
  selected_assertion_ids: z.array(z.string()).nullable(),
  pinned_at: z.string(),
  pinned_by: z.string().nullable(),
});

export const CreatePinResponse = SuccessResponse(PinResponse);
export const GetPinResponse = SuccessResponse(PinResponse);
export const ListPinsResponse = SuccessResponse(z.array(PinResponse));

// PATCH /v1/pins/:id/assertions
export const UpdatePinAssertionsRequest = z.object({
  selected_assertion_ids: z.array(z.string()),
});

export const UpdatePinAssertionsResponse = SuccessResponse(PinResponse);

// DELETE /v1/pins/:id
export const DeletePinResponse = SuccessResponse(
  z.object({
    deleted: z.literal(true),
    id: z.string(),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Conversation Context API
// ═══════════════════════════════════════════════════════════════════════════

// GET /v1/conversations/:id/context
export const ConversationContextResponse = z.object({
  conversation_id: z.string(),
  selected_pin_ids: z.array(z.string()).nullable(),
  updated_at: z.string(),
});

export const GetConversationContextResponse = SuccessResponse(
  ConversationContextResponse.nullable() // null = using default (all pins)
);

// PUT /v1/conversations/:id/context
export const UpdateConversationContextRequest = z.object({
  selected_pin_ids: z.array(z.string()).nullable(), // null = use all pins
});

export const UpdateConversationContextResponse = SuccessResponse(ConversationContextResponse);

// GET /v1/conversations/:id/memory
export const GetConversationMemoryResponse = SuccessResponse(
  z.object({
    text: z.string(),
    token_estimate: z.number(),
    sources: z.array(
      z.object({
        type: z.enum(['commit', 'conversation', 'leaf']),
        id: z.string(),
        title: z.string().optional(),
      })
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Extraction Style Config
// ═══════════════════════════════════════════════════════════════════════════

export const ExtractionStyleSchema = z.object({
  granularity: z.enum(['concise', 'balanced', 'detailed']),
  quote_length: z.enum(['minimal', 'contextual']),
  update_stance: z.enum(['conservative', 'balanced', 'aggressive']),
  tier3: z.enum(['skip', 'extract']),
});

// ═══════════════════════════════════════════════════════════════════════════
// Type Exports (for use in route handlers)
// ═══════════════════════════════════════════════════════════════════════════

export type CreateCommitRequestType = z.infer<typeof CreateCommitRequest>;
export type CommitResponseType = z.infer<typeof CommitResponse>;

export type CreateLeafRequestType = z.infer<typeof CreateLeafRequest>;
export type UpdateLeafRequestType = z.infer<typeof UpdateLeafRequest>;
export type LeafResponseType = z.infer<typeof LeafResponse>;

export type CreatePinRequestType = z.infer<typeof CreatePinRequest>;
export type PinResponseType = z.infer<typeof PinResponse>;
export type UpdatePinAssertionsRequestType = z.infer<typeof UpdatePinAssertionsRequest>;

export type UpdateConversationContextRequestType = z.infer<typeof UpdateConversationContextRequest>;
export type ConversationContextResponseType = z.infer<typeof ConversationContextResponse>;

// ═══════════════════════════════════════════════════════════════════════════
// Merge Checks API
// ═══════════════════════════════════════════════════════════════════════════

export const MergeCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().optional(),
});

export const MergeChecksResponse = SuccessResponse(z.array(MergeCheckSchema));
export type MergeCheckType = z.infer<typeof MergeCheckSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// Merge API
// ═══════════════════════════════════════════════════════════════════════════

const WordDiffSegmentSchema = z.object({
  type: z.enum(['unchanged', 'added', 'removed']),
  text: z.string(),
});

/** FlatNode representation for merge operations */
const MergeNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
});

const MergeSimilarPairSchema = z.object({
  source: MergeNodeSchema,
  target: MergeNodeSchema,
  word_diff: z.array(WordDiffSegmentSchema),
  resolution: z.enum(['source', 'target']).optional(),
});

const MergeCandidateSchema = z.object({
  node: MergeNodeSchema,
  keep: z.boolean(),
});

export const MergeResultSchema = z.object({
  identical: z.array(MergeNodeSchema),
  similar_pairs: z.array(MergeSimilarPairSchema),
  only_in_source: z.array(MergeCandidateSchema),
  only_in_target: z.array(MergeCandidateSchema),
});

// POST /v1/merge-v4/prepare
export const PrepareMergeRequest = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
});

export const PrepareMergeResponse = SuccessResponse(MergeResultSchema);

// POST /v1/merge-v4/execute
export const ExecuteMergeRequest = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
  prepared: MergeResultSchema,
  message: z.string().min(1).max(2000),
  branch: z.string().optional(),
  project_id: z.string().min(1),
});

export const ExecuteMergeResponse = SuccessResponse(CommitResponse);

// Type exports
export type MergeResultType = z.infer<typeof MergeResultSchema>;
export type PrepareMergeRequestType = z.infer<typeof PrepareMergeRequest>;
export type ExecuteMergeRequestType = z.infer<typeof ExecuteMergeRequest>;

export type LeafHistoryResponseType = z.infer<typeof LeafHistoryResponse>;
export type RestoreLeafOutputRequestType = z.infer<typeof RestoreLeafOutputRequest>;

export type BatchLeafConfigType = z.infer<typeof BatchLeafConfig>;
export type BatchGenerateRequestType = z.infer<typeof BatchGenerateRequest>;
export type BatchLeafResultType = z.infer<typeof BatchLeafResult>;
export type BatchGenerateResponseType = z.infer<typeof BatchGenerateResponse>;

// ═══════════════════════════════════════════════════════════════════════════
// Draft V3 API (Workbench)
// ═══════════════════════════════════════════════════════════════════════════

export const DraftNodeOriginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('extracted'),
    segment_id: z.string(),
  }),
  z.object({ type: z.literal('selected') }),
  z.object({ type: z.literal('manual') }),
]);

export const DraftNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: DraftNodeOriginSchema,
  source: z
    .object({
      conversation_id: z.string(),
      conversation_title: z.string().optional(),
      turn_hash: z.string(),
      role: z.string(),
      start_char: z.number(),
      end_char: z.number(),
    })
    .optional(),
  position: z.number().int().min(0),
  included: z.boolean(),
});

export const DraftConstraintSchema = z.object({
  id: z.string(),
  type: z.enum(['require', 'exclude']),
  match_mode: z.enum(['exact', 'semantic']),
  value: z.string().min(1).max(5000),
  reason: z.string().max(2000).optional(),
});

// POST /v1/drafts
export const CreateDraftRequest = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1).max(500),
  goal: z.string().max(2000).optional(),
  parent_commit_hash: z.string().optional(),
  target_branch: z.string().optional(),
  preview_type: z.string().optional(),
});

// PATCH /v1/drafts/:id
export const UpdateDraftRequest = z.object({
  title: z.string().min(1).max(500).optional(),
  goal: z.string().max(2000).optional(),
  nodes: z.array(DraftNodeSchema).optional(),
  constraints: z.array(DraftConstraintSchema).optional(),
  instructions: z.string().max(5000).optional(),
  preview_type: z.string().optional(),
  target_branch: z.string().optional(),
  if_revision: z.number().int().min(1),
  // LLM extraction fields
  semantic_points: z.array(z.lazy(() => SemanticPointSchema)).optional(),
  extraction_mode: z.enum(['deterministic', 'llm']).optional(),
  extraction_cursor: z.lazy(() => ExtractionCursorSchema).optional(),
});

// Response
export const DraftResponse = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  goal: z.string().nullable(),
  parent_commit_hash: z.string().nullable(),
  forked_from: z.string().nullable(),
  nodes: z.array(DraftNodeSchema),
  constraints: z.array(DraftConstraintSchema),
  instructions: z.string().nullable(),
  preview_type: z.string().nullable(),
  preview_output: z.string().nullable(),
  preview_generated_at: z.string().nullable(),
  status: z.enum(['editing', 'committed', 'abandoned', 'auto']),
  committed_as: z.string().nullable(),
  committed_leaf_id: z.string().nullable(),
  target_branch: z.string().nullable(),
  revision: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  // LLM extraction fields
  extraction_mode: z.enum(['deterministic', 'llm']).nullable().optional(),
  semantic_points: z
    .array(z.lazy(() => SemanticPointSchema))
    .nullable()
    .optional(),
  extraction_cursor: z
    .lazy(() => ExtractionCursorSchema)
    .nullable()
    .optional(),
});

// POST /v1/drafts/:id/preview
export const PreviewDraftRequest = z
  .object({
    preview_type: z.string().optional(),
    model: z.enum(['haiku', 'sonnet', 'opus']).optional(),
  })
  .optional();

export const PreviewDraftResponse = SuccessResponse(
  z.object({
    output: z.string(),
    model_used: z.string(),
    token_count: z.number(),
    cached: z.boolean(),
  })
);

// POST /v1/drafts/:id/commit
export const CommitDraftRequest = z.object({
  message: z.string().optional(),
});

export const CommitDraftResponse = SuccessResponse(
  z.object({
    commit: CommitResponse,
    leaf: LeafResponse.nullable(),
    draft_status: z.literal('committed'),
  })
);

// POST /v1/drafts/:id/suggest
export const SuggestDraftRequest = z
  .object({
    limit: z.number().int().min(1).max(50).default(10),
  })
  .optional();

export const SuggestDraftResponse = SuccessResponse(
  z.object({
    suggestions: z.array(
      z.object({
        node_id: z.string(),
        text: z.string(),
        commit_hash: z.string(),
        similarity: z.number(),
        already_in_draft: z.boolean(),
      })
    ),
  })
);

// POST /v1/drafts/:id/fork
export const ForkDraftResponse = SuccessResponse(DraftResponse);

// ═══════════════════════════════════════════════════════════════════════════
// Incremental Extraction Contracts
// ═══════════════════════════════════════════════════════════════════════════

export const LocatedEvidenceSchema = z.object({
  conversation_id: z.string(),
  turn_hash: z.string(),
  quoted_text: z.string(),
  start_char: z.number().int(),
  end_char: z.number().int(),
  match_score: z.number(),
  role: z.enum(['primary', 'supporting']),
  relevance: z.string(),
  enabled: z.boolean(),
});

export const SemanticPointSchema = z.object({
  id: z.string(),
  text: z.string(),
  extraction_mode: z.enum(['deterministic', 'llm_extracted', 'manual']),
  inference_type: z.enum(['direct', 'paraphrase', 'cross_turn', 'implicit']).optional(),
  status: z.enum(['inherited', 'auto_landed', 'reviewed', 'modified', 'reinforced', 'undone']),
  zone: z.enum(['ready', 'review']),
  routing_reason: z.string().optional(),
  inherited_from: z.string().optional(),
  evidence: z.array(LocatedEvidenceSchema),
  low_coverage: z.boolean().optional(),
  position: z.number().int(),
  staged: z.boolean(),
});

export const ExtractionCursorSchema = z.object({
  cursors: z.record(
    z.string(),
    z.object({
      last_processed_turn: z.string(),
      processed_at: z.string(),
    })
  ),
});

export const ExtractionStatsSchema = z.object({
  total_turns: z.number(),
  new_turns: z.number(),
  proposals: z.number(),
  auto_landed: z.number(),
  needs_review: z.number(),
  rejected: z.number(),
});

// POST /v1/extract/incremental
export const IncrementalExtractRequest = z.object({
  project_id: z.string().min(1),
  conversation_id: z.string().min(1),
  draft_id: z.string().min(1),
});

export const IncrementalExtractResponse = SuccessResponse(
  z.object({
    ready_points: z.array(SemanticPointSchema),
    review_points: z.array(SemanticPointSchema),
    cursor: ExtractionCursorSchema,
    stats: ExtractionStatsSchema,
  })
);

// POST /v1/drafts/:id/review-action
export const ReviewActionRequest = z.object({
  sp_id: z.string().min(1),
  action: z.enum(['accept', 'accept_change', 'dismiss', 'undo', 'edit']),
  edited_text: z.string().optional(),
});

export const ReviewActionResponse = SuccessResponse(
  z.object({
    semantic_points: z.array(SemanticPointSchema),
  })
);

// Type exports
export type CreateDraftRequestType = z.infer<typeof CreateDraftRequest>;
export type UpdateDraftRequestType = z.infer<typeof UpdateDraftRequest>;
export type DraftResponseType = z.infer<typeof DraftResponse>;
