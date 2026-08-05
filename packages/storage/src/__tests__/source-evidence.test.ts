import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import { seedDemoWorkspace } from '../queries/seed-demo-workspace';
import { getConversationSourceEvidence } from '../queries/source-evidence';
import { insertSourceTextRevision } from '../queries/source-text-revisions';
import { insertTurn } from '../queries/turns';
import { conversations } from '../schema';
import { createTestDB, testData } from './setup';

describe('conversation source evidence', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterEach(async () => cleanup());

  it('projects immutable Proposal evidence from a verified CommitV2 graph', async () => {
    const seeded = await seedDemoWorkspace(db, { ownerId: null });
    const project = seeded.project!;
    const conversation = seeded.conversation!;
    const first = seeded.turn!;
    const second = await insertTurn(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'assistant',
      content: 'The committed source remains independently readable.',
    });
    const revision = await insertSourceTextRevision(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      turnHash: first.turnHash,
      turnRole: 'user',
      action: 'edit',
      startChar: 0,
      endChar: 1,
      selectedText: first.content.slice(0, 1),
      replacementText: first.content.slice(0, 1).toUpperCase(),
      baseContent: first.content,
      content: `${first.content.slice(0, 1).toUpperCase()}${first.content.slice(1)}`,
      spans: [],
    });

    const record = await getConversationSourceEvidence(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      limit: 1,
    });

    expect(record?.conversation?.conversationId).toBe(conversation.conversationId);
    expect(record?.turnCount).toBe(2);
    expect(record?.turns).toHaveLength(1);
    expect(record?.revisions).toEqual([
      expect.objectContaining({ revisionId: revision.revisionId }),
    ]);
    expect(record?.commitReferences).toEqual([
      expect.objectContaining({
        commitDigest: seeded.commit?.digest,
        evidence: [
          expect.objectContaining({
            resource: expect.objectContaining({
              uri: expect.stringContaining(`/conversations/${conversation.conversationId}/turns/`),
            }),
          }),
        ],
      }),
    ]);

    const fullRecord = await getConversationSourceEvidence(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
    });
    expect(fullRecord?.turns.map((turn) => turn.turnHash)).toEqual([
      first.turnHash,
      second.turnHash,
    ]);
  });

  it('reports unavailable source data when immutable evidence outlives its conversation', async () => {
    const seeded = await seedDemoWorkspace(db, { ownerId: null });
    const project = seeded.project!;
    const conversationId = seeded.conversation!.conversationId;
    await db.delete(conversations).where(eq(conversations.conversationId, conversationId));

    const record = await getConversationSourceEvidence(db, {
      projectId: project.projectId,
      conversationId,
    });

    expect(record).toMatchObject({
      conversation: null,
      turns: [],
      turnCount: 0,
      revisions: [],
    });
    expect(record?.commitReferences).toHaveLength(1);
  });

  it('scopes conversations and CommitV2 evidence to the requested project', async () => {
    const seeded = await seedDemoWorkspace(db, { ownerId: null });
    const other = await insertProject(db, testData.project({ name: 'Other Project' }));

    await expect(
      getConversationSourceEvidence(db, {
        projectId: other.projectId,
        conversationId: seeded.conversation!.conversationId,
      })
    ).resolves.toBeNull();
  });
});
