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

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Common Schemas
// ═══════════════════════════════════════════════════════════════════════════

const SuccessResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

const ErrorResponse = z.object({
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
    })
    .optional(),
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
export const CreateCommitV4Request = z.object({
  parents: z.array(z.string()).default([]),
  author: z.object({
    type: z.enum(['human', 'agent']),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  sentences: z.array(SentenceSchema).min(1),
  project_id: z.string(),
  message: z.string().optional(),
  branch: z.string().optional(),
  source_refs: z
    .array(
      z.object({
        type: z.enum(['conversation', 'leaf']),
        id: z.string(),
        title: z.string().optional(),
        assertion_lessons: z.array(z.string()).optional(),
      })
    )
    .optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
});

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

const LeafTypeEnum = z.enum([
  'deploy_agent',
  'tweet',
  'weibo',
  'wechat',
  'email',
  'article',
  'slack',
  'eval',
]);

// POST /v1/leaves
export const CreateLeafRequest = z.object({
  commit_hash: z.string(),
  type: LeafTypeEnum,
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
  type: LeafTypeEnum,
  title: z.string().nullable(),
  constraints: z.array(ConstraintSchema),
  config: z.record(z.unknown()),
  output: z.string().nullable(),
  generated_at: z.string().nullable(),
  assertions: z.array(AssertionSchema).nullable(),
  project_id: z.string(),
  created_at: z.string(),
  created_by: z.string().nullable(),
});

export const CreateLeafResponse = SuccessResponse(LeafResponse);
export const GetLeafResponse = SuccessResponse(LeafResponse);
export const ListLeavesResponse = SuccessResponse(z.array(LeafResponse));

// PATCH /v1/leaves/:id
export const UpdateLeafRequest = z.object({
  title: z.string().optional(),
  constraints: z.array(ConstraintSchema).optional(),
  config: z
    .object({
      prompt_template: z.string().optional(),
      model: z.string().optional(),
      max_tokens: z.number().optional(),
    })
    .passthrough()
    .optional(),
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
  })
);

// POST /v1/leaves/:id/validate
export const ValidateLeafOutputRequest = z
  .object({
    // Future: custom validation options
  })
  .optional();

export const ValidateLeafOutputResponse = SuccessResponse(
  z.object({
    assertions: z.array(AssertionSchema),
    passed_count: z.number(),
    failed_count: z.number(),
    total_count: z.number(),
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

export const UpdateConversationContextResponse = SuccessResponse(
  ConversationContextResponse
);

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
export type UpdatePinAssertionsRequestType = z.infer<
  typeof UpdatePinAssertionsRequest
>;

export type UpdateConversationContextRequestType = z.infer<
  typeof UpdateConversationContextRequest
>;
export type ConversationContextResponseType = z.infer<
  typeof ConversationContextResponse
>;
