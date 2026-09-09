/** Compatibility response for retired product Leaf generation. */
import { fail, type ToolDef, type ToolHandler } from '../types.js';

export const generateDef: ToolDef = {
  name: 't3x_generate',
  description:
    'Retired Leaf writer. Use exact State/Commit YAML or JSON export and Workspace Delivery. Historical Leaf reads remain available.',
  inputSchema: {
    type: 'object',
    properties: {
      leaf_id: { type: 'string', description: 'Historical Leaf ID (generation is retired).' },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};
export const generateHandler: ToolHandler = async () =>
  fail(
    'LEAF_WRITER_RETIRED: Leaf generation is retired. Export exact YAML/JSON or its render from State or Commit; use Workspace Delivery. Historical Leaf reads remain available.'
  );
