import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createWorkspaceSourceTransitionRoutes } from '../routes/workspace-source-transition.openapi';

describe('exact-source Workspace Transition route boundary', () => {
  const app = new Hono();
  app.route('/', createWorkspaceSourceTransitionRoutes());

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
});
