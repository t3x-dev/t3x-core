import { Hono } from 'hono';
import { expect, it, vi } from 'vitest';
import {
  markRepositoryReadOutcome,
  repositoryReadTimingMiddleware,
  timeRepositoryRead,
} from '../lib/repository-read-timing';
import { pinoLogger } from '../middleware/logger';

it('records a correlated empty read and keeps failure responses observable', async () => {
  const app = new Hono();
  app.use('*', repositoryReadTimingMiddleware);
  app.get('/api/v1/projects/:projectId/schema-studio/pending/:workspaceId', async (c) => {
    await timeRepositoryRead(c, 'pending_schema', async () => {});
    markRepositoryReadOutcome(c, 'empty');
    return c.json({ data: { status: 'none' } });
  });
  app.get('/api/v1/projects/:projectId', async (c) => {
    await timeRepositoryRead(c, 'project_access', async () => {});
    return c.json({ error: 'Forbidden' }, 403);
  });

  const interactionId = '5015bc74-7b0a-4533-bafc-e1f882543450';
  const headers = { 'x-t3x-interaction-id': interactionId };
  const log = vi.spyOn(pinoLogger, 'info').mockImplementation(() => {});
  try {
    const empty = await app.request('/api/v1/projects/p/schema-studio/pending/workspace', {
      headers,
    });
    expect(empty.headers.get('server-timing')).toContain('pending_schema;dur=');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ interaction_id: interactionId, outcome: 'empty', status: 200 }),
      'repository read timing'
    );

    const rejected = await app.request('/api/v1/projects/p', { headers });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('server-timing')).toBeNull();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        interaction_id: interactionId,
        outcome: 'error',
        status: 403,
        stages_ms: expect.objectContaining({ project_access: expect.any(Number) }),
      }),
      'repository read timing'
    );
  } finally {
    log.mockRestore();
  }
});
