/**
 * YOps — Zod Validation Schemas
 *
 * Strict schemas for all 13 operations plus the document wrapper.
 */

import { z } from 'zod';
import { RelationTypeSchema, SlotValueSchema } from '../semantic/schema';

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

// ── Per-Operation Schemas ──

const SetOpSchema = z.object({
  set: z.object({
    path: z.string().min(1),
    value: SlotValueSchema,
    source: z.string().min(1),
    from: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
  }).strict(),
}).strict();

const UnsetOpSchema = z.object({
  unset: z.object({
    path: z.string().min(1),
  }).strict(),
}).strict();

const AddOpSchema = z.object({
  add: z.object({
    parent: z.string(),
    node: z.record(z.string(), z.unknown())
      .refine((n) => Object.keys(n).length === 1, {
        message: 'node must have exactly one top-level key',
      }),
    source: z.record(z.string(), z.string()),
    from: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
  }).strict(),
}).strict();

const DropOpSchema = z.object({
  drop: z.object({
    path: z.string().min(1),
    reason: z.string().optional(),
  }).strict(),
}).strict();

const RenameOpSchema = z.object({
  rename: z.object({
    path: z.string().min(1),
    to: z.string().regex(SNAKE_CASE),
  }).strict(),
}).strict();

const CloneOpSchema = z.object({
  clone: z.object({
    path: z.string().min(1),
    to: z.string(),
  }).strict(),
}).strict();

const MoveOpSchema = z.object({
  move: z.object({
    path: z.string().min(1),
    to: z.string().min(1),
  }).strict(),
}).strict();

const NestOpSchema = z.object({
  nest: z.object({
    paths: z.array(z.string().min(1)).min(1),
    under: z.string().regex(SNAKE_CASE),
  }).strict(),
}).strict();

const SplitOpSchema = z.object({
  split: z.object({
    path: z.string().min(1),
    into: z.record(
      z.string().regex(SNAKE_CASE),
      z.array(z.string().min(1)).min(1),
    ),
  }).strict(),
}).strict();

const FoldOpSchema = z.object({
  fold: z.object({
    path: z.string().min(1),
  }).strict(),
}).strict();

const MergeOpSchema = z.object({
  merge: z.object({
    paths: z.array(z.string().min(1)).min(2),
    into: z.string().regex(SNAKE_CASE),
  }).strict(),
}).strict();

const RelateOpSchema = z.object({
  relate: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: RelationTypeSchema,
    confidence: z.number().min(0).max(1).optional(),
  }).strict(),
}).strict();

const UnrelateOpSchema = z.object({
  unrelate: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: RelationTypeSchema,
  }).strict(),
}).strict();

// ── Union Schema ──

export const YOpSchema = z.union([
  SetOpSchema,
  UnsetOpSchema,
  AddOpSchema,
  DropOpSchema,
  RenameOpSchema,
  CloneOpSchema,
  MoveOpSchema,
  NestOpSchema,
  SplitOpSchema,
  FoldOpSchema,
  MergeOpSchema,
  RelateOpSchema,
  UnrelateOpSchema,
]);

// ── Document Schema ──

export const YOpsDocumentSchema = z.object({
  yops: z.array(YOpSchema).min(1),
}).strict();
