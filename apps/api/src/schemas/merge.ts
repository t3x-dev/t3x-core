/**
 * Merge Schemas for API validation and OpenAPI spec
 *
 * Schemas for two-way merge operations
 */
import { z } from '@hono/zod-openapi';

// ============================================================================
// Base Schemas
// ============================================================================

/**
 * Sentence schema
 * Matches @t3x/core Sentence type from commit-v3.ts
 */
export const SentenceSchema = z.object({
  id: z.string().openapi({
    description: 'Unique sentence identifier',
    example: 's1',
  }),
  text: z.string().openapi({
    description: 'Sentence text content',
    example: 'Budget is $3000',
  }),
  confidence: z.number().min(0).max(1).optional().openapi({
    description: 'Confidence score (0-1), optional',
    example: 1,
  }),
  source: z.object({
    turn_hash: z.string().openapi({
      description: 'Source turn hash',
      example: 'sha256:abc123...',
    }),
    start_char: z.number().openapi({
      description: 'Start character position in turn',
      example: 0,
    }),
    end_char: z.number().openapi({
      description: 'End character position in turn',
      example: 17,
    }),
  }).openapi({
    description: 'Source reference for the sentence',
  }),
});

/**
 * Constraint schema
 * Matches @t3x/core Constraint type (RequireConstraint | ExcludeConstraint)
 */
export const ConstraintSchema = z.object({
  id: z.string().openapi({
    description: 'Constraint identifier',
    example: 'c1',
  }),
  type: z.enum(['require', 'exclude']).openapi({
    description: 'Constraint type',
    example: 'require',
  }),
  value: z.string().openapi({
    description: 'Constraint value',
    example: 'React',
  }),
  match: z.enum(['exact', 'semantic']).openapi({
    description: 'Match type',
    example: 'exact',
  }),
  source_sentence_id: z.string().optional().openapi({
    description: 'Source sentence ID (for require constraints)',
    example: 's1',
  }),
  suggested: z.boolean().optional().openapi({
    description: 'Whether this is a suggested constraint (for require)',
    example: false,
  }),
  reason: z.string().optional().openapi({
    description: 'Reason for exclusion (for exclude constraints)',
    example: 'Outdated information',
  }),
});

/**
 * Word diff element schema
 * Matches @t3x/core WordDiffSegment type
 */
export const WordDiffSchema = z.object({
  type: z.enum(['unchanged', 'removed', 'added']).openapi({
    description: 'Type of diff element',
    example: 'unchanged',
  }),
  text: z.string().openapi({
    description: 'Word or phrase',
    example: 'Budget is',
  }),
});

/**
 * Similar pair schema (for merge preparation)
 */
export const SimilarPairSchema = z.object({
  source: SentenceSchema.openapi({
    description: 'Source sentence',
  }),
  target: SentenceSchema.openapi({
    description: 'Target sentence',
  }),
  wordDiff: z.array(WordDiffSchema).openapi({
    description: 'Word-level differences between source and target',
  }),
  resolution: z.enum(['source', 'target']).optional().openapi({
    description: 'User resolution choice (required for execute)',
    example: 'source',
  }),
  sourceConstraints: z.array(ConstraintSchema).openapi({
    description: 'Constraints from source sentence',
  }),
  targetConstraints: z.array(ConstraintSchema).openapi({
    description: 'Constraints from target sentence',
  }),
});

/**
 * Only-in-source/target candidate schema
 */
export const CandidateSchema = z.object({
  sentence: SentenceSchema.openapi({
    description: 'The candidate sentence',
  }),
  constraints: z.array(ConstraintSchema).openapi({
    description: 'Associated constraints',
  }),
  keep: z.boolean().openapi({
    description: 'Whether to keep this sentence in merge (required for execute)',
    example: true,
  }),
});

/**
 * Merge2WayResult schema (output of prepare, input of execute)
 */
export const Merge2WayResultSchema = z.object({
  identical: z.array(SentenceSchema).openapi({
    description: 'Sentences that are identical in both commits',
  }),
  similarPairs: z.array(SimilarPairSchema).openapi({
    description: 'Pairs of similar sentences requiring user resolution',
  }),
  onlyInSource: z.array(CandidateSchema).openapi({
    description: 'Sentences only present in source commit',
  }),
  onlyInTarget: z.array(CandidateSchema).openapi({
    description: 'Sentences only present in target commit',
  }),
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
  prepared: Merge2WayResultSchema.openapi({
    description: 'Merge preparation result with all resolutions filled in',
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
 * Commit content schema
 */
export const CommitContentSchema = z.object({
  sentences: z.array(SentenceSchema).openapi({
    description: 'Sentences in the commit',
  }),
  constraints: z.array(ConstraintSchema).optional().openapi({
    description: 'Constraints in the commit',
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
  schema: z.literal('commit/v3').openapi({
    description: 'Commit schema version',
  }),
  parents: z.array(z.string()).openapi({
    description: 'Parent commit hashes [source, target]',
    example: ['sha256:abc123...', 'sha256:def456...'],
  }),
  author: CommitAuthorSchema.openapi({
    description: 'Commit author',
  }),
  committed_at: z.string().openapi({
    description: 'Commit timestamp (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
  }),
  content: CommitContentSchema.openapi({
    description: 'Commit content (merged sentences and constraints)',
  }),
  message: z.string().openapi({
    description: 'Commit message',
    example: 'Merge feature-branch into main',
  }),
  branch: z.string().optional().openapi({
    description: 'Branch name',
    example: 'main',
  }),
});

/**
 * Prepare merge response data schema
 */
export const PrepareMergeResponseSchema = Merge2WayResultSchema;

/**
 * Execute merge response data schema
 */
export const ExecuteMergeResponseSchema = MergeCommitSchema;
