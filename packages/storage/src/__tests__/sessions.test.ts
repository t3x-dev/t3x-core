import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createSession,
  findActiveSessionByToken,
  findSessionById,
  listActiveSessions,
  revokeSession,
  touchSessionLastSeen,
} from '../queries/sessions';
import { createUser } from '../queries/users';
import { createTestDB } from './setup';

const NOW = new Date('2026-11-02T08:00:00.000Z');
const LATER = new Date('2026-11-02T09:00:00.000Z');
const EXPIRES = new Date('2026-12-02T08:00:00.000Z');

describe('Web Sessions Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let userId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    userId = (await createUser(db, { name: 'Session owner' })).id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('stores only a hash and resolves an active token', async () => {
    const rawToken = 't3xs_active_session_token';
    const created = await createSession(db, {
      rawToken,
      userId,
      authMethod: 'local_password',
      userAgent: 'Test Browser',
      createdAt: NOW,
      expiresAt: EXPIRES,
    });

    expect(created).toMatchObject({
      id: expect.stringMatching(/^sess_/),
      user_id: userId,
      auth_method: 'local_password',
      user_agent: 'Test Browser',
      created_at: NOW.toISOString(),
      last_seen_at: NOW.toISOString(),
      expires_at: EXPIRES.toISOString(),
      revoked_at: null,
    });
    expect(created.token_hash).not.toBe(rawToken);
    expect(created.token_hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(findActiveSessionByToken(db, rawToken, LATER)).resolves.toMatchObject({
      id: created.id,
      user_id: userId,
    });
  });

  it('rejects unknown, expired, and revoked tokens', async () => {
    await expect(findActiveSessionByToken(db, 't3xs_unknown', NOW)).resolves.toBeNull();

    const expiredToken = 't3xs_expired_session_token';
    await createSession(db, {
      rawToken: expiredToken,
      userId,
      authMethod: 'local_password',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      expiresAt: new Date('2026-11-01T08:00:00.000Z'),
    });
    await expect(findActiveSessionByToken(db, expiredToken, NOW)).resolves.toBeNull();

    const revokedToken = 't3xs_revoked_session_token';
    const revoked = await createSession(db, {
      rawToken: revokedToken,
      userId,
      authMethod: 'local_password',
      createdAt: NOW,
      expiresAt: EXPIRES,
    });
    await revokeSession(db, revoked.id, userId, LATER);
    await expect(findActiveSessionByToken(db, revokedToken, LATER)).resolves.toBeNull();
  });

  it('touches last_seen_at without extending expiry', async () => {
    const created = await createSession(db, {
      rawToken: 't3xs_touch_session_token',
      userId,
      authMethod: 'local_password',
      createdAt: NOW,
      expiresAt: EXPIRES,
    });

    await touchSessionLastSeen(db, created.id, LATER);
    const stored = await findSessionById(db, created.id);

    expect(stored?.last_seen_at).toBe(LATER.toISOString());
    expect(stored?.expires_at).toBe(EXPIRES.toISOString());
  });

  it('lists only active sessions owned by the user', async () => {
    const otherUserId = (await createUser(db, { name: 'Other session owner' })).id;
    await createSession(db, {
      rawToken: 't3xs_other_user_session',
      userId: otherUserId,
      authMethod: 'local_password',
      createdAt: NOW,
      expiresAt: EXPIRES,
    });

    const sessions = await listActiveSessions(db, userId, LATER);

    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => session.user_id === userId)).toBe(true);
    expect(sessions.every((session) => session.revoked_at === null)).toBe(true);
    expect(sessions.every((session) => new Date(session.expires_at) > LATER)).toBe(true);
  });

  it('revokes only a session owned by the caller', async () => {
    const created = await createSession(db, {
      rawToken: 't3xs_owned_revoke_session',
      userId,
      authMethod: 'local_password',
      createdAt: NOW,
      expiresAt: EXPIRES,
    });

    await expect(revokeSession(db, created.id, 'user_not_owner', LATER)).resolves.toBeNull();
    await expect(
      findActiveSessionByToken(db, 't3xs_owned_revoke_session', LATER)
    ).resolves.toMatchObject({
      id: created.id,
    });

    await expect(revokeSession(db, created.id, userId, LATER)).resolves.toMatchObject({
      id: created.id,
      revoked_at: LATER.toISOString(),
    });
  });
});
