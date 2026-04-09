import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock() factories run BEFORE top-level `const` declarations due to
// Vitest's hoisting. Use vi.hoisted to move spy creation above the mocks.
const { mockVerify, joinSpy, leaveSpy, getPresenceSpy, touchSpy, findApiKeySpy } = vi.hoisted(
  () => {
    return {
      mockVerify: vi.fn(),
      joinSpy: vi.fn(),
      leaveSpy: vi.fn(),
      getPresenceSpy: vi.fn(() => []),
      touchSpy: vi.fn(() => Promise.resolve()),
      findApiKeySpy: vi.fn(),
    };
  }
);

// Mock auth verification BEFORE importing the route.
vi.mock('../middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../middleware/auth')>('../middleware/auth');
  return {
    ...actual,
    verifyBearerToken: mockVerify,
  };
});

// Mock db so the route never touches a real database.
vi.mock('../lib/db', () => ({
  getDB: vi.fn(async () => ({}) as never),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock room-manager so we can assert join/leave calls without a real socket.
vi.mock('../lib/room-manager', () => ({
  roomManager: {
    join: joinSpy,
    leave: leaveSpy,
    getRoomSize: vi.fn(() => 0),
    getPresence: getPresenceSpy,
  },
}));

// Mock @t3x-dev/storage — both ws.ts (for touchLastUsed fire-and-forget)
// and authMiddleware (for the createApp() integration test below) dynamically
// import from this module.
vi.mock('@t3x-dev/storage', () => ({
  touchLastUsed: touchSpy,
  findApiKeyByValue: findApiKeySpy,
}));

import { createWsRoute } from '../routes/ws';

/**
 * Test helper: build a fake `upgradeWebSocket` that captures the handlers
 * returned by the route's `createCtx` callback.
 *
 * NOTE: We would love to use status 101 here (it's what a real WS upgrade
 * returns), but Node's undici rejects `new Response(null, { status: 101 })`
 * with a RangeError ("init[\"status\"] must be in the range of 200 to 599").
 * Use 200 as a sentinel to signal "the fake upgrade handler was invoked"
 * — tests verify pre-upgrade validation passed through to the upgrade
 * middleware.
 */
// biome-ignore lint/suspicious/noExplicitAny: test helper needs flexibility
type UpgradeHandlers = any;

function makeFakeUpgrade() {
  let capturedHandlers: UpgradeHandlers = null;
  // biome-ignore lint/suspicious/noExplicitAny: test helper needs flexibility
  const fakeUpgrade = vi.fn((createCtx: any) => {
    capturedHandlers = createCtx({} as never);
    return async () => new Response(null, { status: 200, headers: { 'x-upgrade': '1' } });
  });
  return {
    fakeUpgrade,
    getHandlers: () => capturedHandlers,
  };
}

describe('ws route — query parameter validation', () => {
  beforeEach(() => {
    joinSpy.mockClear();
    leaveSpy.mockClear();
    getPresenceSpy.mockClear();
    touchSpy.mockClear();
    mockVerify.mockReset();
  });

  it('rejects with 400 when neither conversation_id nor project_id is provided', async () => {
    process.env.AUTH_DISABLED = 'true';
    const { fakeUpgrade } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request('http://localhost/ws?user_id=u1');
    const res = await route.fetch(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('accepts a conversation_id without a token when AUTH_DISABLED=true', async () => {
    process.env.AUTH_DISABLED = 'true';
    const { fakeUpgrade } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request('http://localhost/ws?conversation_id=conv_x&user_id=u1');
    const res = await route.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-upgrade')).toBe('1');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token is missing and AUTH_DISABLED is unset', async () => {
    delete process.env.AUTH_DISABLED;
    const { fakeUpgrade } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request('http://localhost/ws?conversation_id=conv_x&user_id=u1');
    const res = await route.fetch(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Missing token');
  });

  it('verifies the token and rejects with 401 on invalid', async () => {
    delete process.env.AUTH_DISABLED;
    mockVerify.mockResolvedValue(null);
    const { fakeUpgrade } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request(
      'http://localhost/ws?conversation_id=conv_x&user_id=u1&token=bad_token'
    );
    const res = await route.fetch(req);
    expect(res.status).toBe(401);
    expect(mockVerify).toHaveBeenCalled();
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid token');
  });

  it('passes through to upgrade handler on valid token', async () => {
    delete process.env.AUTH_DISABLED;
    mockVerify.mockResolvedValue({ userId: 'u1', projectId: null, keyId: 'k_abc' });
    const { fakeUpgrade } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request(
      'http://localhost/ws?conversation_id=conv_x&user_id=u1&token=good_token'
    );
    const res = await route.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-upgrade')).toBe('1');
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), 'good_token');
    // touchLastUsed is fire-and-forget — it may resolve on a microtask.
    // We don't assert it was awaited, just that it was called.
    await Promise.resolve();
    expect(touchSpy).toHaveBeenCalledWith(expect.anything(), 'k_abc');
  });
});

describe('ws route — multi-room join/leave', () => {
  beforeEach(() => {
    joinSpy.mockClear();
    leaveSpy.mockClear();
    getPresenceSpy.mockClear();
    touchSpy.mockClear();
    mockVerify.mockReset();
    process.env.AUTH_DISABLED = 'true';
  });

  it('onOpen joins both conv: and project: rooms when both IDs are provided', async () => {
    const { fakeUpgrade, getHandlers } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request(
      'http://localhost/ws?conversation_id=conv_x&project_id=proj_y&user_id=u1'
    );
    const res = await route.fetch(req);
    expect(res.status).toBe(200);

    // Simulate the WS handshake: trigger the onOpen callback.
    const handlers = getHandlers();
    expect(handlers).not.toBeNull();
    const fakeWs = { send: vi.fn() };
    handlers.onOpen({} as never, fakeWs as never);

    // Both rooms should have been joined.
    expect(joinSpy).toHaveBeenCalledTimes(2);
    const firstCall = joinSpy.mock.calls[0];
    const secondCall = joinSpy.mock.calls[1];
    expect(firstCall[0]).toBe('conv:conv_x');
    expect(secondCall[0]).toBe('project:proj_y');
    // Same connection object joined both rooms.
    expect(firstCall[1].userId).toBe('u1');
    expect(firstCall[1].id).toBe(secondCall[1].id);
    expect(firstCall[1].id).toMatch(/^c_/);
    // Initial presence snapshot should use the first (conv:) room.
    expect(getPresenceSpy).toHaveBeenCalledWith('conv:conv_x');
  });

  it('onClose leaves both rooms with the same connection id captured at open time', async () => {
    const { fakeUpgrade, getHandlers } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request(
      'http://localhost/ws?conversation_id=conv_x&project_id=proj_y&user_id=u1'
    );
    const res = await route.fetch(req);
    expect(res.status).toBe(200);

    const handlers = getHandlers();
    const fakeWs = { send: vi.fn() };
    handlers.onOpen({} as never, fakeWs as never);

    // Capture the connection id that was used on join so we can match it on leave.
    const connectionId = joinSpy.mock.calls[0][1].id;
    expect(connectionId).toMatch(/^c_/);

    handlers.onClose();

    expect(leaveSpy).toHaveBeenCalledTimes(2);
    expect(leaveSpy).toHaveBeenNthCalledWith(1, 'conv:conv_x', connectionId);
    expect(leaveSpy).toHaveBeenNthCalledWith(2, 'project:proj_y', connectionId);
  });

  it('onError also mirrors the multi-room leave', async () => {
    const { fakeUpgrade, getHandlers } = makeFakeUpgrade();
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request(
      'http://localhost/ws?conversation_id=conv_x&project_id=proj_y&user_id=u1'
    );
    await route.fetch(req);

    const handlers = getHandlers();
    const fakeWs = { send: vi.fn() };
    handlers.onOpen({} as never, fakeWs as never);
    const connectionId = joinSpy.mock.calls[0][1].id;

    handlers.onError();

    expect(leaveSpy).toHaveBeenCalledTimes(2);
    expect(leaveSpy).toHaveBeenNthCalledWith(1, 'conv:conv_x', connectionId);
    expect(leaveSpy).toHaveBeenNthCalledWith(2, 'project:proj_y', connectionId);
  });
});

/**
 * Integration: verify the route is actually reachable through `createApp()`.
 *
 * This is the guard against the C-1 regression discovered in T5 review:
 * `authMiddleware` was installed globally on `*` and did not whitelist `/ws`,
 * so browsers (which cannot set an Authorization header on the WS handshake)
 * were being 401'd by `authMiddleware` BEFORE reaching the route's own
 * `?token=` query-string check. All the unit tests above passed because they
 * constructed `createWsRoute` in isolation and never went through the real
 * middleware chain.
 *
 * This describe block drives a real `createApp()` request and asserts that
 * the 401 body comes from the ROUTE (`createError('UNAUTHORIZED', 'Missing
 * token')` / `'Invalid token'`) and not from `authMiddleware`'s
 * `'Missing Authorization header. Use: Authorization: Bearer <api_key>'`.
 */
describe('ws route — createApp() integration (C-1 regression)', () => {
  const originalEnv = process.env.AUTH_DISABLED;

  beforeEach(() => {
    findApiKeySpy.mockReset();
    touchSpy.mockClear();
    mockVerify.mockReset();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AUTH_DISABLED = originalEnv;
    } else {
      delete process.env.AUTH_DISABLED;
    }
  });

  it('returns 401 "Missing token" from the route (not "Missing Authorization header" from authMiddleware)', async () => {
    delete process.env.AUTH_DISABLED;
    // The route calls verifyBearerToken which dynamically imports
    // findApiKeyByValue — not reached in this test because token is absent.

    const { createApp } = await import('../app');
    const { app } = createApp({ skipLocalAuth: true });

    const res = await app.request('/ws?conversation_id=conv_x');
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    // CRITICAL: this must be 'Missing token' (from ws.ts) not 'Missing
    // Authorization header...' (from authMiddleware). If this fails, it
    // means /ws is no longer whitelisted and the route is dead code again.
    expect(body.error.message).toBe('Missing token');
  });

  it('returns 401 "Invalid token" from the route when the token is rejected by verifyBearerToken', async () => {
    delete process.env.AUTH_DISABLED;
    // verifyBearerToken is mocked at module level — it returns null for bad tokens.
    mockVerify.mockResolvedValue(null);

    const { createApp } = await import('../app');
    const { app } = createApp({ skipLocalAuth: true });

    const res = await app.request('/ws?conversation_id=conv_x&token=bad_token');
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid token');
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), 'bad_token');
  });
});
