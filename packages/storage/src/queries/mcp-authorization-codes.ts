import { and, eq, gt, sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnyDB } from '../index';

const codes = pgTable('mcp_authorization_codes', {
  codeHash: text('code_hash').primaryKey(),
  requestHash: text('request_hash').notNull().unique(),
  approvalHash: text('approval_hash').notNull(),
  nonce: text('nonce').notNull(),
  redeemed: boolean('redeemed').notNull().default(false),
  clientId: text('client_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  resource: text('resource').notNull(),
  challenge: text('challenge').notNull(),
  grantId: text('grant_id').notNull(),
  mode: text('mode').notNull(),
  encryptedCredential: text('encrypted_credential').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Serialize confirmations of one PKCE request before creating or rotating a grant.
export async function pendingMcpApproval(db: AnyDB, requestHash: string) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'mcp:consent:' + requestHash},0))`
  );
  const [row] = await db
    .select({
      approvalHash: codes.approvalHash,
      nonce: codes.nonce,
      redeemed: codes.redeemed,
      grantId: codes.grantId,
    })
    .from(codes)
    .where(and(eq(codes.requestHash, requestHash), gt(codes.expiresAt, sql`clock_timestamp()`)))
    .limit(1);
  return row ?? null;
}

export async function storeMcpAuthorizationCode(db: AnyDB, code: typeof codes.$inferInsert) {
  await db.execute(sql`
    DELETE FROM mcp_authorization_codes WHERE code_hash IN (
      SELECT code_hash FROM mcp_authorization_codes WHERE expires_at <= clock_timestamp()
      ORDER BY expires_at LIMIT 64 FOR UPDATE SKIP LOCKED
    )
  `);
  await db.insert(codes).values(code);
  await db.execute(sql`UPDATE mcp_authorization_attempts SET code_deadline=${code.expiresAt.toISOString()}::timestamptz
    WHERE id=${code.requestHash} AND status IN ('pending','approved')`);
}

export async function redeemMcpAuthorizationCode(
  db: AnyDB,
  match: Pick<
    typeof codes.$inferSelect,
    'codeHash' | 'clientId' | 'redirectUri' | 'resource' | 'challenge'
  >
) {
  const [code] = await db
    .update(codes)
    .set({ redeemed: true })
    .where(
      and(
        eq(codes.redeemed, false),
        eq(codes.codeHash, match.codeHash),
        eq(codes.clientId, match.clientId),
        eq(codes.redirectUri, match.redirectUri),
        eq(codes.resource, match.resource),
        eq(codes.challenge, match.challenge),
        gt(codes.expiresAt, sql`clock_timestamp()`)
      )
    )
    .returning();
  return code ?? null;
}
