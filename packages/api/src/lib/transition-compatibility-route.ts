import { createMiddleware } from 'hono/factory';
import { pinoLogger } from '../middleware/logger';

/**
 * Marks an older task-oriented route whose governance phase is available from
 * the canonical Transition control plane. A Sunset date is intentionally not
 * emitted until a supported removal window has been agreed.
 */
export function transitionCompatibilityRoute(routeId: string) {
  return createMiddleware(async (c, next) => {
    const projectId = c.req.param('projectId');
    const successor = `/v1/projects/${encodeURIComponent(projectId)}/transitions`;

    c.header('Deprecation', 'true');
    c.header('Link', `<${successor}>; rel="successor-version"`);

    pinoLogger.info(
      {
        event: 'compatibility_route.called',
        compatibility_route: routeId,
        successor,
        req_id: c.get('requestId') as string | undefined,
        method: c.req.method,
        path: c.req.path,
      },
      'Compatibility API route called'
    );

    await next();
  });
}
