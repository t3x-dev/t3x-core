import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migratePostgresStorage } from '../adapters/postgres';
import { createApiKey } from '../queries/api-keys';
import {
  decideMcpAuthorizationAttempt,
  lockMcpAuthorizationAttempt,
  type McpAttemptIdentity,
  recordMcpExchangeOutcome,
} from '../queries/mcp-authorization-attempts';
import {
  redeemMcpAuthorizationCode,
  storeMcpAuthorizationCode,
} from '../queries/mcp-authorization-codes';
import {
  claimMcpPreselection,
  createMcpPreselection,
  McpPreselectionLimitError,
  readMcpPreselection,
} from '../queries/mcp-preselections';
import { insertProject } from '../queries/projects';
import { createUser } from '../queries/users';
import { createTestDB } from './setup';

describe('MCP authorization persistence', () => {
  let setup: Awaited<ReturnType<typeof createTestDB>>;
  let userId: string;
  let projectId: string;
  let keyId: string;
  beforeAll(async () => {
    setup = await createTestDB();
    userId = (await createUser(setup.db, { name: 'Owner' })).id;
    projectId = (await insertProject(setup.db, { name: 'Operations', ownerId: userId })).projectId;
    keyId = (await createApiKey(setup.db, { name: 'Test grant', keyValue: randomUUID() })).id;
  });
  afterAll(async () => setup?.cleanup());

  function request() {
    return {
      issuer: 'https://web.example.test',
      resource: 'https://mcp.example.test/mcp',
      clientId: 'host',
      redirectUri: 'https://client.example.test/callback',
      challenge: randomUUID(),
    };
  }
  const input = (identity: McpAttemptIdentity, create = true) => ({
    identity,
    userId,
    requestTermsHash: 'terms',
    create,
  });
  const find = (identity: McpAttemptIdentity) =>
    setup.db.transaction((tx) => lockMcpAuthorizationAttempt(tx, input(identity)));
  async function begin(identity: McpAttemptIdentity) {
    const attempt = await find(identity);
    if (attempt.status !== 'pending') throw new Error('Expected a new pending attempt');
    return attempt.id;
  }

  it('serializes two tabs and keeps a compact marker across lookup-key rotation', async () => {
    const identity = request();
    const id = await begin(identity);
    expect(
      await setup.db.transaction((tx) =>
        lockMcpAuthorizationAttempt(tx, { ...input(identity), userId: 'other' })
      )
    ).toEqual({ status: 'unavailable' });
    expect(
      await setup.db.transaction((tx) =>
        lockMcpAuthorizationAttempt(tx, { ...input(identity), requestTermsHash: 'changed' })
      )
    ).toEqual({ status: 'conflict' });
    const results = await Promise.all(
      [0, 1].map(() =>
        setup.db.transaction(async (tx) => {
          const attempt = await lockMcpAuthorizationAttempt(tx, input(identity, false));
          if (attempt.status !== 'pending') return false;
          return decideMcpAuthorizationAttempt(tx, id, 'cancelled', null);
        })
      )
    );
    expect(results.sort()).toEqual([false, true]);
    await setup.sql`UPDATE mcp_authorization_attempts SET retain_until=NOW() WHERE id=${id}`;
    await setup.sql`INSERT INTO mcp_attempt_lookup_keys(version,secret) VALUES (2,${randomBytes(32).toString('hex')})`;
    expect(await find(identity)).toEqual({ status: 'closed' });
    expect(
      await setup.sql`SELECT status,user_id,terms_hash,approval_hash,retain_until FROM mcp_authorization_attempts WHERE id=${id}`
    ).toEqual([
      {
        status: 'closed',
        user_id: null,
        terms_hash: null,
        approval_hash: null,
        retain_until: null,
      },
    ]);
  });

  it('rejects a decision after the database deadline and records successful versus failed issuance', async () => {
    const overdue = request();
    const overdueId = await begin(overdue);
    await setup.sql`UPDATE mcp_authorization_attempts SET decision_deadline=NOW() WHERE id=${overdueId}`;
    expect((await find(overdue)).status).toBe('expired');
    expect(await decideMcpAuthorizationAttempt(setup.db, overdueId, 'approved', 'ignored')).toBe(
      false
    );
    for (const outcome of ['token_issued', 'spent_without_token'] as const) {
      const identity = request();
      const id = await begin(identity);
      const codeHash = randomUUID();
      const code = {
        codeHash,
        requestHash: id,
        approvalHash: 'confirmed',
        nonce: 'nonce',
        ...identity,
        grantId: keyId,
        mode: 'read',
        encryptedCredential: 'fixture',
        expiresAt: new Date(Date.now() + 300_000),
      };
      await setup.db.transaction(async (tx) => {
        expect(await decideMcpAuthorizationAttempt(tx, id, 'approved', 'confirmed')).toBe(true);
        await storeMcpAuthorizationCode(tx, code);
      });
      await setup.db.transaction(async (tx) => {
        const receipt = await redeemMcpAuthorizationCode(tx, { ...identity, codeHash });
        expect(receipt?.requestHash).toBe(id);
        await recordMcpExchangeOutcome(tx, id, outcome);
      });
      expect((await find(identity)).status).toBe(outcome);
      expect(await redeemMcpAuthorizationCode(setup.db, { ...identity, codeHash })).toBeNull();
    }
  });

  it('claims an owned preselection once across two otherwise eligible attempts', async () => {
    const target = { userId, projectId, clientId: 'host', branch: 'main' };
    const selection = await createMcpPreselection(setup.db, target);
    expect(await readMcpPreselection(setup.db, selection.id, 'another')).toBeNull();
    const ids = await Promise.all([begin(request()), begin(request())]);
    const claim = { ...target, id: selection.id, attemptId: ids[0] };
    expect(await claimMcpPreselection(setup.db, { ...claim, branch: 'other' })).toBe(false);
    const claims = await Promise.all(
      ids.map((attemptId) =>
        setup.db.transaction((tx) => claimMcpPreselection(tx, { ...claim, attemptId }))
      )
    );
    expect(claims.sort()).toEqual([false, true]);
    expect(await readMcpPreselection(setup.db, selection.id, userId)).toBeNull();
    const expired = await createMcpPreselection(setup.db, target);
    await setup.sql`UPDATE mcp_preselections SET expires_at=NOW() WHERE id=${expired.id}`;
    expect(await claimMcpPreselection(setup.db, { ...claim, id: expired.id })).toBe(false);
  });

  it('bounds new attempts and saved selections per person without blocking another account', async () => {
    const owner = (await createUser(setup.db, { name: 'Busy account' })).id;
    await setup.sql`INSERT INTO mcp_authorization_attempts(id,status,user_id,decision_deadline)
      SELECT 'budget-' || n, 'pending', ${owner}, NOW()+interval '15 minutes' FROM generate_series(1,100) n`;
    await setup.sql`INSERT INTO mcp_preselections(id,user_id,project_id,client_id,branch,expires_at)
      SELECT 'budget-' || n, ${owner}, ${projectId}, 'host','main',NOW()+interval '15 minutes' FROM generate_series(1,100) n`;
    const identity = request();
    expect(
      await setup.db.transaction((tx) =>
        lockMcpAuthorizationAttempt(tx, { ...input(identity), userId: owner })
      )
    ).toEqual({ status: 'limited' });
    await expect(
      createMcpPreselection(setup.db, {
        userId: owner,
        projectId,
        clientId: 'host',
        branch: 'main',
      })
    ).rejects.toBeInstanceOf(McpPreselectionLimitError);
    expect((await find(identity)).status).toBe('pending');
  });

  it('migrates legacy approvals to closed markers and permits their original unspent code to exchange once', async () => {
    const current = request();
    const currentId = await begin(current);
    await setup.db.transaction(async (tx) => {
      await decideMcpAuthorizationAttempt(tx, currentId, 'approved', 'terms');
      await storeMcpAuthorizationCode(tx, {
        ...current,
        codeHash: randomUUID(),
        requestHash: currentId,
        approvalHash: 'terms',
        nonce: 'nonce',
        mode: 'read',
        grantId: keyId,
        encryptedCredential: 'fixture',
        expiresAt: new Date(Date.now() + 300_000),
      });
    });
    const identity = request();
    const codeHash = randomUUID();
    await setup.sql`INSERT INTO mcp_authorization_codes(code_hash,request_hash,approval_hash,nonce,client_id,redirect_uri,
      resource,challenge,grant_id,mode,encrypted_credential,expires_at)
      VALUES(${codeHash},${randomUUID()},'terms','nonce',${identity.clientId},${identity.redirectUri},
        ${identity.resource},${identity.challenge},${keyId},'read','fixture',NOW()+interval '5 minutes')`;
    await setup.sql`UPDATE _schema_version SET version=90`;
    const [before] =
      await setup.sql`SELECT count(*)::integer AS count FROM mcp_authorization_attempts`;
    await migratePostgresStorage({ connectionString: setup.connectionString });
    await migratePostgresStorage({ connectionString: setup.connectionString });
    expect(
      await setup.sql`SELECT count(*)::integer AS count FROM mcp_authorization_attempts`
    ).toEqual([{ count: before.count + 1 }]);
    expect((await find(current)).status).toBe('approved');
    expect(await find(identity)).toEqual({ status: 'closed' });
    expect(await redeemMcpAuthorizationCode(setup.db, { ...identity, codeHash })).not.toBeNull();
    expect(await redeemMcpAuthorizationCode(setup.db, { ...identity, codeHash })).toBeNull();
  });

  it('skips an expired receipt locked by another writer while issuing a new code', async () => {
    const identity = request();
    const codeHash = randomUUID();
    const oldCode = {
      ...identity,
      grantId: keyId,
      mode: 'read',
      nonce: 'nonce',
      requestHash: randomUUID(),
      codeHash,
      approvalHash: 'terms',
      encryptedCredential: 'fixture',
      expiresAt: new Date(Date.now() - 60_000),
    };
    await storeMcpAuthorizationCode(setup.db, oldCode);
    await setup.sql.begin(async (tx) => {
      await tx`SELECT code_hash FROM mcp_authorization_codes WHERE code_hash=${codeHash} FOR UPDATE`;
      await setup.db.transaction(async (writer) => {
        await writer.execute(sql`SET LOCAL lock_timeout = '1s'`);
        await storeMcpAuthorizationCode(writer, {
          ...oldCode,
          codeHash: randomUUID(),
          requestHash: randomUUID(),
          expiresAt: new Date(Date.now() + 300_000),
        });
      });
    });
    expect(
      await setup.sql`SELECT code_hash FROM mcp_authorization_codes WHERE code_hash=${codeHash}`
    ).toHaveLength(1);
  });
});
