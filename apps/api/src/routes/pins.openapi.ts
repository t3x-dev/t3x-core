/**
 * Pins Routes with OpenAPI
 *
 * REST API endpoints for Pin nodes with OpenAPI documentation.
 * Pins mark items as selected for commit sources and conversation context.
 *
 * Endpoints:
 * - POST   /v1/projects/:projectId/pins   - Create a new pin
 * - GET    /v1/projects/:projectId/pins   - List pins by project
 * - GET    /v1/pins/:id                   - Get pin by ID
 * - PATCH  /v1/pins/:id/assertions        - Update selected assertions
 * - DELETE /v1/pins/:id                   - Delete pin
 *
 * @see docs/specification/memory-pin-system-design.md
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Pin } from '@t3x-dev/core';
// Storage functions (provided by @t3x-dev/storage)
import {
  createPin,
  deletePin,
  findPinById,
  findPinsByProject,
  findPinsByType,
  updatePinAssertions,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import { CreatePinRequest, PinResponse, UpdatePinAssertionsRequest } from '../schemas/v4-contracts';

export const pinsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage Pin to API response format
 * Storage returns undefined for optional fields, API uses null
 */
function toApiPin(pin: Pin) {
  return {
    id: pin.id,
    project_id: pin.project_id,
    type: pin.type,
    ref_id: pin.ref_id,
    selected_assertion_ids: pin.selected_assertion_ids ?? null,
    pinned_at: pin.pinned_at,
    pinned_by: pin.pinned_by ?? null,
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/projects/:projectId/pins - Create pin
const createPinRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pins',
  tags: ['Pins'],
  summary: 'Create a new pin',
  description:
    'Creates a new pin to mark an item as selected for commit sources and conversation context.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreatePinRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Pin created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PinResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'Pin already exists (duplicate)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

// GET /v1/projects/:projectId/pins - List pins by project
const listPinsByProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pins',
  tags: ['Pins'],
  summary: 'List pins by project',
  description: 'Lists all pins in a project, optionally filtered by type.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    query: z.object({
      type: z.enum(['conversation', 'leaf']).optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of pins',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(PinResponse)),
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

// GET /v1/pins/:id - Get pin by ID
const getPinRoute = createRoute({
  method: 'get',
  path: '/v1/pins/{id}',
  tags: ['Pins'],
  summary: 'Get pin by ID',
  description: 'Retrieves a pin by its unique ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Pin found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PinResponse),
        },
      },
    },
    404: {
      description: 'Pin not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

// PATCH /v1/pins/:id/assertions - Update selected assertions
const updatePinAssertionsRoute = createRoute({
  method: 'patch',
  path: '/v1/pins/{id}/assertions',
  tags: ['Pins'],
  summary: 'Update selected assertions',
  description: 'Updates the selected assertion IDs for a pin.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdatePinAssertionsRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Pin updated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PinResponse),
        },
      },
    },
    404: {
      description: 'Pin not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

// DELETE /v1/pins/:id - Delete pin
const deletePinRoute = createRoute({
  method: 'delete',
  path: '/v1/pins/{id}',
  tags: ['Pins'],
  summary: 'Delete pin',
  description: 'Deletes a pin by its ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Pin deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              deleted: z.literal(true),
              id: z.string(),
            })
          ),
        },
      },
    },
    404: {
      description: 'Pin not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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
// Route Handlers
// ============================================================

// POST /v1/projects/:projectId/pins - Create pin
pinsRoutes.openapi(createPinRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    const pin = await createPin(db, {
      project_id: projectId,
      type: body.type,
      ref_id: body.ref_id,
      selected_assertion_ids: body.selected_assertion_ids,
    });

    return c.json({ success: true as const, data: toApiPin(pin) }, 201);
  } catch (err) {
    // Handle PostgreSQL unique constraint violation (duplicate pin)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
      return errorResponse(
        c,
        'DUPLICATE_PIN',
        `Pin already exists for this item in project ${projectId}`
      );
    }
    // Handle PostgreSQL foreign key violation (project not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return errorResponse(c, 'PROJECT_NOT_FOUND', 'Project not found');
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/projects/:projectId/pins - List pins by project
pinsRoutes.openapi(listPinsByProjectRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { type, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    // Use findPinsByType when type filter is specified, otherwise findPinsByProject
    const pins = type
      ? await findPinsByType(db, projectId, type, { limit, offset })
      : await findPinsByProject(db, projectId, { limit, offset });

    return c.json({ success: true as const, data: pins.map(toApiPin) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// GET /v1/pins/:id - Get pin by ID
pinsRoutes.openapi(getPinRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const pin = await findPinById(db, id);

    if (!pin) {
      return errorResponse(c, 'PIN_NOT_FOUND', `Pin not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiPin(pin) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// PATCH /v1/pins/:id/assertions - Update selected assertions
pinsRoutes.openapi(updatePinAssertionsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const pin = await updatePinAssertions(db, id, body.selected_assertion_ids);

    if (!pin) {
      return errorResponse(c, 'PIN_NOT_FOUND', `Pin not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiPin(pin) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// DELETE /v1/pins/:id - Delete pin
pinsRoutes.openapi(deletePinRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const deleted = await deletePin(db, id);

    if (!deleted) {
      return errorResponse(c, 'PIN_NOT_FOUND', `Pin not found: ${id}`);
    }

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

export default pinsRoutes;
