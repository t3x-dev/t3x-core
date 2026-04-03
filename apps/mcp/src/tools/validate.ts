/**
 * t3x_validate MCP Tool
 *
 * Validates semantic content against the T3X schema.
 * Returns validation errors and integrity warnings.
 * Local only — no API call, no auth needed.
 */

import {
  checkRelationSanity,
  type SemanticContent,
  SemanticContentSchema,
  validateIntegrity,
} from '@t3x-dev/core';

export const validateTool = {
  name: 't3x_validate',
  description:
    'Validate semantic content against the T3X schema. Returns validation errors and integrity warnings. Local only, no API needed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'object',
        description: 'SemanticContent object to validate',
      },
      schema_only: {
        type: 'boolean',
        description: 'Only check structural validation, skip semantic checks',
      },
    },
    required: ['content'],
  },
};

/**
 * Count total nodes in a tree recursively
 */
function countNodes(tree: { children: unknown[] }): number {
  let count = 1;
  for (const child of tree.children) {
    count += countNodes(child as { children: unknown[] });
  }
  return count;
}

export async function handleValidate(args: Record<string, unknown>) {
  const content = args.content;
  const schemaOnly = args.schema_only === true;

  // 1. Schema validation
  const parseResult = SemanticContentSchema.safeParse(content);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map((e) => ({
      type: 'schema_error',
      message: e.message,
      location: e.path.join('.'),
    }));
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ valid: false, errors }, null, 2),
        },
      ],
    };
  }

  const data = parseResult.data as SemanticContent;

  // 2. Count statistics
  const treeCount = data.trees.length;
  const nodeCount = data.trees.reduce((sum, tree) => sum + countNodes(tree), 0);
  const relationCount = data.relations.length;

  // 3. Semantic validation (unless schema_only)
  let errors: unknown[] = [];
  let warnings: unknown[] = [];

  if (!schemaOnly) {
    const integrityResult = validateIntegrity(data);
    errors = integrityResult.errors;
    warnings = integrityResult.warnings;

    const sanityWarnings = checkRelationSanity(data);
    warnings = [...warnings, ...sanityWarnings];
  }

  const result = {
    valid: errors.length === 0,
    tree_count: treeCount,
    node_count: nodeCount,
    relation_count: relationCount,
    errors,
    warnings,
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
