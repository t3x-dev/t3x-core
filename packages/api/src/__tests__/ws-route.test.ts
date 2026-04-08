import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock() factories run BEFORE top-level `const` declarations due to
// Vitest's hoisting. Use vi.hoisted to move spy creation above the mocks.
const { mockVerify, joinSpy, leaveSpy } = vi.hoisted(() => {
  return {
    mockVerify: vi.fn(),
    joinSpy: vi.fn(),
    leaveSpy: vi.fn(),
  };
});

// Mock auth verification BEFORE importing the route.
vi.mock('../middleware/auth', () => ({
  verifyBearerToken: mockVerify,
  authMiddleware: vi.fn(), // unused here but referenced by app.ts
}));

// Mock db so the route never touches a real database.
vi.mock('../lib/db', () => ({
  getDB: vi.fn(async () => ({}) as never),
}));

// Mock room-manager so we can assert join/leave calls without a real socket.
vi.mock('../lib/room-manager', () => ({
  roomManager: {
    join: joinSpy,
    leave: leaveSpy,
    getRoomSize: vi.fn(() => 0),
  },
}));

import { createWsRoute } from '../routes/ws';

describe('ws route — query parameter validation', () => {
  beforeEach(() => {
    joinSpy.mockClear();
    leaveSpy.mockClear();
    mockVerify.mockReset();
  });

  it('rejects with 400 when neither conversation_id nor project_id is provided', async () => {
    process.env.AUTH_DISABLED = 'true';
    // NOTE: We would love to use status 101 here (it's what a real WS upgrade
    // returns), but Node's undici rejects `new Response(null, { status: 101 })`
    // with a RangeError ("init[\"status\"] must be in the range of 200 to 599").
    // Use 200 as a sentinel to signal "the fake upgrade handler was invoked"
    // — the test's intent is to verify that the route's pre-upgrade validation
    // passed through to the upgrade middleware.
    const fakeUpgrade = vi.fn(
      () => async () => new Response(null, { status: 200, headers: { 'x-upgrade': '1' } })
    );
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request('http://localhost/ws?user_id=u1');
    const res = await route.fetch(req);
    expect(res.status).toBe(400);
  });

  it('accepts a conversation_id without a token when AUTH_DISABLED=true', async () => {
    process.env.AUTH_DISABLED = 'true';
    // NOTE: We would love to use status 101 here (it's what a real WS upgrade
    // returns), but Node's undici rejects `new Response(null, { status: 101 })`
    // with a RangeError ("init[\"status\"] must be in the range of 200 to 599").
    // Use 200 as a sentinel to signal "the fake upgrade handler was invoked"
    // — the test's intent is to verify that the route's pre-upgrade validation
    // passed through to the upgrade middleware.
    const fakeUpgrade = vi.fn(
      () => async () => new Response(null, { status: 200, headers: { 'x-upgrade': '1' } })
    );
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request('http://localhost/ws?conversation_id=conv_x&user_id=u1');
    const res = await route.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-upgrade')).toBe('1');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token is missing and AUTH_DISABLED is unset', async () => {
    delete process.env.AUTH_DISABLED;
    // NOTE: We would love to use status 101 here (it's what a real WS upgrade
    // returns), but Node's undici rejects `new Response(null, { status: 101 })`
    // with a RangeError ("init[\"status\"] must be in the range of 200 to 599").
    // Use 200 as a sentinel to signal "the fake upgrade handler was invoked"
    // — the test's intent is to verify that the route's pre-upgrade validation
    // passed through to the upgrade middleware.
    const fakeUpgrade = vi.fn(
      () => async () => new Response(null, { status: 200, headers: { 'x-upgrade': '1' } })
    );
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request('http://localhost/ws?conversation_id=conv_x&user_id=u1');
    const res = await route.fetch(req);
    expect(res.status).toBe(401);
  });

  it('verifies the token and rejects with 401 on invalid', async () => {
    delete process.env.AUTH_DISABLED;
    mockVerify.mockResolvedValue(null);
    // NOTE: We would love to use status 101 here (it's what a real WS upgrade
    // returns), but Node's undici rejects `new Response(null, { status: 101 })`
    // with a RangeError ("init[\"status\"] must be in the range of 200 to 599").
    // Use 200 as a sentinel to signal "the fake upgrade handler was invoked"
    // — the test's intent is to verify that the route's pre-upgrade validation
    // passed through to the upgrade middleware.
    const fakeUpgrade = vi.fn(
      () => async () => new Response(null, { status: 200, headers: { 'x-upgrade': '1' } })
    );
    const route = createWsRoute(fakeUpgrade as never);

    const req = new Request(
      'http://localhost/ws?conversation_id=conv_x&user_id=u1&token=bad_token'
    );
    const res = await route.fetch(req);
    expect(res.status).toBe(401);
    expect(mockVerify).toHaveBeenCalled();
  });
});
