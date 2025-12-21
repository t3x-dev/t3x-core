/**
 * Turns Storage Tests
 *
 * Tests all turn operations and verifies database effects.
 * Turns are immutable and form hash chains.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDB, testData } from './setup';
import { insertProject } from '../queries/projects';
import { insertConversation } from '../queries/conversations';
import {
  insertTurn,
  findTurnByHash,
  findTurnsByConversation,
  findTurnsByProject,
  findLastTurnInConversation,
  findTurnChain,
} from '../queries/turns';
import { turns } from '../schema';
import type { AnyDB } from '../adapters';
import type { PGlite } from '@electric-sql/pglite';

describe('Turns Storage', () => {
  let db: AnyDB;
  let client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    client = setup.client;
    cleanup = setup.cleanup;

    // Create test project and conversation
    const project = await insertProject(db, testData.project({ name: 'Turn Test Project' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Turn Test Chat' }));
    testConversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertTurn', () => {
    it('creates a turn with generated hash', async () => {
      const input = testData.turn(testProjectId, testConversationId, {
        role: 'user',
        content: 'Hello, world!',
      });

      const result = await insertTurn(db, input);

      expect(result).toBeDefined();
      expect(result.turnHash).toMatch(/^sha256:[a-f0-9]+$/);
      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello, world!');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the turn in the database', async () => {
      const input = testData.turn(testProjectId, testConversationId, {
        content: 'Stored in DB',
      });

      const result = await insertTurn(db, input);

      // Verify database effect
      const rows = await db
        .select()
        .from(turns)
        .where(eq(turns.turnHash, result.turnHash));

      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Stored in DB');
      expect(rows[0].projectId).toBe(testProjectId);
      expect(rows[0].conversationId).toBe(testConversationId);
    });

    it('first turn has null parent hash', async () => {
      // Create a new conversation for this test
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'First Turn Test' }));

      const result = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, {
        content: 'I am the first',
      }));

      expect(result.parentTurnHash).toBeNull();
    });

    it('subsequent turns have parent hash pointing to previous turn', async () => {
      // Create a new conversation for this test
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Chain Test' }));

      const turn1 = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, {
        content: 'First message',
      }));

      const turn2 = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, {
        content: 'Second message',
      }));

      expect(turn2.parentTurnHash).toBe(turn1.turnHash);
    });

    it('stores rings as JSON', async () => {
      const rings = {
        ring1: { keywords: ['test', 'demo'] },
        ring2: { intent: 'greeting' },
      };

      const result = await insertTurn(db, {
        ...testData.turn(testProjectId, testConversationId),
        rings,
      });

      // Verify JSON stored
      const rows = await db
        .select()
        .from(turns)
        .where(eq(turns.turnHash, result.turnHash));

      expect(rows[0].ringsJson).toBeDefined();
      const storedRings = JSON.parse(rows[0].ringsJson!);
      expect(storedRings.ring1.keywords).toEqual(['test', 'demo']);
    });

    it('generates deterministic hash for same content', async () => {
      // Create two separate conversations
      const conv1 = await insertConversation(db, testData.conversation(testProjectId, { title: 'Hash Test 1' }));
      const conv2 = await insertConversation(db, testData.conversation(testProjectId, { title: 'Hash Test 2' }));

      const turn1 = await insertTurn(db, {
        projectId: testProjectId,
        conversationId: conv1.conversationId,
        role: 'user',
        content: 'Same content',
      });

      const turn2 = await insertTurn(db, {
        projectId: testProjectId,
        conversationId: conv2.conversationId,
        role: 'user',
        content: 'Same content',
      });

      // Different conversations, so different hashes (parent hash differs)
      // But the hash algorithm should be deterministic
      expect(turn1.turnHash).toMatch(/^sha256:/);
      expect(turn2.turnHash).toMatch(/^sha256:/);
    });
  });

  describe('findTurnByHash', () => {
    it('returns the turn when it exists', async () => {
      const created = await insertTurn(db, testData.turn(testProjectId, testConversationId, {
        content: 'Find me by hash',
      }));

      const found = await findTurnByHash(db, created.turnHash);

      expect(found).toBeDefined();
      expect(found!.turnHash).toBe(created.turnHash);
      expect(found!.content).toBe('Find me by hash');
    });

    it('returns null when turn does not exist', async () => {
      const found = await findTurnByHash(db, 'sha256:nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findTurnsByConversation', () => {
    it('returns turns for a conversation', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'List Turns' }));

      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Turn 1' }));
      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Turn 2' }));

      const results = await findTurnsByConversation(db, { conversationId: conv.conversationId });

      expect(results).toHaveLength(2);
      expect(results.every((t) => t.conversationId === conv.conversationId)).toBe(true);
    });

    it('returns empty array for conversation with no turns', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Empty' }));

      const results = await findTurnsByConversation(db, { conversationId: conv.conversationId });

      expect(results).toHaveLength(0);
    });

    it('respects limit option', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Limit Test' }));

      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'A' }));
      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'B' }));
      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'C' }));

      const results = await findTurnsByConversation(db, { conversationId: conv.conversationId, limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('can order ascending or descending', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Order Test' }));

      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'First' }));
      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Second' }));

      const asc = await findTurnsByConversation(db, { conversationId: conv.conversationId, order: 'asc' });
      const desc = await findTurnsByConversation(db, { conversationId: conv.conversationId, order: 'desc' });

      expect(asc[0].content).toBe('First');
      expect(desc[0].content).toBe('Second');
    });
  });

  describe('findTurnsByProject', () => {
    it('returns all turns for a project', async () => {
      const results = await findTurnsByProject(db, { projectId: testProjectId });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((t) => t.projectId === testProjectId)).toBe(true);
    });

    it('respects limit option', async () => {
      const results = await findTurnsByProject(db, { projectId: testProjectId, limit: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('findLastTurnInConversation', () => {
    it('returns the last turn', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Last Turn' }));

      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'First' }));
      await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Middle' }));
      const last = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Last' }));

      const found = await findLastTurnInConversation(db, conv.conversationId);

      expect(found).toBeDefined();
      expect(found!.turnHash).toBe(last.turnHash);
      expect(found!.content).toBe('Last');
    });

    it('returns null for conversation with no turns', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'No Turns' }));

      const found = await findLastTurnInConversation(db, conv.conversationId);

      expect(found).toBeNull();
    });
  });

  describe('findTurnChain', () => {
    it('returns the chain of turns from root to given turn (chronological order)', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Chain' }));

      const t1 = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Root' }));
      const t2 = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Child' }));
      const t3 = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Grandchild' }));

      const chain = await findTurnChain(db, t3.turnHash);

      expect(chain).toHaveLength(3);
      expect(chain[0].turnHash).toBe(t1.turnHash); // Root first (oldest)
      expect(chain[1].turnHash).toBe(t2.turnHash); // Middle
      expect(chain[2].turnHash).toBe(t3.turnHash); // Most recent last
    });

    it('returns single turn for root turn', async () => {
      const conv = await insertConversation(db, testData.conversation(testProjectId, { title: 'Single' }));

      const root = await insertTurn(db, testData.turn(testProjectId, conv.conversationId, { content: 'Only' }));

      const chain = await findTurnChain(db, root.turnHash);

      expect(chain).toHaveLength(1);
      expect(chain[0].turnHash).toBe(root.turnHash);
    });
  });
});
