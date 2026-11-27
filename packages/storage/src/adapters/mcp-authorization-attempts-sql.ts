import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { attemptFingerprint, attemptIdentity } from '../lib/mcp-attempt-identity';

export async function ensureMcpAuthorizationAttempts(db: postgres.Sql) {
  await db.unsafe(`
    ALTER TABLE repository_agent_delegations ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS mcp_attempt_lookup_keys (
      version INTEGER PRIMARY KEY,
      secret TEXT NOT NULL CHECK (length(secret) = 64)
    );
    CREATE TABLE IF NOT EXISTS mcp_authorization_attempts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','cancelled','token_issued','spent_without_token','closed')),
      user_id TEXT,
      terms_hash TEXT,
      approval_hash TEXT,
      decision_deadline TIMESTAMPTZ,
      code_deadline TIMESTAMPTZ,
      retain_until TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS mcp_attempt_retention ON mcp_authorization_attempts(retain_until) WHERE retain_until IS NOT NULL;
    CREATE INDEX IF NOT EXISTS mcp_attempt_admission ON mcp_authorization_attempts(user_id, decision_deadline) WHERE user_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS mcp_preselections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      claimed_by TEXT REFERENCES mcp_authorization_attempts(id)
    );
    CREATE INDEX IF NOT EXISTS mcp_preselection_owner ON mcp_preselections(user_id, client_id);
    CREATE INDEX IF NOT EXISTS mcp_preselection_expiry ON mcp_preselections(expires_at);
  `);
  await db`INSERT INTO mcp_attempt_lookup_keys(version, secret)
    VALUES (1, ${randomBytes(32).toString('hex')}) ON CONFLICT (version) DO NOTHING`;
  const [key] = await db<
    { secret: string }[]
  >`SELECT secret FROM mcp_attempt_lookup_keys ORDER BY version DESC LIMIT 1`;
  let cursor = '';
  // Leave the original rows available to the token endpoint until their existing deadline.
  for (;;) {
    const receipts = await db<
      {
        code_hash: string;
        clientId: string;
        resource: string;
        redirectUri: string;
        challenge: string;
      }[]
    >`
      SELECT code_hash, client_id AS "clientId", resource, redirect_uri AS "redirectUri", challenge
      FROM mcp_authorization_codes AS code WHERE code_hash > ${cursor}
        AND NOT EXISTS (SELECT 1 FROM mcp_authorization_attempts AS attempt WHERE attempt.id=code.request_hash)
      ORDER BY code_hash LIMIT 500`;
    if (!receipts.length) break;
    const markers = receipts.map((row) => ({
      id: attemptFingerprint(key.secret, attemptIdentity(row, null)),
      status: 'closed',
    }));
    await db`INSERT INTO mcp_authorization_attempts ${db(markers, 'id', 'status')} ON CONFLICT DO NOTHING`;
    cursor = receipts[receipts.length - 1].code_hash;
  }
}
