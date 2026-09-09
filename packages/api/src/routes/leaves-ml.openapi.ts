import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { retiredLeafResponses, retiredLeafWriter } from '../lib/leaf-retirement';

export const leavesMLRoutes = new OpenAPIHono();

const suggestConstraintsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/suggest-constraints',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesMLRoutes.openapi(suggestConstraintsRoute, retiredLeafWriter);

const learnFromEditsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/learn-from-edits',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesMLRoutes.openapi(learnFromEditsRoute, retiredLeafWriter);

const reverseLearnRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/reverse-learn',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesMLRoutes.openapi(reverseLearnRoute, retiredLeafWriter);

const compareModelsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/compare',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});
leavesMLRoutes.openapi(compareModelsRoute, retiredLeafWriter);
