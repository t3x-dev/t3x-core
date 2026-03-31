/**
 * JSON Schema export for T3X semantic types.
 *
 * Uses Zod v4's native z.toJSONSchema() to convert TreeNodeSchema
 * and SemanticContentSchema into standard JSON Schema (draft-2020-12).
 * Recursive types (TreeNode.children, SlotValue) are automatically
 * handled via $ref + $defs.
 */

import { z } from 'zod';
import { SemanticContentSchema, TreeNodeSchema } from './schema';

const JSON_SCHEMA_TARGET = 'draft-2020-12' as const;

export function getTreeNodeJsonSchema() {
  return z.toJSONSchema(TreeNodeSchema, { target: JSON_SCHEMA_TARGET });
}

export function getSemanticContentJsonSchema() {
  return z.toJSONSchema(SemanticContentSchema, { target: JSON_SCHEMA_TARGET });
}
