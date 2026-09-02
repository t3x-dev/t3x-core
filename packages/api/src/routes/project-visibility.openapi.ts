import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  changeProjectVisibility,
  type ProjectVisibilityActorKind,
  ProjectVisibilityConflictError,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getProjectAccessPrincipal } from '../lib/project-access';
import {
  allowAllProjectVisibilityPolicy,
  PROJECT_VISIBILITY_POLICY_VERSION,
  type ProjectVisibilityPolicy,
  ProjectVisibilityPolicyDeniedError,
} from '../lib/project-visibility-policy';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import { ProjectSchema, ProjectVisibilitySchema } from '../schemas/projects';

const ChangeProjectVisibilitySchema = z.object({
  expected_visibility: ProjectVisibilitySchema,
  visibility: ProjectVisibilitySchema,
  confirm_publication: z.boolean().default(false),
});

const ChangeProjectVisibilityResponseSchema = z.object({
  project: ProjectSchema,
  changed: z.boolean(),
  evidence_id: z.string().nullable(),
});

const route = createRoute({
  method: 'put',
  path: '/v1/projects/{id}/visibility',
  tags: ['Projects'],
  summary: 'Change project visibility through the canonical publication command',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: ChangeProjectVisibilitySchema } } },
  },
  responses: {
    200: {
      description: 'Visibility transition result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ChangeProjectVisibilityResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid publication request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Visibility authority or policy denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Stale visibility or capacity conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Publication policy rate limited',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Visibility transition failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

function resolveActor(c: Context): { kind: ProjectVisibilityActorKind; id: string } | null {
  const principal = getProjectAccessPrincipal(c);
  if (!principal) {
    return isAuthenticationDisabled() ? { kind: 'local', id: 'auth-disabled' } : null;
  }
  const kind = principal.principalKind ?? 'human';
  const id = kind === 'human' ? principal.userId : principal.keyId;
  return id ? { kind, id } : null;
}

function toApiProject(project: {
  projectId: string;
  name: string;
  visibility: 'private' | 'unlisted' | 'public';
  createdAt: Date;
  metadataJson: string | null;
}) {
  return {
    project_id: project.projectId,
    name: project.name,
    visibility: project.visibility,
    created_at: project.createdAt.toISOString(),
    metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
  };
}

export function createProjectVisibilityRoutes(
  policy: ProjectVisibilityPolicy = allowAllProjectVisibilityPolicy
) {
  const routes = new OpenAPIHono({ defaultHook: zodErrorHook });
  routes.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    if (body.visibility === 'public' && !body.confirm_publication) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        'Public visibility requires explicit publication confirmation'
      );
    }

    const db = await getDB();
    const project = await assertProjectAccess(c, db, id, 'project:visibility:manage');
    if (project instanceof Response) return project;
    if (!project.namespaceId) {
      return errorResponse(c, 'FORBIDDEN', 'Project visibility requires a canonical namespace');
    }
    if (project.visibility !== body.expected_visibility) {
      return errorResponse(c, 'CONFLICT', 'Project visibility changed; refresh and retry');
    }

    const actor = resolveActor(c);
    if (!actor) return errorResponse(c, 'FORBIDDEN', 'A canonical actor is required');

    const mutate = () =>
      changeProjectVisibility(db, {
        projectId: project.projectId,
        namespaceId: project.namespaceId as string,
        expectedVisibility: body.expected_visibility,
        visibility: body.visibility,
        actor,
        publicationConfirmed: body.confirm_publication,
      });

    try {
      const result =
        body.visibility === project.visibility
          ? await mutate()
          : await policy.execute(
              {
                contractVersion: PROJECT_VISIBILITY_POLICY_VERSION,
                projectId: project.projectId,
                namespaceId: project.namespaceId,
                fromVisibility: project.visibility,
                toVisibility: body.visibility,
                actor,
                publicationConfirmed: body.confirm_publication,
              },
              mutate
            );
      if (!result) return errorResponse(c, 'NOT_FOUND', `Project ${id} not found`);
      return c.json(
        {
          success: true as const,
          data: {
            project: toApiProject(result.project),
            changed: result.event !== null,
            evidence_id: result.event?.eventId ?? null,
          },
        },
        200
      );
    } catch (error) {
      if (error instanceof ProjectVisibilityPolicyDeniedError) {
        return c.json(
          { success: false as const, error: { code: error.code, message: error.message } },
          error.status
        );
      }
      if (error instanceof ProjectVisibilityConflictError) {
        return errorResponse(c, 'CONFLICT', 'Project visibility changed; refresh and retry');
      }
      const message = error instanceof Error ? error.message : 'Unknown visibility error';
      return errorResponse(c, 'UPDATE_FAILED', message);
    }
  });
  return routes;
}

export const projectVisibilityRoutes = createProjectVisibilityRoutes();
