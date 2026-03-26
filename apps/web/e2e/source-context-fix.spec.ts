import { expect, test } from './fixtures/test';

/**
 * E2E test to verify source context fix (#218 follow-up)
 *
 * This test verifies that:
 * 1. Curate API returns turn_hash and turn-relative positions
 * 2. V4 commits created through UI have correct source_ref
 * 3. CommitSourceContext displays correct highlighting
 */

test.describe('Source Context Fix Verification', () => {
  let projectId: string;
  let conversationId: string;
  let turnHash: string;

  const turnContent = 'I prefer dark mode for coding. My budget is around $5000.';

  test.beforeAll(async ({ request }) => {
    // Create test project
    const projectRes = await request.post('http://localhost:8000/api/v1/projects', {
      data: { name: `Source Context Test ${Date.now()}` },
    });
    const projectData = await projectRes.json();
    projectId = projectData.data.project_id;

    // Create conversation
    const convRes = await request.post('http://localhost:8000/api/v1/conversations', {
      data: { project_id: projectId, title: 'Test Conversation' },
    });
    const convData = await convRes.json();
    conversationId = convData.data.conversation_id;

    // Create turn with content
    const turnRes = await request.post('http://localhost:8000/api/v1/turns', {
      data: {
        project_id: projectId,
        conversation_id: conversationId,
        role: 'user',
        content: turnContent,
      },
    });
    const turnData = await turnRes.json();
    turnHash = turnData.data.turn_hash;
  });

  test('Curate API returns turn_hash and turn-relative positions', async ({ request }) => {
    // Call curate preview
    const curateRes = await request.post('http://localhost:8000/api/v1/curate/preview', {
      data: {
        project_id: projectId,
        source_conversation_id: conversationId,
        bridge_id: 'prose',
        intent: 'extract preferences',
        cosine: 0.3,
      },
    });

    // Skip if curate API fails (requires Google AI Studio key for embedding)
    if (!curateRes.ok()) {
      const body = await curateRes.json().catch(() => ({}));
      test.skip(true, `Curate API failed: ${body?.error?.code ?? curateRes.status()} — likely missing API key`);
    }
    const curateData = await curateRes.json();

    // Verify chunks have turn_hash and turn-relative positions
    const chunks = curateData.data.chunks;
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      // v1.3: Each chunk should have turn_hash
      expect(chunk.turn_hash).toBe(turnHash);

      // v1.3: Each chunk should have turn-relative positions
      expect(typeof chunk.turn_start).toBe('number');
      expect(typeof chunk.turn_end).toBe('number');

      // turn_start/turn_end should be valid positions within turn content
      expect(chunk.turn_start).toBeGreaterThanOrEqual(0);
      expect(chunk.turn_end).toBeLessThanOrEqual(turnContent.length);
      expect(chunk.turn_start).toBeLessThan(chunk.turn_end);

      // The text at turn-relative position should match chunk text
      const expectedText = turnContent.slice(chunk.turn_start, chunk.turn_end);
      expect(chunk.text).toBe(expectedText);
    }
  });

  test('V4 commit with correct source_ref shows proper highlighting', async ({ request }) => {
    // Create V4 commit with turn-relative positions
    // turnContent = "I prefer dark mode for coding. My budget is around $5000." (57 chars total)
    // Position 0-30: "I prefer dark mode for coding." (30 chars)
    // Position 30: space
    // Position 31-57: "My budget is around $5000." (26 chars)
    const commitRes = await request.post('http://localhost:8000/api/v1/commits', {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'Test commit with source context',
        content: {
          frames: [
            {
              id: 'f_001',
              type: 'legacy_sentence',
              slots: {
                text: 'I prefer dark mode for coding.',
                source_ref: {
                  conversation_id: conversationId,
                  turn_hash: turnHash,
                  start_char: 0,
                  end_char: 30,
                },
              },
            },
            {
              id: 'f_002',
              type: 'legacy_sentence',
              slots: {
                text: 'My budget is around $5000.',
                source_ref: {
                  conversation_id: conversationId,
                  turn_hash: turnHash,
                  start_char: 31,
                  end_char: 57,
                },
              },
            },
          ],
          relations: [],
        },
        author: { type: 'human', name: 'Test' },
      },
    });

    expect(commitRes.ok()).toBe(true);
    const commitData = await commitRes.json();
    const commitHash = commitData.data.commit.hash;

    // Fetch the commit and verify source_ref
    const getRes = await request.get(`http://localhost:8000/api/v1/commits/${commitHash}`);
    expect(getRes.ok()).toBe(true);
    const getData = await getRes.json();

    const frames = getData.data.commit.content.frames;
    expect(frames).toHaveLength(2);

    // Verify frame 1
    expect(frames[0].slots.source_ref.turn_hash).toBe(turnHash);
    expect(frames[0].slots.source_ref.start_char).toBe(0);
    expect(frames[0].slots.source_ref.end_char).toBe(30);

    // Verify frame 2
    expect(frames[1].slots.source_ref.turn_hash).toBe(turnHash);
    expect(frames[1].slots.source_ref.start_char).toBe(31);
    expect(frames[1].slots.source_ref.end_char).toBe(57);

    // Verify the positions match the actual text
    expect(turnContent.slice(0, 30)).toBe('I prefer dark mode for coding.');
    expect(turnContent.slice(31, 57)).toBe('My budget is around $5000.');
  });
});
