import { NAMESPACE_ACTIONS, PROJECT_ACTIONS } from '@t3x-dev/application';
import { describe, expect, it } from 'vitest';
import routePolicy from '../../route-policy.json';
import { resolveProjectRouteAction } from '../lib/route-action-policy';

describe('explicit route action policy', () => {
  it('assigns every project-protected route one explicit action', () => {
    const projectRoutes = routePolicy.routes.filter((route) => route.policy === 'project');

    expect(projectRoutes.length).toBeGreaterThan(0);
    expect(
      projectRoutes.filter(
        (route) => !PROJECT_ACTIONS.includes(route.action as (typeof PROJECT_ACTIONS)[number])
      )
    ).toEqual([]);
  });

  it('pins sensitive project routes to their narrow actions', () => {
    const actionFor = (method: string, path: string) =>
      routePolicy.routes.find((route) => route.method === method && route.path === path)?.action;

    expect(actionFor('DELETE', '/v1/projects/{id}')).toBe('project:delete');
    expect(actionFor('POST', '/v1/projects/{id}/restore')).toBe('project:restore');
    expect(actionFor('PUT', '/v1/projects/{id}/visibility')).toBe('project:visibility:manage');
    expect(actionFor('PUT', '/v1/projects/{id}/guests')).toBe('project:guests:manage');
    expect(actionFor('POST', '/v1/projects/{id}/transfer')).toBe('project:transfer');
    expect(actionFor('POST', '/v1/api-keys')).toBe('project:edit');
    expect(actionFor('POST', '/v1/diff/two-way')).toBe('project:read');
    expect(actionFor('GET', '/v1/notifications')).toBe('project:read');
    expect(actionFor('POST', '/v1/notifications/{id}/read')).toBe('project:edit');
    expect(actionFor('POST', '/v1/usage')).toBe('project:edit');
  });

  it('pins namespace collaboration routes to explicit actions', () => {
    const namespaceRoutes = routePolicy.routes.filter((route) =>
      route.path.startsWith('/v1/namespaces/{id}/')
    );

    expect(namespaceRoutes.length).toBeGreaterThan(0);
    expect(
      namespaceRoutes.filter(
        (route) => !NAMESPACE_ACTIONS.includes(route.action as (typeof NAMESPACE_ACTIONS)[number])
      )
    ).toEqual([]);
  });

  it('resolves concrete HTTP paths from the declared templates', () => {
    expect(resolveProjectRouteAction('GET', '/v1/projects/proj_1/workspaces/ws_1')).toBe(
      'project:read'
    );
    expect(
      resolveProjectRouteAction('POST', '/api/v1/projects/proj_1/workspaces/ws_1/commit')
    ).toBe('project:edit');
    expect(resolveProjectRouteAction('DELETE', '/v1/projects/proj_1')).toBe('project:delete');
    expect(resolveProjectRouteAction('POST', '/v1/projects/proj_1/restore')).toBe(
      'project:restore'
    );
    expect(resolveProjectRouteAction('GET', '/v1/projects/proj_1/branches')).toBe('project:read');
    expect(resolveProjectRouteAction('POST', '/v1/diff/two-way')).toBe('project:read');
  });

  it('fails closed when a project route has no declared action', () => {
    expect(() => resolveProjectRouteAction('POST', '/v1/projects/proj_1/unmapped')).toThrow(
      'No explicit project action'
    );
  });
});
