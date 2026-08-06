import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinoLogger } from '../middleware/logger';
import { createWorkspaceSourceTransitionRoutes } from '../routes/workspace-source-transition.openapi';

describe('exact-source Workspace Transition route boundary', () => {
  const app = new Hono();
  app.route('/', createWorkspaceSourceTransitionRoutes());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      '/v1/projects/project/workspaces/workspace/source-transition/review',
      'workspace-source-governance.review',
    ],
    [
      '/v1/projects/project/workspaces/workspace/source-transition/decide',
      'workspace-source-governance.decide',
    ],
    [
      '/v1/projects/project/workspaces/workspace/source-transition/revert/review',
      'workspace-source-governance.revert-review',
    ],
    [
      '/v1/projects/project/workspaces/workspace/source-transition/revert/decide',
      'workspace-source-governance.revert-decide',
    ],
  ])('marks compatibility calls before request validation: %s', async (path, routeId) => {
    const log = vi.spyOn(pinoLogger, 'info').mockImplementation(() => undefined);
    const response = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('Deprecation')).toBe('true');
    expect(response.headers.get('Link')).toBe(
      '</v1/projects/project/transitions>; rel="successor-version"'
    );
    expect(response.headers.has('Sunset')).toBe(false);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'compatibility_route.called',
        compatibility_route: routeId,
        successor: '/v1/projects/project/transitions',
        method: 'POST',
        path,
      }),
      'Compatibility API route called'
    );
  });

  it('rejects client-supplied source bytes, secret values, and authority facts before storage', async () => {
    const response = await app.request(
      '/v1/projects/project/workspaces/workspace/source-transition/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact: {
            format: 't3x.dev/workspace-source-artifact/v1',
            root_path: 'device.yaml',
            resources: [],
          },
          change: {
            mode: 'import',
            root: { material_id: 'material' },
          },
          source: 'attacker-controlled bytes',
          secret_values: { wifi_password: 'attacker-controlled' },
          actor: { kind: 'human', id: 'attacker-controlled' },
          policy: { mode: 'attacker-controlled' },
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });

  it('requires at least one localized operation for an edit request', async () => {
    const response = await app.request(
      '/v1/projects/project/workspaces/workspace/source-transition/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact: {
            format: 't3x.dev/workspace-source-artifact/v1',
            root_path: 'device.yaml',
            resources: [],
          },
          change: { mode: 'edit', operations: [] },
        }),
      }
    );

    expect(response.status).toBe(400);
  });

  it('rejects client-derived revert operations, target State, and authority facts', async () => {
    const response = await app.request(
      '/v1/projects/project/workspaces/workspace/source-transition/revert/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_id: `sha256:${'a'.repeat(64)}`,
          reverse_operations: [
            {
              op: 'replace_scalar',
              path: ['logger', 'level'],
              expect: 'INFO',
              value: 'DEBUG',
            },
          ],
          target_state: { value: 'attacker-controlled' },
          actor: { kind: 'human', id: 'attacker-controlled' },
          policy: { mode: 'attacker-controlled' },
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });
});
