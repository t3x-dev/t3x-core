/**
 * T3X V4 API Contracts
 *
 * This defines the API request/response schemas for V4 architecture.
 * All implementations must conform to these contracts.
 *
 * Naming convention:
 * - API JSON: snake_case
 * - TypeScript: camelCase
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

import { ALL_LEAF_TYPES, LEAF_TYPES } from '@t3x/core';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Common Schemas
// ═══════════════════════════════════════════════════════════════════════════

const SuccessResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

const _ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// Sentence Schema
// ═══════════════════════════════════════════════════════════════════════════

export const SentenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  source_ref: z
    .object({
      conversation_id: z.string(),
      turn_hash: z.string(),
      start_char: z.number(),
      end_char: z.number(),
    })
    .optional(),
  /**
   * The commit hash where this sentence was originally created.
   * Set when a sentence is inherited from a parent commit.
   * Second-class field: does NOT participate in hash calculation.
   */
  inherited_from: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Constraint Schema
// ═══════════════════════════════════════════════════════════════════════════

export const ConstraintSchema = z.object({
  id: z.string().optional(), // Optional on create, required on response
  type: z.enum(['require', 'exclude']),
  match_mode: z.enum(['exact', 'semantic']),
  value: z.string().min(1),
  description: z.string().optional(),
  source_sentence_id: z.string().optional(),
  reason: z.string().optional(), // For exclude constraints
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
// CommitV4 API
// ═══════════════════════════════════════════════════════════════════════════

// POST /v1/commits-v4
// Use passthrough() to preserve unknown fields for V3/invalid field detection
//
// V4 Validation Rules:
// 1. If `schema` provided, must be 't3x/commit/v4'
// 2. `sentences` required and must be non-empty array
// 3. `author` required with type ('human' | 'agent')
// 4. `constraints` NOT allowed at commit level (use Leaves instead)
// 5. V3 fields (turn_window, facet_snapshot) NOT allowed
export const CreateCommitV4Request = z
  .object({
    // Required fields
    author: z
      .object({
        type: z.enum(['human', 'agent']),
        id: z.string().optional(),
        name: z.string().optional(),
      })
      .describe('Author information. type is required.'),
    sentences: z
      .array(SentenceSchema)
      .min(1, 'At least one sentence is required')
      .describe('Array of sentences (knowledge units). Must not be empty.'),
    project_id: z.string().min(1, 'project_id is required'),

    // Optional fields
    parents: z
      .array(z.string())
      .default([])
      .describe('Parent commit hashes (empty for root commit)'),
    message: z.string().optional().describe('Human-readable commit message'),
    branch: z.string().optional().describe('Branch name (defaults to main)'),
    source_refs: z
      .array(
        z.object({
          type: z.enum(['conversation', 'leaf']),
          id: z.string(),
          title: z.string().optional(),
          assertion_lessons: z.array(z.string()).optional(),
        })
      )
      .optional()
      .describe('References to source conversations or leaves'),
    position_x: z.number().optional().describe('Canvas X position'),
    position_y: z.number().optional().describe('Canvas Y position'),

    // Inheritance control
    inherit_parent_sentences: z
      .boolean()
      .default(true)
      .describe(
        'If true (default), automatically inherit all sentences from parent commits. ' +
          'Inherited sentences will have inherited_from set to their original commit hash. ' +
          'New sentences with the same text will override inherited ones.'
      ),

    // V3/V4 detection fields (for validation error handling)
    schema: z.string().optional().describe('If provided, must be t3x/commit/v4'),
    turn_window: z.unknown().optional().describe('V3 field - not allowed in V4'),
    facet_snapshot: z.unknown().optional().describe('V3 field - not allowed in V4'),
    constraints: z.unknown().optional().describe('Not allowed at commit level - use Leaves'),
    content: z
      .object({
        constraints: z.unknown().optional(),
      })
      .passthrough()
      .optional()
      .describe('V3 content structure - constraints not allowed'),
  })
  .passthrough();

export const CommitV4Response = z.object({
  hash: z.string(),
  schema: z.literal('t3x/commit/v4'),
  parents: z.array(z.string()),
  author: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  committed_at: z.string(),
  content: z.object({
    sentences: z.array(SentenceSchema),
  }),
  project_id: z.string().nullable(),
  message: z.string().nullable(),
  branch: z.string().nullable(),
  source_refs: z
    .array(
      z.object({
        type: z.enum(['conversation', 'leaf']),
        id: z.string(),
        title: z.string().optional(),
        assertion_lessons: z.array(z.string()).optional(),
      })
    )
    .nullable(),
  position_x: z.number().nullable(),
  position_y: z.number().nullable(),
  created_at: z.string(),
});

export const CreateCommitV4Response = SuccessResponse(CommitV4Response);
export const GetCommitV4Response = SuccessResponse(CommitV4Response);
export const ListCommitsV4Response = SuccessResponse(z.array(CommitV4Response));

// ═══════════════════════════════════════════════════════════════════════════
// Leaves API
// ═══════════════════════════════════════════════════════════════════════════

// Use LEAF_TYPES from @t3x/core as single source of truth
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
  config: z.record(z.unknown()),
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
    // Future: additional generation options
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

// LeafConfig schema (matches LeafConfig type from @t3x/core)
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
// Type Exports (for use in route handlers)
// ═══════════════════════════════════════════════════════════════════════════

export type CreateCommitV4RequestType = z.infer<typeof CreateCommitV4Request>;
export type CommitV4ResponseType = z.infer<typeof CommitV4Response>;

export type CreateLeafRequestType = z.infer<typeof CreateLeafRequest>;
export type UpdateLeafRequestType = z.infer<typeof UpdateLeafRequest>;
export type LeafResponseType = z.infer<typeof LeafResponse>;

export type CreatePinRequestType = z.infer<typeof CreatePinRequest>;
export type PinResponseType = z.infer<typeof PinResponse>;
export type UpdatePinAssertionsRequestType = z.infer<typeof UpdatePinAssertionsRequest>;

export type UpdateConversationContextRequestType = z.infer<typeof UpdateConversationContextRequest>;
export type ConversationContextResponseType = z.infer<typeof ConversationContextResponse>;

// ═══════════════════════════════════════════════════════════════════════════
// Merge V4 API
// ═══════════════════════════════════════════════════════════════════════════

const WordDiffSegmentSchema = z.object({
  type: z.enum(['equal', 'insert', 'delete']),
  text: z.string(),
});

const MergeV4SimilarPairSchema = z.object({
  source: SentenceSchema,
  target: SentenceSchema,
  word_diff: z.array(WordDiffSegmentSchema),
  resolution: z.enum(['source', 'target']).optional(),
});

const MergeV4CandidateSchema = z.object({
  sentence: SentenceSchema,
  keep: z.boolean(),
});

export const MergeV4ResultSchema = z.object({
  identical: z.array(SentenceSchema),
  similar_pairs: z.array(MergeV4SimilarPairSchema),
  only_in_source: z.array(MergeV4CandidateSchema),
  only_in_target: z.array(MergeV4CandidateSchema),
});

// POST /v1/merge-v4/prepare
export const PrepareMergeV4Request = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
});

export const PrepareMergeV4Response = SuccessResponse(MergeV4ResultSchema);

// POST /v1/merge-v4/execute
export const ExecuteMergeV4Request = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
  prepared: MergeV4ResultSchema,
  message: z.string().min(1),
  branch: z.string().optional(),
  project_id: z.string().min(1),
});

export const ExecuteMergeV4Response = SuccessResponse(CommitV4Response);

// Type exports
export type MergeV4ResultType = z.infer<typeof MergeV4ResultSchema>;
export type PrepareMergeV4RequestType = z.infer<typeof PrepareMergeV4Request>;
export type ExecuteMergeV4RequestType = z.infer<typeof ExecuteMergeV4Request>;

export type LeafHistoryResponseType = z.infer<typeof LeafHistoryResponse>;
export type RestoreLeafOutputRequestType = z.infer<typeof RestoreLeafOutputRequest>;

export type BatchLeafConfigType = z.infer<typeof BatchLeafConfig>;
export type BatchGenerateRequestType = z.infer<typeof BatchGenerateRequest>;
export type BatchLeafResultType = z.infer<typeof BatchLeafResult>;
export type BatchGenerateResponseType = z.infer<typeof BatchGenerateResponse>;
