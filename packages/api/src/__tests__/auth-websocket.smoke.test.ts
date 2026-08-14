import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import type { AnyDB } from '@t3x-dev/storage';
import { createApiKey, createUser, insertConversation, insertProject } from '@t3x-dev/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { setupTestDB } from './setup';

let testDb: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(testDb)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { createApp } from '../app';

const ownerKeyValue = 't3xk_ws_owner_0123456789abcdef';
const otherKeyValue = 't3xk_ws_other_0123456789abcdef';
const agentKeyValue = 't3xk_ws_agent_0123456789abcdef';

describe('authenticated WebSocket boundary smoke', () => {
  const originalAuthDisabled = process.env.AUTH_DISABLED;
  let cleanup: () => Promise<void>;
  let server: ReturnType<typeof serve>;
  let baseUrl: string;
  let ownerProjectId: string;
  let otherProjectId: string;
  let ownerConversationId: string;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = 'false';
    const setup = await setupTestDB();
    testDb = setup.db;
    cleanup = setup.cleanup;

    const owner = await createUser(testDb, {
      email: 'ws-smoke-owner@example.test',
      name: 'WebSocket Smoke Owner',
    });
    const other = await createUser(testDb, {
      email: 'ws-smoke-other@example.test',
      name: 'WebSocket Smoke Other',
    });
    ownerProjectId = (
      await insertProject(testDb, { name: 'WebSocket owner project', ownerId: owner.id })
    ).projectId;
    otherProjectId = (
      await insertProject(testDb, { name: 'WebSocket other project', ownerId: other.id })
    ).projectId;
    ownerConversationId = (
      await insertConversation(testDb, {
        projectId: ownerProjectId,
        title: 'Owner private conversation',
      })
    ).conversationId;

    await createApiKey(testDb, {
      name: 'WebSocket owner key',
      userId: owner.id,
      keyValue: ownerKeyValue,
    });
    await createApiKey(testDb, {
      name: 'WebSocket other key',
      userId: other.id,
      keyValue: otherKeyValue,
    });
    await createApiKey(testDb, {
      name: 'WebSocket project agent key',
      projectId: ownerProjectId,
      principalKind: 'agent',
      keyValue: agentKeyValue,
    });

    const { app, websocket } = createApp({ skipLocalAuth: true });
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0, websocket });
    if (!server.listening) {
      await new Promise<void>((resolve) => server.once('listening', resolve));
    }
    const address = server.address() as AddressInfo | null;
    if (!address) throw new Error('WebSocket smoke server did not bind a TCP address');
    baseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (originalAuthDisabled === undefined) {
      delete process.env.AUTH_DISABLED;
    } else {
      process.env.AUTH_DISABLED = originalAuthDisabled;
    }
    await cleanup();
  });

  beforeEach(() => {
    process.env.AUTH_DISABLED = 'false';
  });

  function socketUrl(params: Record<string, string>) {
    return `${baseUrl}/ws?${new URLSearchParams(params).toString()}`;
  }

  function openAndReadWelcome(params: Record<string, string>) {
    return new Promise<{ socket: WebSocket; message: Record<string, unknown> }>(
      (resolve, reject) => {
        const socket = new WebSocket(socketUrl(params));
        const timeout = setTimeout(() => {
          socket.terminate();
          reject(new Error('Timed out waiting for WebSocket welcome envelope'));
        }, 5_000);

        socket.once('message', (data) => {
          clearTimeout(timeout);
          resolve({ socket, message: JSON.parse(data.toString()) as Record<string, unknown> });
        });
        socket.once('unexpected-response', (_request, response) => {
          clearTimeout(timeout);
          const status = response.statusCode ?? 0;
          response.resume();
          socket.terminate();
          reject(new Error(`Expected WebSocket upgrade, received HTTP ${status}`));
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      }
    );
  }

  function handshakeStatus(params: Record<string, string>) {
    return new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(socketUrl(params));
      let settled = false;
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new Error('Timed out waiting for rejected WebSocket handshake'));
      }, 5_000);

      socket.once('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        reject(new Error('Expected WebSocket handshake to be rejected'));
      });
      socket.once('unexpected-response', (_request, response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const status = response.statusCode ?? 0;
        response.resume();
        socket.terminate();
        resolve(status);
      });
      socket.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  function closeSocket(socket: WebSocket) {
    return new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }

  it('performs a real upgrade and sends the scoped welcome envelope', async () => {
    const { socket, message } = await openAndReadWelcome({
      conversation_id: ownerConversationId,
      project_id: ownerProjectId,
      token: ownerKeyValue,
      user_id: 'browser-owner',
    });

    expect(message).toMatchObject({
      type: 'connected',
      conversationId: ownerConversationId,
      projectId: ownerProjectId,
    });
    await closeSocket(socket);
  });

  it('rejects missing credentials and another user at the HTTP handshake boundary', async () => {
    await expect(handshakeStatus({ project_id: ownerProjectId })).resolves.toBe(401);
    await expect(
      handshakeStatus({ project_id: ownerProjectId, token: otherKeyValue })
    ).resolves.toBe(403);
  });

  it('enforces conversation ownership, pair integrity, and agent project scope', async () => {
    await expect(
      handshakeStatus({
        conversation_id: ownerConversationId,
        token: otherKeyValue,
      })
    ).resolves.toBe(403);
    await expect(
      handshakeStatus({
        conversation_id: ownerConversationId,
        project_id: otherProjectId,
        token: ownerKeyValue,
      })
    ).resolves.toBe(403);
    await expect(
      handshakeStatus({ project_id: otherProjectId, token: agentKeyValue })
    ).resolves.toBe(403);

    const { socket, message } = await openAndReadWelcome({
      project_id: ownerProjectId,
      token: agentKeyValue,
      user_id: 'project-agent',
    });
    expect(message).toMatchObject({ type: 'connected', projectId: ownerProjectId });
    await closeSocket(socket);
  });
});
