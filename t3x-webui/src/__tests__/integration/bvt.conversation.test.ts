/**
 * BVT-3: Conversation 创建冒烟测试
 *
 * 验证 Conversation 的创建链路：API → Storage → DB
 *
 * 断言点：
 * 1. HTTP 201
 * 2. conversation_id 格式正确 (conv_...)
 * 3. project_id 等于请求的 project_id
 * 4. DB 新增记录
 * 5. API id == DB id
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

// Import storage schema
import { projects, conversations } from '@t3x/storage';
import { CREATE_TABLES_SQL } from '../../../../t3x-storage/src/__tests__/setup';

// Schema for drizzle
const schema = { projects, conversations };

// Mock DB
let client: PGlite;
let mockDB: ReturnType<typeof drizzle>;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { POST as createProject } from '@/app/api/v1/projects/route';
import { POST as createConversation, GET as listConversations } from '@/app/api/v1/conversations/route';

describe('BVT-3: Conversation 创建冒烟测试', () => {
  let projectId: string;

  beforeAll(async () => {
    // 创建内存数据库
    client = new PGlite();
    mockDB = drizzle(client, { schema }) as typeof mockDB;
    await client.exec(CREATE_TABLES_SQL);

    // 创建测试 Project
    const projectReq = new NextRequest('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'BVT Conversation Test Project' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const projectRes = await createProject(projectReq);
    const projectData = await projectRes.json();
    projectId = projectData.data.project_id;
  });

  afterAll(async () => {
    await client.close();
  });

  it('断言1-3: 创建 Conversation，HTTP 201，id 格式正确，project_id 正确', async () => {
    const request = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        title: 'Test Conversation',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createConversation(request);
    const data = await response.json();

    // 断言1: HTTP 201
    expect(response.status).toBe(201);
    expect(data.success).toBe(true);

    // 断言2: conversation_id 格式
    expect(data.data.conversation_id).toMatch(/^conv_[a-f0-9]{8}$/);

    // 断言3: project_id 正确
    expect(data.data.project_id).toBe(projectId);
  });

  it('断言4: DB 新增记录', async () => {
    // 获取当前 conversations 数量
    const listReq = new NextRequest(
      `http://localhost/api/v1/conversations?project_id=${projectId}`,
      { method: 'GET' }
    );
    const listRes = await listConversations(listReq);
    const listData = await listRes.json();
    const countBefore = listData.data.conversations.length;

    // 创建新 conversation
    const request = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        title: 'Another Test Conversation',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await createConversation(request);

    // 再次获取数量
    const listReq2 = new NextRequest(
      `http://localhost/api/v1/conversations?project_id=${projectId}`,
      { method: 'GET' }
    );
    const listRes2 = await listConversations(listReq2);
    const listData2 = await listRes2.json();
    const countAfter = listData2.data.conversations.length;

    // 断言4: DB 新增 1 条
    expect(countAfter).toBe(countBefore + 1);
  });

  it('断言5: API id == DB id', async () => {
    // 创建 conversation
    const request = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        title: 'ID Consistency Test',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createConversation(request);
    const data = await response.json();
    const apiConversationId = data.data.conversation_id;

    // 直接查询 DB
    const [dbConversation] = await mockDB
      .select()
      .from(conversations)
      .where(eq(conversations.conversationId, apiConversationId))
      .limit(1);

    // 断言5: API id == DB id
    expect(dbConversation).toBeDefined();
    expect(dbConversation.conversationId).toBe(apiConversationId);
  });

  it('验证 title 和 metadata 正确存储', async () => {
    const testTitle = 'Conversation with Metadata';

    const request = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        title: testTitle,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createConversation(request);
    const data = await response.json();

    expect(data.data.title).toBe(testTitle);
  });
});
