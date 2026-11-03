import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type SessionRecord, sessions } from '../schema-trees';

const SESSION_ID_PREFIX = 'sess_';

export type SessionAuthMethod = 'local_password';

export interface WebSession {
  id: string;
  token_hash: string;
  user_id: string;
  auth_method: SessionAuthMethod;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface CreateSessionInput {
  rawToken: string;
  userId: string;
  authMethod: SessionAuthMethod;
  userAgent?: string | null;
  createdAt?: Date;
  expiresAt: Date;
}

function generateSessionId(): string {
  return `${SESSION_ID_PREFIX}${randomUUID().replace(/-/g, '')}`;
}

function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function rowToSession(row: SessionRecord): WebSession {
  return {
    id: row.id,
    token_hash: row.tokenHash,
    user_id: row.userId,
    auth_method: row.authMethod as SessionAuthMethod,
    user_agent: row.userAgent ?? null,
    created_at: row.createdAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    expires_at: row.expiresAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
  };
}

export async function createSession(db: AnyDB, input: CreateSessionInput): Promise<WebSession> {
  const createdAt = input.createdAt ?? new Date();
  if (input.expiresAt <= createdAt) {
    throw new TypeError('Session expiry must be later than creation time');
  }

  const [row] = await db
    .insert(sessions)
    .values({
      id: generateSessionId(),
      tokenHash: hashSessionToken(input.rawToken),
      userId: input.userId,
      authMethod: input.authMethod,
      userAgent: input.userAgent ?? null,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
    })
    .returning();

  return rowToSession(row);
}

export async function findActiveSessionByToken(
  db: AnyDB,
  rawToken: string,
  now = new Date()
): Promise<WebSession | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(rawToken)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    )
    .limit(1);

  return row ? rowToSession(row) : null;
}

export async function findSessionById(db: AnyDB, id: string): Promise<WebSession | null> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return row ? rowToSession(row) : null;
}

export async function listActiveSessions(
  db: AnyDB,
  userId: string,
  now = new Date()
): Promise<WebSession[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))
    );
  return rows.map(rowToSession);
}

export async function revokeSession(
  db: AnyDB,
  id: string,
  userId: string,
  now = new Date()
): Promise<WebSession | null> {
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning();
  return row ? rowToSession(row) : null;
}

export async function touchSessionLastSeen(db: AnyDB, id: string, now = new Date()): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
}
