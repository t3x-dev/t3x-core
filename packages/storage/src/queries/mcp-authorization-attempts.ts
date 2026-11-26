import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  attemptFingerprint,
  attemptIdentity,
  type McpAttemptIdentity,
} from '../lib/mcp-attempt-identity';

type AttemptState = 'pending' | 'approved' | 'cancelled' | 'token_issued' | 'spent_without_token';
export type McpAuthorizationAttempt =
  | { status: AttemptState | 'expired' | 'code_expired'; id: string; approvalHash: string | null }
  | { status: 'unavailable' | 'conflict' | 'limited' | 'closed' | 'missing' };
export type { McpAttemptIdentity };

// Bounded opportunistic cleanup retains only the permanent replay marker.
async function compactAttempts(db: AnyDB) {
  await db.execute(sql`
    WITH cleanup AS MATERIALIZED (SELECT pg_try_advisory_xact_lock(91, 0) AS acquired), stale AS (
      SELECT id FROM mcp_authorization_attempts WHERE retain_until <= clock_timestamp()
        AND (SELECT acquired FROM cleanup)
      ORDER BY retain_until LIMIT 64 FOR UPDATE SKIP LOCKED
    ), compacted AS (
      UPDATE mcp_authorization_attempts SET status='closed', user_id=NULL, terms_hash=NULL,
        approval_hash=NULL, decision_deadline=NULL, code_deadline=NULL, retain_until=NULL
      FROM stale WHERE mcp_authorization_attempts.id=stale.id RETURNING stale.id
    )
    DELETE FROM mcp_authorization_codes WHERE request_hash IN (SELECT id FROM compacted)
  `);
}

/** Call within the same transaction as the preview or decision that uses this result. */
export async function lockMcpAuthorizationAttempt(
  tx: AnyDB,
  input: { identity: McpAttemptIdentity; userId: string; requestTermsHash: string; create: boolean }
): Promise<McpAuthorizationAttempt> {
  const identity = attemptIdentity(input.identity, input.identity.issuer);
  const legacy = attemptIdentity(input.identity, null);
  const lock = createHash('sha256').update(identity).digest('base64url');
  await compactAttempts(tx);
  // All versions share the same transaction lock. Key additions cannot race a lookup.
  await tx.execute(sql`LOCK TABLE mcp_attempt_lookup_keys IN SHARE MODE`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 91))`);
  const keys = await tx.execute<{ secret: string }>(
    sql`SELECT secret FROM mcp_attempt_lookup_keys ORDER BY version DESC`
  );
  if (!keys.length) throw new Error('Missing MCP authorization attempt lookup key.');
  const fingerprints = keys.flatMap(({ secret }) => [
    attemptFingerprint(secret, identity),
    attemptFingerprint(secret, legacy),
  ]);
  const [row] = await tx.execute<{
    id: string;
    status: AttemptState | 'closed';
    user_id: string | null;
    terms_hash: string | null;
    approval_hash: string | null;
    decision_expired: boolean;
    code_expired: boolean;
    retention_expired: boolean;
  }>(sql`
    SELECT id, status, user_id, terms_hash, approval_hash,
      decision_deadline <= clock_timestamp() AS decision_expired,
      code_deadline <= clock_timestamp() AS code_expired,
      retain_until <= clock_timestamp() AS retention_expired
    FROM mcp_authorization_attempts
    WHERE id IN (${sql.join(
      fingerprints.map((id) => sql`${id}`),
      sql`, `
    )})
    FOR UPDATE
  `);
  if (row) {
    if (row.status === 'closed' || row.retention_expired) return { status: 'closed' };
    if (row.user_id !== input.userId) return { status: 'unavailable' };
    if (row.terms_hash !== input.requestTermsHash) return { status: 'conflict' };
    let status: AttemptState | 'expired' | 'code_expired' = row.status;
    if (status === 'pending' && row.decision_expired) status = 'expired';
    if (status === 'approved' && row.code_expired) status = 'code_expired';
    return { id: row.id, status, approvalHash: row.approval_hash };
  }
  if (!input.create) return { status: 'missing' };
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 92))`);
  const [admission] = await tx.execute<{ limited: boolean }>(sql`
    SELECT count(*) >= 100 AS limited FROM mcp_authorization_attempts
    WHERE user_id=${input.userId} AND decision_deadline > clock_timestamp()
  `);
  if (admission.limited) return { status: 'limited' };
  const id = fingerprints[0];
  await tx.execute(sql`
    INSERT INTO mcp_authorization_attempts(id,status,user_id,terms_hash,decision_deadline,retain_until)
    VALUES (${id},'pending',${input.userId},${input.requestTermsHash},
      clock_timestamp() + interval '15 minutes', clock_timestamp() + interval '24 hours')
  `);
  return { status: 'pending', id, approvalHash: null };
}

export async function decideMcpAuthorizationAttempt(
  tx: AnyDB,
  id: string,
  decision: 'approved' | 'cancelled',
  approvalHash: string | null
): Promise<boolean> {
  const rows = await tx.execute(sql`
    UPDATE mcp_authorization_attempts SET status=${decision}, approval_hash=${approvalHash}
    WHERE id=${id} AND status='pending' AND decision_deadline > clock_timestamp()
    RETURNING id
  `);
  return rows.length === 1;
}

export async function recordMcpExchangeOutcome(
  tx: AnyDB,
  requestHash: string,
  outcome: 'token_issued' | 'spent_without_token'
) {
  // Legacy codes predate the attempt model and retain only their existing redemption receipt.
  await tx.execute(sql`
    UPDATE mcp_authorization_attempts SET status=${outcome}
    WHERE id=${requestHash} AND status='approved'
  `);
}
