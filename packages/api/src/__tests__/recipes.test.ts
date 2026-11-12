import { once } from 'node:events';
import { createServer } from 'node:http';
import { type AnyDB, createRecipe, findRecipeById, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { recipesRoutes } from '../routes/recipes.openapi';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(db)) }));
vi.mock('../lib/ssrf', () => ({ isInternalUrlResolved: vi.fn(async () => false) }));

const webhookStep = {
  action: 'send_webhook' as const,
  config: { url: 'https://example.com/hook' },
};

function recipeRequest(method: string, body: object) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('Recipe webhook target', () => {
  const app = new Hono();
  app.route('/', recipesRoutes);
  let cleanup: () => Promise<void>;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    projectId = (await insertProject(db, { name: 'Recipe target', ownerId: 'recipe_owner' }))
      .projectId;
    otherProjectId = (await insertProject(db, { name: 'Other', ownerId: 'other_owner' })).projectId;
  });
  afterAll(async () => cleanup());

  it('requires a valid URL before creating an enabled webhook recipe', async () => {
    const path = `/v1/projects/${projectId}/recipes`;
    const request = (url?: string, event = 'merge.completed') =>
      app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Notify',
          trigger: { event },
          steps: [{ action: 'send_webhook', config: url ? { url } : {} }],
          enabled: true,
        }),
      });
    expect((await request()).status).toBe(400);
    expect((await request('file:///tmp/target')).status).toBe(400);
    expect((await request('https://example.com/hook', 'commit.created')).status).toBe(400);
    expect((await request('https://example.com/hook')).status).toBe(201);
  });

  it('rejects cross-project recipe IDs and keeps the original recipe intact', async () => {
    const ownerApp = new Hono<{ Variables: { apiKey: object } }>();
    ownerApp.use('*', async (c, next) => {
      c.set('apiKey', { id: 'ak_recipe_owner', user_id: 'recipe_owner', principal_kind: 'human' });
      await next();
    });
    ownerApp.route('/', recipesRoutes);

    const recipe = await createRecipe(db, {
      name: 'Other project recipe',
      projectId: otherProjectId,
      trigger: { event: 'commit.created' },
      steps: [webhookStep],
    });
    const mismatched = `/v1/projects/${projectId}/recipes/${recipe.id}`;
    expect((await ownerApp.request(`/v1/projects/${projectId}/recipes`)).status).toBe(200);
    expect(
      (await ownerApp.request(mismatched, recipeRequest('PATCH', { name: 'Changed' }))).status
    ).toBe(404);
    expect((await ownerApp.request(mismatched, { method: 'DELETE' })).status).toBe(404);
    await expect(findRecipeById(db, recipe.id)).resolves.toEqual(recipe);

    const original = `/v1/projects/${otherProjectId}/recipes/${recipe.id}`;
    expect(
      (await ownerApp.request(original, recipeRequest('PATCH', { name: 'Changed' }))).status
    ).toBe(403);
    expect((await app.request(original, recipeRequest('PATCH', { enabled: false }))).status).toBe(
      200
    );
    await expect(findRecipeById(db, recipe.id)).resolves.toMatchObject({
      enabled: false,
      trigger: { event: 'commit.created' },
    });
    expect((await app.request(original, { method: 'DELETE' })).status).toBe(200);
  });

  it('posts only enabled recipes for the event project to their configured destinations', async () => {
    const events = ['merge.completed', 'check.failed'] as const;
    const activeProject = (await insertProject(db, testData.project())).projectId;
    const received = vi.fn();
    const receiver = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      received(
        request.method,
        request.url,
        request.headers['x-t3x-event'],
        Buffer.concat(chunks).toString()
      );
      response.writeHead(204).end();
    });
    receiver.listen(0, '127.0.0.1');
    await once(receiver, 'listening');
    try {
      const address = receiver.address();
      if (!address || typeof address === 'string') throw new Error('Missing receiver port');
      const target = `http://127.0.0.1:${address.port}`;
      for (const event of events) {
        const recipe = { name: event, projectId: activeProject, trigger: { event } };
        await createRecipe(db, {
          ...recipe,
          steps: [{ ...webhookStep, config: { url: `${target}/${event}` } }],
        });
        const excluded = {
          ...recipe,
          steps: [{ ...webhookStep, config: { url: `${target}/excluded` } }],
        };
        await createRecipe(db, { ...excluded, enabled: false });
        await createRecipe(db, { ...excluded, projectId: otherProjectId });
      }
      for (const event of events) webhookDispatcher.dispatch(event, {}, activeProject);
      await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(events.length));
      for (const event of events) {
        expect(received).toHaveBeenCalledWith(
          'POST',
          `/${event}`,
          event,
          expect.stringContaining(`"project_id":"${activeProject}"`)
        );
      }
    } finally {
      receiver.close();
      await once(receiver, 'close');
    }
  });
});
