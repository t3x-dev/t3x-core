import { getClient } from '../client.js';

export const applyYopsTool = {
  name: 't3x_apply_yops',
  description:
    "Edit a draft's semantic tree by applying YOps (YAML Operations). " +
    'Prefer updating existing nodes (set/populate) over adding new ones (define).\n\n' +
    '**Workflow:** t3x_show_draft → t3x_apply_yops → t3x_show_draft (verify) → t3x_commit\n\n' +
    '**18 operations in 4 categories:**\n' +
    'DDL (structure): define, drop, rename\n' +
    'DML (values): set, unset, populate, append\n' +
    'DTL (transform): move, clone, nest, split, fold, merge, sort, unique, pick, omit\n' +
    'DCL (constraint): assert\n' +
    'T3X (semantic relations): relate, unrelate\n\n' +
    '**Path syntax:** slash-separated (e.g., `trip/budget`). Keys are snake_case.\n\n' +
    '**Common examples:**\n' +
    '- Update a slot: `{ set: { path: "trip/budget", value: 5000 } }`\n' +
    '- Fill multiple slots: `{ populate: { path: "trip/hotel", values: { type: "ryokan", area: "Asakusa" } } }`\n' +
    '- Create new node: `{ define: { path: "trip/activities" } }`\n' +
    '- Remove a node: `{ drop: { path: "trip/old_plan" } }`\n' +
    '- Remove a slot: `{ unset: { path: "trip/budget/misc" } }`\n\n' +
    'Use t3x_yops_schema for the full JSON Schema. Use t3x_show_draft to get current revision for if_revision.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Draft ID' },
      yops: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of YOps to apply. Use t3x_yops_schema to see the format.',
      },
      if_revision: {
        type: 'number',
        description: 'Current draft revision (for optimistic locking). Get from t3x_show_draft.',
      },
    },
    required: ['draft_id', 'yops', 'if_revision'],
  },
};

export async function handleApplyYops(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.applyYOps(
    args.draft_id as string,
    args.yops as unknown[],
    args.if_revision as number
  );
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
