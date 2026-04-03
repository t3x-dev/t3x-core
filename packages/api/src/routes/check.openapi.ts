/**
 * Check Route — Integration Layer "Check" Verb
 *
 * Validates text against leaf constraints (require/exclude rules).
 * Returns pass/fail with detailed violation list.
 *
 * Endpoints:
 * - POST /v1/check — Validate text against project constraints
 */

import { createRoute, OpenAPIHono, type z } from '@hono/zod-openapi';
import type { Constraint, Leaf } from '@t3x-dev/core';
import { validateConstraintsExactOnly } from '@t3x-dev/core';
import { findLeavesByProject, getLeavesByIds } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { CheckRequest, CheckResponse, type CheckViolation } from '../schemas/integration-contracts';

export const checkRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definition
// ============================================================

const postCheckRoute = createRoute({
  method: 'post',
  path: '/v1/check',
  tags: ['Integration'],
  summary: 'Validate text against leaf constraints',
  description:
    'Validates text against all leaf constraints for a project. ' +
    'Returns pass/fail with a list of violations. ' +
    'Optionally filter to specific leaves via leaf_ids.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CheckRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Validation result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CheckResponse),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

checkRoutes.openapi(postCheckRoute, async (c) => {
  const { project_id, text, leaf_ids } = c.req.valid('json');

  try {
    const db = await getDB();

    // Fetch leaves: specific IDs or all project leaves
    let leaves: Leaf[];
    if (leaf_ids && leaf_ids.length > 0) {
      leaves = await getLeavesByIds(db, leaf_ids);
      // Filter to only leaves belonging to the requested project
      leaves = leaves.filter((l) => l.project_id === project_id);
    } else {
      leaves = await findLeavesByProject(db, project_id);
    }

    // No leaves = no constraints = pass
    if (leaves.length === 0) {
      return c.json({ success: true as const, data: { passed: true, violations: [] } }, 200);
    }

    // Collect all constraints with their leaf_id for tracing
    const constraintLeafMap = new Map<string, { leaf_id: string; constraint: Constraint }>();
    for (const leaf of leaves) {
      for (const constraint of leaf.constraints ?? []) {
        constraintLeafMap.set(constraint.id, { leaf_id: leaf.id, constraint });
      }
    }

    // Flatten constraints for validation
    const allConstraints = Array.from(constraintLeafMap.values()).map((c) => c.constraint);

    // No constraints across all leaves = pass
    if (allConstraints.length === 0) {
      return c.json({ success: true as const, data: { passed: true, violations: [] } }, 200);
    }

    // Run exact-match validation (semantic constraints will fail with a message)
    const result = validateConstraintsExactOnly(text, allConstraints);

    // Map failed assertions to CheckViolation format
    const violations: z.infer<typeof CheckViolation>[] = [];
    for (const assertion of result.assertions) {
      if (!assertion.passed) {
        const entry = constraintLeafMap.get(assertion.constraint_id);
        if (entry) {
          violations.push({
            leaf_id: entry.leaf_id,
            constraint_id: entry.constraint.id,
            type: entry.constraint.type,
            value: entry.constraint.value,
            reason: entry.constraint.type === 'exclude' ? entry.constraint.reason : undefined,
          });
        }
      }
    }

    const passed = violations.length === 0;

    // Fire webhook on failure
    if (!passed) {
      webhookDispatcher.dispatch(
        'check.failed',
        {
          project_id,
          text_preview: text.slice(0, 200),
          violations,
        },
        project_id
      );
    }

    return c.json({ success: true as const, data: { passed, violations } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CHECK_FAILED', message);
  }
});
