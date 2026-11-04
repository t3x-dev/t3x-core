import { PROJECT_ACTIONS, type ProjectAction } from '@t3x-dev/application';
import routePolicy from '../../route-policy.json';

function isProjectAction(value: unknown): value is ProjectAction {
  return typeof value === 'string' && PROJECT_ACTIONS.includes(value as ProjectAction);
}

function normalizedPath(path: string): string {
  const pathname = path.split('?', 1)[0] || '/';
  const withoutApiPrefix = pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
  return withoutApiPrefix.length > 1 ? withoutApiPrefix.replace(/\/$/, '') : withoutApiPrefix;
}

function routePattern(template: string): RegExp {
  const pattern = normalizedPath(template)
    .split('/')
    .map((segment) => {
      if (/^\{[^}]+\}$/.test(segment) || /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment)) {
        return '[^/]+';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${pattern}$`);
}

const PROJECT_ROUTE_ACTIONS = routePolicy.routes
  .filter((route): route is typeof route & { action: ProjectAction } =>
    isProjectAction(route.action)
  )
  .map((route) => ({
    method: route.method,
    action: route.action,
    pattern: routePattern(route.path),
    specificity: route.path.split('/').filter((part) => part && !/[{:]/.test(part)).length,
  }))
  .sort((left, right) => right.specificity - left.specificity);

/** Find one project action from the checked route inventory. */
export function findProjectRouteAction(method: string, path: string): ProjectAction | null {
  const normalizedMethod = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const normalized = normalizedPath(path);
  const nested = normalized.match(/^\/v1\/projects\/[^/]+(\/.+)$/);
  const candidates = nested ? [normalized, `/v1${nested[1]}`] : [normalized];
  const match = candidates
    .map((candidate) =>
      PROJECT_ROUTE_ACTIONS.find(
        (route) => route.method === normalizedMethod && route.pattern.test(candidate)
      )
    )
    .find(Boolean);
  return match?.action ?? null;
}

/** Resolve one project action from the checked route inventory. Missing metadata fails closed. */
export function resolveProjectRouteAction(method: string, path: string): ProjectAction {
  const action = findProjectRouteAction(method, path);
  if (action) return action;
  throw new Error(`No explicit project action for ${method.toUpperCase()} ${normalizedPath(path)}`);
}
