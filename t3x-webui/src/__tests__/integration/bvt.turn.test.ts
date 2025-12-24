/**
 * BVT-1: Turn 写入冒烟测试
 *
 * 验证 Turn 的完整写入链路：API → Storage → DB → Hash 一致性
 *
 * 断言点：
 * 1. HTTP 201
 * 2. turn_hash 格式正确 (sha256:...)
 * 3. 第一条 parent_turn_hash 为 null
 * 4. 第二条 parent_turn_hash 指向第一条
 * 5. DB 能查到记录
 * 6. API hash == DB hash
 * 7. Core 重算 hash == API hash（王炸断言）
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

// Import storage schema
import { projects, conversations, turns } from '@t3x/storage';
import { CREATE_TABLES_SQL } from '../../../../t3x-storage/src/__tests__/setup';

// Import hash verification
import { verifyTurnHash } from './helpers';

// Schema for drizzle
const schema = { projects, conversations, turns };

// Mock DB
let client: PGlite;
let mockDB: ReturnType<typeof drizzle>;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { POST as createTurn, GET as listTurns } from '@/app/api/v1/turns/route';
import { POST as createProject } from '@/app/api/v1/projects/route';
import { POST as createConversation } from '@/app/api/v1/conversations/route';

describe('BVT-1: Turn 写入冒烟测试', () => {
  let projectId: string;
  let conversationId: string;

  beforeAll(async () => {
    // 创建内存数据库
    client = new PGlite();
    mockDB = drizzle(client, { schema }) as typeof mockDB;
    await client.exec(CREATE_TABLES_SQL);

    // 创建测试 Project
    const projectReq = new NextRequest('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'BVT Test Project' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const projectRes = await createProject(projectReq);
    const projectData = await projectRes.json();
    expect(projectData.success).toBe(true);
    projectId = projectData.data.project_id;

    // 创建测试 Conversation
    const convReq = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, title: 'BVT Test Conversation' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const convRes = await createConversation(convReq);
    const convData = await convRes.json();
    expect(convData.success).toBe(true);
    conversationId = convData.data.conversation_id;
  });

  afterAll(async () => {
    await client.close();
  });

  it('断言1-3: 创建第一条 Turn，HTTP 201，hash 格式正确，parent 为 null', async () => {
    const request = new NextRequest('http://localhost/api/v1/turns', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        role: 'user',
        content: 'Hello, this is the first message.',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createTurn(request);
    const data = await response.json();

    // 断言1: HTTP 201
    expect(response.status).toBe(201);
    expect(data.success).toBe(true);

    // 断言2: turn_hash 格式
    expect(data.data.turn_hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // 断言3: 第一条 parent 为 null
    expect(data.data.parent_turn_hash).toBeNull();
  });

  it('断言4: 创建第二条 Turn，parent_turn_hash 指向第一条', async () => {
    // 先获取第一条 turn 的 hash
    const listReq = new NextRequest(
      `http://localhost/api/v1/turns?conversation_id=${conversationId}`,
      { method: 'GET' }
    );
    const listRes = await listTurns(listReq);
    const listData = await listRes.json();
    const firstTurnHash = listData.data.turns[0].turn_hash;

    // 创建第二条 turn
    const request = new NextRequest('http://localhost/api/v1/turns', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Hello! How can I help you today?',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createTurn(request);
    const data = await response.json();

    // 断言4: parent_turn_hash 指向第一条
    expect(data.data.parent_turn_hash).toBe(firstTurnHash);
  });

  it('断言5-6: DB 能查到记录，API hash == DB hash', async () => {
    // 创建新 turn
    const request = new NextRequest('http://localhost/api/v1/turns', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        role: 'user',
        content: 'Testing DB consistency.',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createTurn(request);
    const data = await response.json();
    const apiTurnHash = data.data.turn_hash;

    // 断言5: DB 能查到记录
    const [dbTurn] = await mockDB
      .select()
      .from(turns)
      .where(eq(turns.turnHash, apiTurnHash))
      .limit(1);

    expect(dbTurn).toBeDefined();

    // 断言6: API hash == DB hash
    expect(dbTurn.turnHash).toBe(apiTurnHash);
  });

  it('断言7: Core 重算 hash == API hash（王炸断言）', async () => {
    // 创建新 turn
    const request = new NextRequest('http://localhost/api/v1/turns', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Hash verification is critical for data integrity.',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createTurn(request);
    const data = await response.json();
    const turn = data.data;

    // 王炸断言: Core 重算 hash == API hash
    const verification = verifyTurnHash(turn);

    expect(verification.valid).toBe(true);
    if (!verification.valid) {
      console.error('Hash mismatch!');
      console.error('  Expected (recomputed):', verification.expected);
      console.error('  Actual (API returned):', verification.actual);
    }
  });

  it('验证完整 Turn 链（3条消息）', async () => {
    // 创建新 conversation 用于此测试
    const convReq = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, title: 'Chain Test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const convRes = await createConversation(convReq);
    const convData = await convRes.json();
    const testConvId = convData.data.conversation_id;

    // 创建 3 条 turns
    const messages = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Second message' },
      { role: 'user', content: 'Third message' },
    ];

    const createdTurns: Array<{ turn_hash: string; parent_turn_hash: string | null }> = [];

    for (const msg of messages) {
      const req = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          conversation_id: testConvId,
          role: msg.role,
          content: msg.content,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await createTurn(req);
      const data = await res.json();
      createdTurns.push({
        turn_hash: data.data.turn_hash,
        parent_turn_hash: data.data.parent_turn_hash,
      });
    }

    // 验证链式关系
    expect(createdTurns[0].parent_turn_hash).toBeNull();
    expect(createdTurns[1].parent_turn_hash).toBe(createdTurns[0].turn_hash);
    expect(createdTurns[2].parent_turn_hash).toBe(createdTurns[1].turn_hash);
  });
});
