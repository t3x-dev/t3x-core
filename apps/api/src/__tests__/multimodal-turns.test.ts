/**
 * Multimodal Turns Route Tests
 *
 * Tests for multimodal content_blocks support in turn endpoints.
 */

import { insertConversation, insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock NLP provider to avoid real API calls
vi.mock('../lib/nlp', () => ({
  getNLPProvider: vi.fn(() => ({
    detectLanguage: vi.fn(() => Promise.resolve({ language: 'en', confidence: 1 })),
    extractEntities: vi.fn(() => Promise.resolve([])),
    analyzeSentiment: vi.fn(() => Promise.resolve({ score: 0, magnitude: 0 })),
  })),
}));

import { turnRoutes } from '../routes/turns';

describe('Multimodal Turns', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', turnRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Multimodal Test' }));
    testProjectId = project.projectId;

    const conversation = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Multimodal Conversation',
    });
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // Backward compatibility
  // =========================================================================

  it('creates text-only turn (backward compat)', async () => {
    const res = await app.request('/v1/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        role: 'user',
        content: 'Hello, plain text only',
      }),
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.content).toBe('Hello, plain text only');
    expect(data.data.content_blocks).toBeNull();
    expect(data.data.turn_hash).toBeDefined();
  });

  // =========================================================================
  // content_blocks support
  // =========================================================================

  it('creates turn with content_blocks', async () => {
    const blocks = [
      { type: 'text', text: 'Check out this image' },
      { type: 'image', url: 'https://example.com/photo.png', alt: 'A photo' },
    ];

    const res = await app.request('/v1/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        role: 'user',
        content: 'Check out this image',
        content_blocks: blocks,
      }),
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.content).toBe('Check out this image');
    expect(data.data.content_blocks).toEqual(blocks);
    expect(data.data.turn_hash).toBeDefined();
  });

  // =========================================================================
  // Auto-compute content from blocks
  // =========================================================================

  it('auto-computes content from blocks when content is empty', async () => {
    const blocks = [
      { type: 'text', text: 'First paragraph' },
      {
        type: 'image',
        url: 'https://example.com/diagram.png',
        alt: 'Diagram',
        ocr_text: 'OCR result here',
      },
      { type: 'audio', url: 'https://example.com/note.mp3', transcript: 'Voice memo transcript' },
    ];

    const res = await app.request('/v1/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        role: 'user',
        content_blocks: blocks,
      }),
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    // textFromBlocks joins text, image (with OCR), and audio (with transcript)
    expect(data.data.content).toContain('First paragraph');
    expect(data.data.content).toContain('[Image: Diagram]');
    expect(data.data.content).toContain('OCR result here');
    expect(data.data.content).toContain('[Audio]');
    expect(data.data.content).toContain('Voice memo transcript');
    expect(data.data.content_blocks).toEqual(blocks);
  });

  // =========================================================================
  // GET returns content_blocks
  // =========================================================================

  it('returns content_blocks in turn response', async () => {
    const blocks = [
      { type: 'text', text: 'Retrievable multimodal turn' },
      {
        type: 'file',
        url: 'https://example.com/doc.pdf',
        filename: 'doc.pdf',
        mime_type: 'application/pdf',
      },
    ];

    // Create the turn
    const createRes = await app.request('/v1/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        role: 'assistant',
        content: 'Retrievable multimodal turn',
        content_blocks: blocks,
      }),
    });

    expect(createRes.status).toBe(201);
    const createData: ApiResponse = await createRes.json();
    const turnHash = createData.data.turn_hash;

    // GET the turn by hash
    const getRes = await app.request(`/v1/turns/${encodeURIComponent(turnHash)}`);
    expect(getRes.status).toBe(200);
    const getData: ApiResponse = await getRes.json();
    expect(getData.data.content_blocks).toEqual(blocks);
    expect(getData.data.content).toBe('Retrievable multimodal turn');

    // GET via list endpoint
    const listRes = await app.request(`/v1/turns?conversation_id=${testConversationId}`);
    expect(listRes.status).toBe(200);
    const listData: ApiResponse = await listRes.json();
    const matchingTurn = listData.data.turns.find((t: ApiResponse) => t.turn_hash === turnHash);
    expect(matchingTurn).toBeDefined();
    expect(matchingTurn.content_blocks).toEqual(blocks);
  });
});
