/**
 * YOps — Zod Validation Schemas
 *
 * Strict schemas for all 13 operations plus the document wrapper.
 * Descriptions on each op serve as the instruction set for agents:
 * they flow into JSON Schema (MCP, OpenAPI) automatically via z.toJSONSchema().
 */

import { z } from 'zod';
import { RelationTypeSchema, SlotValueSchema } from '../semantic/schema';
import { SNAKE_CASE_KEY } from './types';

const SNAKE_CASE = SNAKE_CASE_KEY;

// ── Per-Operation Schemas ──

const SetOpSchema = z
  .object({
    set: z
      .object({
        path: z
          .string()
          .min(1)
          .describe('Node path + slot key separated by / (e.g. trip/budget, trip/dining/cuisine)'),
        value: SlotValueSchema.describe(
          'The value — string, number, boolean, array, or nested object'
        ),
        source: z
          .string()
          .min(1)
          .describe('Verbatim key phrase from the conversation that contains this fact'),
        from: z.string().min(1).describe('Turn reference where the info appears (e.g. T3)'),
        confidence: z.number().min(0).max(1).optional().describe('Extraction confidence 0-1'),
      })
      .strict()
      .describe(
        'Set or update a slot value on an existing node. Use when a fact is stated or changed in conversation.'
      ),
  })
  .strict();

const UnsetOpSchema = z
  .object({
    unset: z
      .object({
        path: z.string().min(1).describe('Node path + slot key to remove (e.g. trip/budget)'),
      })
      .strict()
      .describe('Remove a slot from a node. Use when a fact is retracted or no longer relevant.'),
  })
  .strict();

const AddOpSchema = z
  .object({
    add: z
      .object({
        parent: z.string().describe('Parent node path, or empty string "" for root level'),
        node: z
          .record(z.string(), z.unknown())
          .refine((n) => Object.keys(n).length === 1, {
            message: 'node must have exactly one top-level key',
          })
          .describe('New node as {key: {slot: value, ...}} — one top-level key'),
        source: z
          .record(z.string(), z.string())
          .describe('Per-slot source quotes from the conversation'),
        from: z.string().min(1).describe('Turn reference (e.g. T1)'),
        confidence: z.number().min(0).max(1).optional().describe('Extraction confidence 0-1'),
      })
      .strict()
      .describe(
        'Create a new node with initial slots. Use when a new topic or subtopic is introduced.'
      ),
  })
  .strict();

const DropOpSchema = z
  .object({
    drop: z
      .object({
        path: z.string().min(1).describe('Node path to remove — removes all children too'),
        reason: z.string().optional().describe('Why the node is being removed'),
      })
      .strict()
      .describe(
        'Remove a node and all its children. Use when a topic is deleted or contradicted entirely.'
      ),
  })
  .strict();

const RenameOpSchema = z
  .object({
    rename: z
      .object({
        path: z.string().min(1).describe('Current node path'),
        to: z.string().regex(SNAKE_CASE).describe('New key name (snake_case)'),
      })
      .strict()
      .describe('Change a node key name. Use when the name is wrong or needs a better label.'),
  })
  .strict();

const CloneOpSchema = z
  .object({
    clone: z
      .object({
        path: z.string().min(1).describe('Node path to duplicate'),
        to: z.string().describe('Target parent path — empty string "" for root level'),
      })
      .strict()
      .describe('Duplicate a node for variant exploration.'),
  })
  .strict();

const MoveOpSchema = z
  .object({
    move: z
      .object({
        path: z.string().min(1).describe('Source node path'),
        to: z
          .string()
          .min(1)
          .describe('Full target path including new key (e.g. trip/hotel moves hotel under trip)'),
      })
      .strict()
      .describe('Move a node to a different parent. Use when a node is under the wrong parent.'),
  })
  .strict();

const NestOpSchema = z
  .object({
    nest: z
      .object({
        paths: z.array(z.string().min(1)).min(1).describe('Paths of sibling nodes to group'),
        under: z.string().regex(SNAKE_CASE).describe('Key name for the new wrapper node'),
      })
      .strict()
      .describe(
        'Group sibling nodes under a new wrapper node. Use when related siblings should be organized together.'
      ),
  })
  .strict();

const SplitOpSchema = z
  .object({
    split: z
      .object({
        path: z.string().min(1).describe('Node path to split'),
        into: z
          .record(z.string().regex(SNAKE_CASE), z.array(z.string().min(1)).min(1))
          .describe('Map of new child key → list of slot names to move there'),
      })
      .strict()
      .describe(
        'Break a node slots into child nodes. Use when a node has too many slots covering different sub-topics.'
      ),
  })
  .strict();

const FoldOpSchema = z
  .object({
    fold: z
      .object({
        path: z.string().min(1).describe('Path of the wrapper node to remove'),
      })
      .strict()
      .describe(
        'Remove a wrapper node, promote its only child. Use when a node has exactly 1 child and no slots.'
      ),
  })
  .strict();

const MergeOpSchema = z
  .object({
    merge: z
      .object({
        paths: z.array(z.string().min(1)).min(2).describe('Paths of sibling nodes to combine'),
        into: z.string().regex(SNAKE_CASE).describe('Key name for the merged result'),
      })
      .strict()
      .describe(
        'Combine sibling nodes into one. Use when siblings overlap or should be consolidated.'
      ),
  })
  .strict();

const RelateOpSchema = z
  .object({
    relate: z
      .object({
        from: z.string().min(1).describe('Source node path'),
        to: z.string().min(1).describe('Target node path'),
        type: RelationTypeSchema.describe(
          'Relation type: causes, conditions, contrasts, follows, depends'
        ),
        confidence: z.number().min(0).max(1).optional().describe('Relation confidence 0-1'),
      })
      .strict()
      .describe(
        'Add a semantic relation between two nodes. Use when nodes have a causal, conditional, or dependency relationship.'
      ),
  })
  .strict();

const UnrelateOpSchema = z
  .object({
    unrelate: z
      .object({
        from: z.string().min(1).describe('Source node path'),
        to: z.string().min(1).describe('Target node path'),
        type: RelationTypeSchema.describe('Relation type to remove'),
      })
      .strict()
      .describe('Remove a semantic relation between two nodes.'),
  })
  .strict();

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

export const YOpsDocumentSchema = z
  .object({
    yops: z.array(YOpSchema).min(1),
  })
  .strict();
