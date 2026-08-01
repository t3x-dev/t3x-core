import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit } from '../queries/commits';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { getConversationSourceEvidence } from '../queries/source-evidence';
import { insertSourceTextRevision } from '../queries/source-text-revisions';
import { insertTurn } from '../queries/turns';
import { createTestDB, sleep, testData } from './setup';

describe('conversation source evidence', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('projects durable source facts without inventing evidence selection', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Evidence' }));
    const conversation = await insertConversation(db, {
      projectId: project.projectId,
      title: 'Release policy discussion',
    });
    const first = await insertTurn(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Raise the rollout from ten to twenty percent.',
    });
    await sleep(2);
    const second = await insertTurn(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'assistant',
      content: 'I will prepare that change for review.',
    });
    const revision = await insertSourceTextRevision(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      turnHash: first.turnHash,
      turnRole: 'user',
      action: 'edit',
      startChar: 31,
      endChar: 34,
      selectedText: 'ten',
      replacementText: '10',
      baseContent: first.content,
      content: 'Raise the rollout from 10 to twenty percent.',
      spans: [
        {
          id: 'span_rollout',
          action: 'edit',
          start: 31,
          end: 34,
          text: '10',
          originalText: 'ten',
        },
      ],
    });
    const earlierCommit = await createCommit(db, {
      project_id: project.projectId,
      author: { type: 'human', id: 'human:maintainer' },
      content: { trees: [], relations: [] },
      message: 'Update rollout policy',
      sources: [
        { type: 'conversation', id: conversation.conversationId, title: conversation.title ?? '' },
      ],
    });
    await sleep(2);
    const latestCommit = await createCommit(db, {
      project_id: project.projectId,
      author: { type: 'human', id: 'human:maintainer' },
      content: { trees: [], relations: [] },
      message: 'Confirm rollout policy',
      sources: [
        { type: 'conversation', id: conversation.conversationId, title: conversation.title ?? '' },
      ],
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
    expect(record?.commitReferences.map((reference) => reference.commitHash)).toEqual([
      latestCommit.hash,
      earlierCommit.hash,
    ]);
    expect(record?.commitReferences[0]).toEqual(
      expect.objectContaining({ sourceTitle: conversation.title })
    );

    const fullRecord = await getConversationSourceEvidence(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
    });
    expect(fullRecord?.turns.map((turn) => turn.turnHash)).toEqual([
      first.turnHash,
      second.turnHash,
    ]);
  });

  it('returns an explicit missing source when only a legacy commit reference remains', async () => {
    const project = await insertProject(db, testData.project({ name: 'Legacy Source Reference' }));
    await createCommit(db, {
      project_id: project.projectId,
      author: { type: 'agent', id: 'agent:legacy' },
      content: { trees: [], relations: [] },
      sources: [{ type: 'conversation', id: 'conv_removed', title: 'Removed conversation' }],
    });

    const record = await getConversationSourceEvidence(db, {
      projectId: project.projectId,
      conversationId: 'conv_removed',
    });

    expect(record).toMatchObject({
      conversation: null,
      turns: [],
      turnCount: 0,
      revisions: [],
    });
    expect(record?.commitReferences).toHaveLength(1);
  });

  it('scopes conversation lookup and legacy references to the requested project', async () => {
    const owner = await insertProject(db, testData.project({ name: 'Source Owner' }));
    const other = await insertProject(db, testData.project({ name: 'Other Project' }));
    const conversation = await insertConversation(db, {
      projectId: owner.projectId,
      title: 'Private project source',
    });

    await expect(
      getConversationSourceEvidence(db, {
        projectId: other.projectId,
        conversationId: conversation.conversationId,
      })
    ).resolves.toBeNull();
  });
});
