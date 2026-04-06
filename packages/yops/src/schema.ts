/**
 * @yops-dev/core — Zod Schema Validation
 *
 * Provides Zod schemas for all 18 YOp types and a validateOps() helper.
 */

import { z } from 'zod';

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

// ── DDL ──

const DefineOpSchema = z.object({ define: z.object({ path: z.string().min(1) }).strict() }).strict();
const DropOpSchema = z.object({ drop: z.object({ path: z.string().min(1) }).strict() }).strict();
const RenameOpSchema = z
  .object({ rename: z.object({ path: z.string().min(1), to: z.string().min(1) }).strict() })
  .strict();

// ── DML ──

const SetOpSchema = z
  .object({ set: z.object({ path: z.string().min(1), value: YValueSchema }).strict() })
  .strict();
const UnsetOpSchema = z.object({ unset: z.object({ path: z.string().min(1) }).strict() }).strict();
const PopulateOpSchema = z
  .object({
    populate: z.object({ path: z.string().min(1), values: z.record(z.string(), YValueSchema) }).strict(),
  })
  .strict();
const AppendOpSchema = z
  .object({ append: z.object({ path: z.string().min(1), value: YValueSchema }).strict() })
  .strict();

// ── DTL ──

const MoveOpSchema = z
  .object({ move: z.object({ from: z.string().min(1), to: z.string().min(1) }).strict() })
  .strict();
const CloneOpSchema = z
  .object({ clone: z.object({ from: z.string().min(1), to: z.string().min(1) }).strict() })
  .strict();
const NestOpSchema = z
  .object({
    nest: z
      .object({ path: z.string().min(1), keys: z.array(z.string()), under: z.string().min(1) })
      .strict(),
  })
  .strict();
const SplitOpSchema = z
  .object({
    split: z.object({ path: z.string().min(1), into: z.record(z.string(), z.array(z.string())) }).strict(),
  })
  .strict();
const FoldOpSchema = z.object({ fold: z.object({ path: z.string().min(1) }).strict() }).strict();
const MergeOpSchema = z
  .object({
    merge: z
      .object({ path: z.string().min(1), keys: z.array(z.string()), into: z.string().min(1) })
      .strict(),
  })
  .strict();
const SortOpSchema = z
  .object({
    sort: z
      .object({
        path: z.string().min(1),
        by: z.string().optional(),
        order: z.enum(['asc', 'desc']).optional(),
      })
      .strict(),
  })
  .strict();
const UniqueOpSchema = z
  .object({ unique: z.object({ path: z.string().min(1), by: z.string().optional() }).strict() })
  .strict();
const PickOpSchema = z
  .object({ pick: z.object({ path: z.string().min(1), keys: z.array(z.string()) }).strict() })
  .strict();
const OmitOpSchema = z
  .object({ omit: z.object({ path: z.string().min(1), keys: z.array(z.string()) }).strict() })
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
      .strict(),
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
