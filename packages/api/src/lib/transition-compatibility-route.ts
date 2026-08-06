import { createMiddleware } from 'hono/factory';
import { pinoLogger } from '../middleware/logger';

/**
 * Observes an older task-oriented route while its canonical replacement is
 * still being proven. Retirement headers belong only after parity, caller
 * migration, and a supported removal window have been agreed.
 */
export function observeTransitionCompatibilityRoute(routeId: string) {
  return createMiddleware(async (c, next) => {
    pinoLogger.info(
      {
        event: 'compatibility_route.called',
        compatibility_route: routeId,
        req_id: c.get('requestId') as string | undefined,
        method: c.req.method,
        path: c.req.path,
      },
      'Compatibility API route called'
    );

    await next();
  });
}
