/**
 * @yops-dev/core — Zod Schema Validation
 *
 * Provides Zod schemas for all 18 YOp types and a validateOps() helper.
 */

import { z } from 'zod';

// ── Source schema (provenance annotation per op) ──

const LLMSourceSchema = z.object({
  type: z.literal('llm'),
  model: z.string().optional(),
  at: z.preprocess((v) => (v instanceof Date ? v.toISOString() : v), z.string()).optional(),
  turn_ref: z.object({
    turn_hash: z.string().min(1),
    quote: z.string().min(1),
  }),
});

const HumanSourceSchema = z.object({
  type: z.literal('human'),
  author: z.string().min(1),
  // Optional UI surface that produced the edit. Forward-only: existing
  // rows without it parse fine. Decouples "who" (author) from "where"
  // (surface) so the Ops card can render "via Tree / via Raw YAML"
  // without inferring surface from author string.
  surface: z.enum(['tree', 'script', 'inline']).optional(),
});

export const SourceSchema = z.discriminatedUnion('type', [LLMSourceSchema, HumanSourceSchema]);

// ── Recursive YValue schema ──

const YValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(YValueSchema),
    z.record(z.string(), YValueSchema),
  ])
);

// ── Helpers ──
// Inner op params keep .strict(); outer wrapper allows source alongside the op key.
const s = SourceSchema.optional();
const PathSchema = z.string().min(1);
const RootablePathSchema = z.string();

// ── DDL ──

const DefineOpSchema = z
  .object({ define: z.object({ path: PathSchema }).strict(), source: s })
  .strict();
const DropOpSchema = z
  .object({ drop: z.object({ path: PathSchema }).strict(), source: s })
  .strict();
const RenameOpSchema = z
  .object({
    rename: z.object({ path: PathSchema, to: z.string().min(1) }).strict(),
    source: s,
  })
  .strict();

// ── DML ──

const SetOpSchema = z
  .object({ set: z.object({ path: PathSchema, value: YValueSchema }).strict(), source: s })
  .strict();
const UnsetOpSchema = z
  .object({ unset: z.object({ path: PathSchema }).strict(), source: s })
  .strict();
const PopulateOpSchema = z
  .object({
    populate: z.object({ path: PathSchema, values: z.record(z.string(), YValueSchema) }).strict(),
    source: s,
  })
  .strict();
const AppendOpSchema = z
  .object({
    append: z.object({ path: PathSchema, value: YValueSchema }).strict(),
    source: s,
  })
  .strict();

// ── DTL ──

const MoveOpSchema = z
  .object({
    move: z.object({ from: PathSchema, to: z.string().min(1) }).strict(),
    source: s,
  })
  .strict();
const CloneOpSchema = z
  .object({
    clone: z.object({ from: PathSchema, to: z.string().min(1) }).strict(),
    source: s,
  })
  .strict();
const NestOpSchema = z
  .object({
    nest: z
      .object({ path: RootablePathSchema, keys: z.array(z.string()), under: z.string().min(1) })
      .strict(),
    source: s,
  })
  .strict();
const SplitOpSchema = z
  .object({
    split: z
      .object({ path: RootablePathSchema, into: z.record(z.string(), z.array(z.string())) })
      .strict(),
    source: s,
  })
  .strict();
const FoldOpSchema = z
  .object({ fold: z.object({ path: PathSchema }).strict(), source: s })
  .strict();
const MergeOpSchema = z
  .object({
    merge: z
      .object({ path: RootablePathSchema, keys: z.array(z.string()), into: z.string().min(1) })
      .strict(),
    source: s,
  })
  .strict();
const SortOpSchema = z
  .object({
    sort: z
      .object({
        path: PathSchema,
        by: z.string().optional(),
        order: z.enum(['asc', 'desc']).optional(),
      })
      .strict(),
    source: s,
  })
  .strict();
const UniqueOpSchema = z
  .object({
    unique: z.object({ path: PathSchema, by: z.string().optional() }).strict(),
    source: s,
  })
  .strict();
const PickOpSchema = z
  .object({
    pick: z.object({ path: RootablePathSchema, keys: z.array(z.string()) }).strict(),
    source: s,
  })
  .strict();
const OmitOpSchema = z
  .object({
    omit: z.object({ path: RootablePathSchema, keys: z.array(z.string()) }).strict(),
    source: s,
  })
  .strict();

// ── DCL ──

const AssertOpSchema = z
  .object({
    assert: z
      .object({
        path: z.string().min(1),
        equals: YValueSchema.optional(),
        exists: z.boolean().optional(),
        type: z.enum(['mapping', 'sequence', 'scalar']).optional(),
      })
      .refine(
        (value) =>
          value.equals !== undefined || value.exists !== undefined || value.type !== undefined,
        {
          message: 'assert: at least one of equals, exists, or type must be provided',
        }
      )
      .strict(),
    source: s,
  })
  .strict();

// ── Union of all 18 ops ──

export const YOpSchema = z.union([
  DefineOpSchema,
  DropOpSchema,
  RenameOpSchema,
  SetOpSchema,
  UnsetOpSchema,
  PopulateOpSchema,
  AppendOpSchema,
  MoveOpSchema,
  CloneOpSchema,
  NestOpSchema,
  SplitOpSchema,
  FoldOpSchema,
  MergeOpSchema,
  SortOpSchema,
  UniqueOpSchema,
  PickOpSchema,
  OmitOpSchema,
  AssertOpSchema,
]);

// ── Validation helper ──

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ message: string; op_index: number }>;
}

export function validateOps(ops: unknown[]): ValidationResult {
  const errors: Array<{ message: string; op_index: number }> = [];

  for (let i = 0; i < ops.length; i++) {
    const result = YOpSchema.safeParse(ops[i]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ message: issue.message, op_index: i });
      }
    }
  }

  if (errors.length === 0) {
    return { valid: true };
  }
  return { valid: false, errors };
}
