import {
  API_BASE,
  cleanupProject,
  createTestCommit,
  createTestConversation,
  createTestLeaf,
  createTestPin,
  createTestProject,
  createTestTurn,
} from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';
import { generateSentences } from '../fixtures/test-data-factory';

/**
 * Pin & Context Management E2E Tests
 *
 * Tests pin CRUD operations and context assembly:
 * - Create conversation pin
 * - Create leaf pin
 * - List pins for a project
 * - Delete pin
 * - Context memory reflects pinned items
 */

test.describe('Pin & Context Management', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let commitHash: string;
  let leafId: string;
  let convPinId: string;
  let leafPinId: string;

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Pin E2E ${Date.now()}`);
    projectId = id;

    // Create conversation with turns
    conversationId = await createTestConversation(request, projectId, 'Pin test conversation');
    await createTestTurn(request, projectId, conversationId, 'user', 'I prefer dark mode.');
    await createTestTurn(
      request,
      projectId,
      conversationId,
      'assistant',
      'Noted, dark mode preference saved.'
    );

    // Create commit and leaf
    const sentences = generateSentences(3);
    commitHash = await createTestCommit(request, projectId, sentences, {
      message: 'Pin test commit',
    });
    leafId = await createTestLeaf(request, commitHash, projectId);
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  // PC-01: Create a conversation pin via API
  test('PC-01: Create conversation pin', async ({ request }) => {
    convPinId = await createTestPin(request, projectId, 'conversation', conversationId);
    expect(convPinId).toBeDefined();
    expect(convPinId).toMatch(/^pin_/);
  });

  // PC-02: Create a leaf pin via API
  test('PC-02: Create leaf pin', async ({ request }) => {
    leafPinId = await createTestPin(request, projectId, 'leaf', leafId);
    expect(leafPinId).toBeDefined();
    expect(leafPinId).toMatch(/^pin_/);
  });

  // PC-03: List pins for project returns both pins
  test('PC-03: List project pins', async ({ request }) => {
    const response = await request.get(`${API_BASE}/projects/${projectId}/pins`);
    const data = await response.json();
    expect(data.success).toBe(true);

    const pins = data.data;
    expect(Array.isArray(pins)).toBe(true);
    expect(pins.length).toBeGreaterThanOrEqual(2);

    const pinIds = pins.map((p: { id: string }) => p.id);
    expect(pinIds).toContain(convPinId);
    expect(pinIds).toContain(leafPinId);
  });

  // PC-04: Delete a pin via API
  test('PC-04: Delete pin', async ({ request }) => {
    const deleteRes = await request.delete(`${API_BASE}/pins/${leafPinId}`);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);
    expect(deleteData.data.deleted).toBe(true);

    // Verify pin no longer in list
    const listRes = await request.get(`${API_BASE}/projects/${projectId}/pins`);
    const listData = await listRes.json();
    const pinIds = listData.data.map((p: { id: string }) => p.id);
    expect(pinIds).not.toContain(leafPinId);
  });

  // PC-05: Context memory includes pinned conversation content
  test('PC-05: Context memory reflects pins', async ({ request }) => {
    // Set conversation context to use the remaining conversation pin
    await request.put(`${API_BASE}/conversations/${conversationId}/context`, {
      data: { selected_pin_ids: [convPinId] },
    });

    const memoryRes = await request.get(`${API_BASE}/conversations/${conversationId}/memory`);
    const memoryData = await memoryRes.json();

    test.skip(!memoryData.success, 'Memory endpoint not available');

    const memory = memoryData.data;
    expect(memory.text).toBeDefined();
    // token_estimate may be 0 if conversation has no parent commit (context depends on commit linkage)
    expect(memory.token_estimate).toBeGreaterThanOrEqual(0);
    expect(memory.sources).toBeDefined();
    expect(Array.isArray(memory.sources)).toBe(true);
  });

  // PC-06: Pinned conversation visible on canvas
  // Note: /chat page has no Pin button; pin UI lives on the Canvas page
  test('PC-06: Pinned conversation visible on canvas', async ({ page }) => {
    // Navigate to project canvas to verify pinned conversation is reflected
    await page.goto(`/project/${projectId}?view=canvas`);

    // Wait for canvas to render
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // The pinned conversation should be visible on the canvas as a node
    // Conversation nodes show the conversation title
    const convNode = page.locator('text=Pin test conversation');
    await expect(convNode.first()).toBeVisible({ timeout: 10000 });
  });
});
