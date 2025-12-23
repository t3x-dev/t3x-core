/**
 * BVT-4: 读路径冒烟测试
 *
 * 验证读取链路：能读到刚写入的数据
 *
 * 断言点：
 * 1. HTTP 200
 * 2. 返回数据包含刚写入的记录
 * 3. 关键字段存在且正确
 * 4. 数据条数与写入一致
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NextRequest } from 'next/server';

// Import storage schema
import { projects, conversations, turns, commits, branches } from '@t3x/storage';
import { CREATE_TABLES_SQL } from '../../../../t3x-storage/src/__tests__/setup';

// Schema for drizzle
const schema = { projects, conversations, turns, commits, branches };

// Mock DB
let client: PGlite;
let mockDB: ReturnType<typeof drizzle>;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { POST as createTurn, GET as listTurns } from '@/app/api/v1/turns/route';
import { POST as createProject, GET as listProjects } from '@/app/api/v1/projects/route';
import { POST as createConversation, GET as listConversations } from '@/app/api/v1/conversations/route';
import { POST as createCommit, GET as listCommits } from '@/app/api/v1/commits/route';

describe('BVT-4: 读路径冒烟测试', () => {
  let projectId: string;
  let conversationId: string;
  const turnHashes: string[] = [];
  let commitHash: string;

  beforeAll(async () => {
    // 创建内存数据库
    client = new PGlite();
    mockDB = drizzle(client, { schema }) as typeof mockDB;
    await client.exec(CREATE_TABLES_SQL);

    // 创建测试数据
    // 1. Project
    const projectReq = new NextRequest('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'BVT Read Test Project' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const projectRes = await createProject(projectReq);
    const projectData = await projectRes.json();
    projectId = projectData.data.project_id;

    // 2. Conversation
    const convReq = new NextRequest('http://localhost/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, title: 'BVT Read Test Conversation' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const convRes = await createConversation(convReq);
    const convData = await convRes.json();
    conversationId = convData.data.conversation_id;

    // 3. Turns (2条)
    for (const msg of [
      { role: 'user', content: 'First read test message' },
      { role: 'assistant', content: 'Second read test message' },
    ]) {
      const turnReq = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          conversation_id: conversationId,
          role: msg.role,
          content: msg.content,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const turnRes = await createTurn(turnReq);
      const turnData = await turnRes.json();
      turnHashes.push(turnData.data.turn_hash);
    }

    // 4. Commit
    const commitReq = new NextRequest('http://localhost/api/v1/commits', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        branch: 'main',
        turn_window: {
          start_turn_hash: turnHashes[0],
          end_turn_hash: turnHashes[1],
        },
        facet_snapshot: [],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const commitRes = await createCommit(commitReq);
    const commitData = await commitRes.json();
    commitHash = commitData.data.commit_hash;
  });

  afterAll(async () => {
    await client.close();
  });

  describe('读取 Turns', () => {
    it('断言1-4: HTTP 200，能读到写入的 turns，字段正确，条数一致', async () => {
      const request = new NextRequest(
        `http://localhost/api/v1/turns?conversation_id=${conversationId}`,
        { method: 'GET' }
      );

      const response = await listTurns(request);
      const data = await response.json();

      // 断言1: HTTP 200
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // 断言2: 包含刚写入的记录
      const returnedHashes = data.data.turns.map((t: { turn_hash: string }) => t.turn_hash);
      expect(returnedHashes).toContain(turnHashes[0]);
      expect(returnedHashes).toContain(turnHashes[1]);

      // 断言3: 关键字段存在
      for (const turn of data.data.turns) {
        expect(turn.turn_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(turn.conversation_id).toBe(conversationId);
        expect(['user', 'assistant', 'system', 'tool']).toContain(turn.role);
        expect(turn.content).toBeDefined();
      }

      // 断言4: 条数一致
      expect(data.data.turns.length).toBe(2);
    });
  });

  describe('读取 Commits', () => {
    it('断言1-4: HTTP 200，能读到写入的 commit，字段正确', async () => {
      const request = new NextRequest(
        `http://localhost/api/v1/commits?project_id=${projectId}`,
        { method: 'GET' }
      );

      const response = await listCommits(request);
      const data = await response.json();

      // 断言1: HTTP 200
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // 断言2: 包含刚写入的 commit
      const returnedHashes = data.data.commits.map((c: { commit_hash: string }) => c.commit_hash);
      expect(returnedHashes).toContain(commitHash);

      // 断言3: 关键字段存在
      const commit = data.data.commits.find((c: { commit_hash: string }) => c.commit_hash === commitHash);
      expect(commit).toBeDefined();
      expect(commit.commit_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(commit.project_id).toBe(projectId);
      expect(commit.branch).toBe('main');
      expect(commit.turn_window_json).toBeDefined();
    });
  });

  describe('读取 Conversations', () => {
    it('断言1-4: HTTP 200，能读到写入的 conversation，字段正确', async () => {
      const request = new NextRequest(
        `http://localhost/api/v1/conversations?project_id=${projectId}`,
        { method: 'GET' }
      );

      const response = await listConversations(request);
      const data = await response.json();

      // 断言1: HTTP 200
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // 断言2: 包含刚写入的 conversation
      const returnedIds = data.data.conversations.map((c: { conversation_id: string }) => c.conversation_id);
      expect(returnedIds).toContain(conversationId);

      // 断言3: 关键字段存在
      const conv = data.data.conversations.find((c: { conversation_id: string }) => c.conversation_id === conversationId);
      expect(conv).toBeDefined();
      expect(conv.conversation_id).toMatch(/^conv_[a-f0-9]{8}$/);
      expect(conv.project_id).toBe(projectId);
    });
  });

  describe('读取 Projects', () => {
    it('断言1-4: HTTP 200，能读到写入的 project，字段正确', async () => {
      const request = new NextRequest(
        'http://localhost/api/v1/projects',
        { method: 'GET' }
      );

      const response = await listProjects(request);
      const data = await response.json();

      // 断言1: HTTP 200
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // 断言2: 包含刚写入的 project
      const returnedIds = data.data.projects.map((p: { project_id: string }) => p.project_id);
      expect(returnedIds).toContain(projectId);

      // 断言3: 关键字段存在
      const proj = data.data.projects.find((p: { project_id: string }) => p.project_id === projectId);
      expect(proj).toBeDefined();
      expect(proj.project_id).toMatch(/^proj_[a-f0-9]{8}$/);
      expect(proj.name).toBe('BVT Read Test Project');
    });
  });
});
