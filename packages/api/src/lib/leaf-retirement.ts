import type { Context } from 'hono';
import { ErrorResponseSchema } from '../schemas/common';

export const LEAF_WRITER_RETIRED_MESSAGE =
  'Leaf creation, generation and mutation are retired. Export exact YAML/JSON or its render from State or Commit; use Workspace Delivery for delivery configuration. Historical Leaf reads and exports remain available.';

export const retiredLeafResponses = {
  410: {
    description: 'Leaf writer retired; historical data is retained',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
} as const;

/** No database or provider work: retained records cannot be mutated by old commands. */
export function retiredLeafWriter(c: Context) {
  return c.json(
    {
      success: false as const,
      error: { code: 'LEAF_WRITER_RETIRED', message: LEAF_WRITER_RETIRED_MESSAGE },
    },
    410
  );
}
