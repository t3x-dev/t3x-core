import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { DeploymentCapabilitiesSchema } from '@t3x-dev/api-client';
import { getDeploymentCapabilities } from '../lib/deployment-capabilities';
import { SuccessResponseSchema } from '../schemas/common';

export const deploymentCapabilitiesRoutes = new OpenAPIHono();

const getDeploymentCapabilitiesRoute = createRoute({
  method: 'get',
  path: '/v1/deployment/capabilities',
  tags: ['Deployment'],
  summary: 'Get public deployment capabilities',
  description: 'Returns only deployment-scoped capabilities; never account entitlements.',
  responses: {
    200: {
      description: 'Deployment capability contract',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DeploymentCapabilitiesSchema),
        },
      },
    },
  },
});

deploymentCapabilitiesRoutes.openapi(getDeploymentCapabilitiesRoute, async (context) => {
  context.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return context.json({
    success: true as const,
    data: await getDeploymentCapabilities(context),
  });
});
