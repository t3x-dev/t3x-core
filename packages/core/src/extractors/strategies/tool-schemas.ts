/**
 * YOp Tool Definitions
 *
 * Converts the 13 YOp types into LLM ToolDefinition format.
 * Each YOp type becomes one tool the LLM can call during extraction.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../llm/types';
import { zodToJsonSchema } from '../../llm/zodToJsonSchema';
import { RelationTypeSchema } from '../../semantic/schema';
import type { YOp } from '../../yops/types';
import { SNAKE_CASE_KEY } from '../../yops/types';

// SlotValueSchema uses z.lazy() which causes infinite recursion in zodToJsonSchema.
// Instead we use z.unknown() for validation (the real YOp executor validates strictly)
// and override the JSON Schema output with a proper non-recursive definition.
const SlotValueInputSchema = z
  .unknown()
  .describe('Slot value: string, number, boolean, array, or nested object');

// ── Inner schemas (without the discriminant wrapper) ──

const SetInputSchema = z
  .object({
    path: z.string().min(1).describe('Existing node path / slot key (e.g. trip/budget)'),
    value: SlotValueInputSchema,
    source: z.string().min(1).describe('Short verbatim phrase from conversation'),
    from: z.string().min(1).describe('Turn reference (e.g. T1, T3)'),
    confidence: z.number().min(0).max(1).optional().describe('Extraction confidence 0-1'),
  })
  .strict();

const UnsetInputSchema = z
  .object({
    path: z.string().min(1).describe('Node path + slot key to remove'),
  })
  .strict();

const AddInputSchema = z
  .object({
    parent: z
      .string()
      .describe(
        'Parent node path. Use empty string "" for root-level nodes. Use "parent_key" to nest under an existing node.',
      ),
    node: z
      .record(z.string(), z.unknown())
      .describe(
        'Object with exactly ONE top-level key: {node_key: {slot: value, ...}}. Example: {hotel: {name: "Hilton", stars: 5}}. Do NOT put multiple keys — call yop_add once per node.',
      ),
    source: z
      .union([z.record(z.string(), z.string()), z.string()])
      .describe(
        'Source quotes. Preferred: object mapping slot keys to quotes, e.g. {name: "called Hilton", stars: "5 stars"}. Also accepts a single string if only one slot.',
      ),
    from: z.string().min(1).describe('Turn reference (e.g. T1, T3)'),
    confidence: z.number().min(0).max(1).optional().describe('Extraction confidence 0-1'),
  })
  .strict();

const DropInputSchema = z
  .object({
    path: z.string().min(1).describe('Node path to remove — removes all children too'),
    reason: z.string().optional().describe('Why the node is being removed'),
  })
  .strict();

const RenameInputSchema = z
  .object({
    path: z.string().min(1).describe('Current node path'),
    to: z.string().regex(SNAKE_CASE_KEY).describe('New key name (snake_case)'),
  })
  .strict();

const CloneInputSchema = z
  .object({
    path: z.string().min(1).describe('Node path to duplicate'),
    to: z.string().describe('Target parent path — empty string for root'),
  })
  .strict();

const MoveInputSchema = z
  .object({
    path: z.string().min(1).describe('Source node path'),
    to: z.string().min(1).describe('New full path: parent/key'),
  })
  .strict();

const NestInputSchema = z
  .object({
    paths: z.array(z.string().min(1)).min(1).describe('Paths of sibling nodes to group'),
    under: z.string().regex(SNAKE_CASE_KEY).describe('Key name for the new wrapper node'),
  })
  .strict();

const SplitInputSchema = z
  .object({
    path: z.string().min(1).describe('Node path to split'),
    into: z
      .record(z.string().regex(SNAKE_CASE_KEY), z.array(z.string().min(1)).min(1))
      .describe('{child_key: [slot_names]}'),
  })
  .strict();

const FoldInputSchema = z
  .object({
    path: z.string().min(1).describe('Path of the wrapper node to remove'),
  })
  .strict();

const MergeInputSchema = z
  .object({
    paths: z.array(z.string().min(1)).min(2).describe('Paths of sibling nodes to combine'),
    into: z.string().regex(SNAKE_CASE_KEY).describe('Key name for the merged result'),
  })
  .strict();

const RelateInputSchema = z
  .object({
    from: z.string().min(1).describe('Source node path'),
    to: z.string().min(1).describe('Target node path'),
    type: RelationTypeSchema.describe('causes | conditions | contrasts | follows | depends'),
    confidence: z.number().min(0).max(1).optional().describe('Relation confidence 0-1'),
  })
  .strict();

const UnrelateInputSchema = z
  .object({
    from: z.string().min(1).describe('Source node path'),
    to: z.string().min(1).describe('Target node path'),
    type: RelationTypeSchema.describe('Relation type to remove'),
  })
  .strict();

// ── Tool Registry ──

interface ToolEntry {
  name: string;
  description: string;
  schema: z.ZodType;
  wrap: (input: unknown) => YOp;
}

const TOOL_REGISTRY: ToolEntry[] = [
  {
    name: 'yop_set',
    description:
      'Set or update a slot value on an existing node. Use when a fact is stated or changed.',
    schema: SetInputSchema,
    wrap: (input) => ({ set: input }) as YOp,
  },
  {
    name: 'yop_unset',
    description: 'Remove a slot from a node. Use when a fact is retracted.',
    schema: UnsetInputSchema,
    wrap: (input) => ({ unset: input }) as YOp,
  },
  {
    name: 'yop_add',
    description:
      'Create a new node with initial slots. Use when a new topic is introduced. Call once per node — put exactly ONE key in the node object.',
    schema: AddInputSchema,
    wrap: (input) => {
      const raw = input as Record<string, unknown>;
      // Normalize source: string → Record
      const source =
        typeof raw.source === 'string'
          ? { _: raw.source as string }
          : (raw.source as Record<string, string>);
      return { add: { ...raw, source } } as YOp;
    },
  },
  {
    name: 'yop_drop',
    description: 'Remove a node and all its children. Use when a topic is deleted.',
    schema: DropInputSchema,
    wrap: (input) => ({ drop: input }) as YOp,
  },
  {
    name: 'yop_rename',
    description: 'Change a node key name. Use when the name needs a better label.',
    schema: RenameInputSchema,
    wrap: (input) => ({ rename: input }) as YOp,
  },
  {
    name: 'yop_clone',
    description: 'Duplicate a node under a target parent.',
    schema: CloneInputSchema,
    wrap: (input) => ({ clone: input }) as YOp,
  },
  {
    name: 'yop_move',
    description: 'Move a node to a different parent.',
    schema: MoveInputSchema,
    wrap: (input) => ({ move: input }) as YOp,
  },
  {
    name: 'yop_nest',
    description: 'Group sibling nodes under a new wrapper node.',
    schema: NestInputSchema,
    wrap: (input) => ({ nest: input }) as YOp,
  },
  {
    name: 'yop_split',
    description: 'Break a node into multiple children by distributing its slots.',
    schema: SplitInputSchema,
    wrap: (input) => ({ split: input }) as YOp,
  },
  {
    name: 'yop_fold',
    description: 'Remove a wrapper node, promote its only child.',
    schema: FoldInputSchema,
    wrap: (input) => ({ fold: input }) as YOp,
  },
  {
    name: 'yop_merge',
    description: 'Combine sibling nodes into one.',
    schema: MergeInputSchema,
    wrap: (input) => ({ merge: input }) as YOp,
  },
  {
    name: 'yop_relate',
    description:
      'Add a semantic relation between two nodes (causes, conditions, contrasts, follows, depends).',
    schema: RelateInputSchema,
    wrap: (input) => ({ relate: input }) as YOp,
  },
  {
    name: 'yop_unrelate',
    description: 'Remove a semantic relation between two nodes.',
    schema: UnrelateInputSchema,
    wrap: (input) => ({ unrelate: input }) as YOp,
  },
];

// ── Exports ──

/** 13 ToolDefinition objects, one per YOp type */
export const yopToolDefinitions: ToolDefinition[] = TOOL_REGISTRY.map((entry) => ({
  name: entry.name,
  description: entry.description,
  input_schema: zodToJsonSchema(entry.schema) as Record<string, unknown>,
}));

/** Validate a tool call and convert to YOp(s). May return multiple YOps for multi-key add nodes. */
export function toolCallToYOps(
  toolName: string,
  input: unknown,
): { ok: true; yops: YOp[] } | { ok: false; error: string } {
  const entry = TOOL_REGISTRY.find((e) => e.name === toolName);
  if (!entry) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  const result = entry.schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: `Validation failed for ${toolName}: ${result.error.message}` };
  }

  // Special handling for add: split multi-key nodes into separate add ops
  if (toolName === 'yop_add') {
    const raw = result.data as Record<string, unknown>;
    const node = raw.node as Record<string, unknown>;
    const keys = Object.keys(node);

    if (keys.length > 1) {
      // Normalize source
      const source =
        typeof raw.source === 'string'
          ? ({} as Record<string, string>)
          : ((raw.source ?? {}) as Record<string, string>);

      const yops: YOp[] = keys.map((key) => ({
        add: {
          parent: raw.parent as string,
          node: { [key]: node[key] },
          source,
          from: raw.from as string,
          ...(raw.confidence !== undefined ? { confidence: raw.confidence as number } : {}),
        },
      })) as YOp[];
      return { ok: true, yops };
    }
  }

  return { ok: true, yops: [entry.wrap(result.data)] };
}

/** Validate a tool call and convert to YOp (legacy single-return API) */
export function toolCallToYOp(
  toolName: string,
  input: unknown,
): { ok: true; yop: YOp } | { ok: false; error: string } {
  const result = toolCallToYOps(toolName, input);
  if (!result.ok) return result;
  return { ok: true, yop: result.yops[0] };
}
