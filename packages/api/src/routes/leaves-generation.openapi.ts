import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { retiredLeafResponses, retiredLeafWriter } from '../lib/leaf-retirement';

export const leavesGenerationRoutes = new OpenAPIHono();

const generateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/generate',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesGenerationRoutes.openapi(generateLeafRoute, retiredLeafWriter);

const validateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/validate',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesGenerationRoutes.openapi(validateLeafRoute, retiredLeafWriter);

const batchGenerateRoute = createRoute({
  method: 'post',
  path: '/v1/commits/{hash}/leaves/batch',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesGenerationRoutes.openapi(batchGenerateRoute, retiredLeafWriter);
