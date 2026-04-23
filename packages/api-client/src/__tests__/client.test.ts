/**
 * T3xClient Tests
 *
 * Tests the HTTP client with injectable mock fetch.
 */

import { describe, expect, it, vi } from 'vitest';
import { createClient, T3xApiError, T3xClient } from '../client.js';

// Helper: create a mock fetch that returns given data
function mockFetch(data: unknown, status = 200, ok = true) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
      text: () => Promise.resolve(JSON.stringify(data)),
    })
  ) as unknown as typeof fetch;
}

function successResponse<T>(data: T) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

function createTestClient(fetchFn: typeof fetch) {
  return new T3xClient({
    baseUrl: 'http://localhost:8000',
    fetch: fetchFn,
  });
}

describe('T3xClient', () => {
  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('strips trailing slash from baseUrl', () => {
      const fn = mockFetch(successResponse({ status: 'ok' }));
      const client = new T3xClient({ baseUrl: 'http://localhost:8000/', fetch: fn });
      client.status();
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:8000/v1/status'),
        expect.any(Object)
      );
    });

    it('sets default Content-Type header', () => {
      const fn = mockFetch(successResponse({}));
      const client = createTestClient(fn);
      client.status();
      expect(fn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('merges custom headers', () => {
      const fn = mockFetch(successResponse({}));
      const client = new T3xClient({
        baseUrl: 'http://localhost:8000',
        headers: { Authorization: 'Bearer tok' },
        fetch: fn,
      });
      client.status();
      expect(fn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok',
          }),
        })
      );
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error handling', () => {
    it('throws T3xApiError on non-ok response with error body', async () => {
      const fn = mockFetch(errorResponse('NOT_FOUND', 'Not found'), 404, false);
      const client = createTestClient(fn);

      await expect(client.getProject('proj_123')).rejects.toThrow(T3xApiError);
      try {
        await client.getProject('proj_123');
      } catch (e) {
        const err = e as T3xApiError;
        expect(err.code).toBe('NOT_FOUND');
        expect(err.status).toBe(404);
        expect(err.message).toBe('Not found');
      }
    });

    it('throws T3xApiError with UNKNOWN code when success is false on ok response', async () => {
      const fn = mockFetch(errorResponse('VALIDATION', 'Bad input'), 200, true);
      const client = createTestClient(fn);

      await expect(client.getProject('proj_123')).rejects.toThrow(T3xApiError);
    });

    it('throws with UNKNOWN code when response is not ok and success is true', async () => {
      // Edge case: HTTP 500 but body says success:true (shouldn't happen, but defensive)
      const fn = mockFetch({ success: true, data: {} }, 500, false);
      const client = createTestClient(fn);

      await expect(client.getProject('proj_123')).rejects.toThrow(T3xApiError);
      try {
        await client.getProject('proj_123');
      } catch (e) {
        expect((e as T3xApiError).code).toBe('UNKNOWN');
      }
    });
  });

  // =========================================================================
  // Health & Status
  // =========================================================================
  describe('health', () => {
    it('calls /health directly', async () => {
      const healthData = { status: 'ok', service: 't3x-api', timestamp: '2024-01-01T00:00:00Z' };
      const fn = mockFetch(healthData);
      const client = createTestClient(fn);

      const result = await client.health();
      expect(result).toEqual(healthData);
      expect(fn).toHaveBeenCalledWith('http://localhost:8000/health', expect.any(Object));
    });

    it('unwraps success envelopes from /health', async () => {
      const healthData = { status: 'ok', service: 't3x-api', timestamp: '2024-01-01T00:00:00Z' };
      const fn = mockFetch(successResponse(healthData));
      const client = createTestClient(fn);

      const result = await client.health();
      expect(result).toEqual(healthData);
    });
  });

  describe('status', () => {
    it('calls GET /v1/status', async () => {
      const statusData = { version: '1.0', environment: 'test', uptime_seconds: 100 };
      const fn = mockFetch(successResponse(statusData));
      const client = createTestClient(fn);

      const result = await client.status();
      expect(result).toEqual(statusData);
    });
  });

  // =========================================================================
  // Projects
  // =========================================================================
  describe('projects', () => {
    it('listProjects sends GET with pagination', async () => {
      const data = { projects: [], limit: 10, offset: 0 };
      const fn = mockFetch(successResponse(data));
      const client = createTestClient(fn);

      const result = await client.listProjects({ limit: 10, offset: 0 });
      expect(result).toEqual(data);
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
    });

    it('getProject sends GET /v1/projects/:id', async () => {
      const project = { project_id: 'proj_1', name: 'Test' };
      const fn = mockFetch(successResponse(project));
      const client = createTestClient(fn);

      const result = await client.getProject('proj_1');
      expect(result).toEqual(project);
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/projects/proj_1'),
        expect.any(Object)
      );
    });

    it('createProject sends POST', async () => {
      const project = { project_id: 'proj_new', name: 'New' };
      const fn = mockFetch(successResponse(project));
      const client = createTestClient(fn);

      const result = await client.createProject({ name: 'New' });
      expect(result).toEqual(project);
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/projects'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New' }),
        })
      );
    });

    it('updateProject sends PATCH', async () => {
      const fn = mockFetch(successResponse({ project_id: 'proj_1', name: 'Updated' }));
      const client = createTestClient(fn);

      await client.updateProject('proj_1', { name: 'Updated' });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/projects/proj_1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('deleteProject sends DELETE', async () => {
      const fn = mockFetch(successResponse(null));
      const client = createTestClient(fn);

      await client.deleteProject('proj_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/projects/proj_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('deleteProject with permanent=true adds query param', async () => {
      const fn = mockFetch(successResponse(null));
      const client = createTestClient(fn);

      await client.deleteProject('proj_1', { permanent: true });
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('permanent=true');
      expect(fn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('restoreProject sends POST to restore endpoint', async () => {
      const fn = mockFetch(
        successResponse({
          project_id: 'proj_1',
          name: 'Restored',
          created_at: '2024-01-01T00:00:00Z',
        })
      );
      const client = createTestClient(fn);

      const result = await client.restoreProject('proj_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/projects/proj_1/restore'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.project_id).toBe('proj_1');
    });
  });

  // =========================================================================
  // Conversations
  // =========================================================================
  describe('conversations', () => {
    it('listConversations adds project_id to query', async () => {
      const fn = mockFetch(successResponse({ conversations: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listConversations('proj_1');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('project_id=proj_1');
    });

    it('getConversation sends GET /v1/conversations/:id', async () => {
      const fn = mockFetch(successResponse({ conversation_id: 'conv_1' }));
      const client = createTestClient(fn);

      await client.getConversation('conv_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/conversations/conv_1'),
        expect.any(Object)
      );
    });

    it('createConversation sends POST', async () => {
      const fn = mockFetch(successResponse({ conversation_id: 'conv_new' }));
      const client = createTestClient(fn);

      await client.createConversation({ project_id: 'proj_1', title: 'New' });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/conversations'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('deleteConversation sends DELETE', async () => {
      const fn = mockFetch(successResponse(null));
      const client = createTestClient(fn);

      await client.deleteConversation('conv_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/conversations/conv_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // =========================================================================
  // Turns
  // =========================================================================
  describe('turns', () => {
    it('listTurns adds conversation_id to query', async () => {
      const fn = mockFetch(successResponse({ turns: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listTurns('conv_1', { limit: 5 });
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('conversation_id=conv_1');
      expect(url).toContain('limit=5');
    });

    it('getTurn sends GET /v1/turns/:hash', async () => {
      const fn = mockFetch(successResponse({ turn_hash: 'sha256:abc' }));
      const client = createTestClient(fn);

      await client.getTurn('sha256:abc');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/turns/sha256:abc'),
        expect.any(Object)
      );
    });

    it('getTurnChain sends GET /v1/turns/:hash/chain', async () => {
      const fn = mockFetch(successResponse([]));
      const client = createTestClient(fn);

      await client.getTurnChain('sha256:abc');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/turns/sha256:abc/chain'),
        expect.any(Object)
      );
    });

    it('createTurn sends POST', async () => {
      const fn = mockFetch(successResponse({ turn_hash: 'sha256:new' }));
      const client = createTestClient(fn);

      await client.createTurn({
        conversation_id: 'conv_1',
        role: 'user',
        content: 'Hello',
      });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/turns'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // =========================================================================
  // Commits
  // =========================================================================
  describe('commits', () => {
    it('listCommits sends GET /v1/projects/:id/commits with branch query', async () => {
      const fn = mockFetch(successResponse({ commits: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listCommits('proj_1', 'main');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/projects/proj_1/commits');
      expect(url).toContain('branch=main');
    });

    it('listCommits omits undefined branch', async () => {
      const fn = mockFetch(successResponse({ commits: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listCommits('proj_1');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/projects/proj_1/commits');
      expect(url).not.toContain('branch=');
    });

    it('getCommit sends GET /v1/commits/:hash', async () => {
      const fn = mockFetch(successResponse({ commit_hash: 'sha256:abc' }));
      const client = createTestClient(fn);

      await client.getCommit('sha256:abc');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/commits/sha256:abc'),
        expect.any(Object)
      );
    });

    it('createCommit sends POST', async () => {
      const fn = mockFetch(successResponse({ commit_hash: 'sha256:new' }));
      const client = createTestClient(fn);

      await client.createCommit({
        project_id: 'proj_1',
        content: { trees: [{ key: 'test', slots: { text: 'hello' }, children: [] }] },
        branch: 'main',
        message: 'Initial',
      });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/commits'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // =========================================================================
  // Branches
  // =========================================================================
  describe('branches', () => {
    it('listBranches adds project_id', async () => {
      const fn = mockFetch(successResponse({ branches: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listBranches('proj_1');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('project_id=proj_1');
    });

    it('getCurrentBranch sends GET /v1/branches/current', async () => {
      const fn = mockFetch(successResponse({ branch_id: 'br_1', name: 'main' }));
      const client = createTestClient(fn);

      await client.getCurrentBranch('proj_1');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/branches/current');
      expect(url).toContain('project_id=proj_1');
    });

    it('createBranch sends POST', async () => {
      const fn = mockFetch(successResponse({ branch_id: 'br_new', name: 'feature' }));
      const client = createTestClient(fn);

      await client.createBranch({ project_id: 'proj_1', name: 'feature' });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/branches'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('switchBranch sends POST /v1/branches/switch', async () => {
      const fn = mockFetch(successResponse({ branch_id: 'br_1', name: 'feature' }));
      const client = createTestClient(fn);

      await client.switchBranch('proj_1', 'feature');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/branches/switch'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ project_id: 'proj_1', branch_name: 'feature' }),
        })
      );
    });
  });

  // =========================================================================
  // Drafts
  // =========================================================================
  describe('drafts', () => {
    it('listDrafts adds project_id', async () => {
      const fn = mockFetch(successResponse({ drafts: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listDrafts('proj_1');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('project_id=proj_1');
    });

    it('getDraft sends GET', async () => {
      const fn = mockFetch(successResponse({ draft_id: 'd_1' }));
      const client = createTestClient(fn);

      await client.getDraft('d_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/drafts/d_1'),
        expect.any(Object)
      );
    });

    it('createDraft sends POST', async () => {
      const fn = mockFetch(successResponse({ draft_id: 'd_new' }));
      const client = createTestClient(fn);

      await client.createDraft({
        project_id: 'proj_1',
        conversation_id: 'conv_1',
        bridge_id: 'br_1',
        intent: 'test',
      });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/drafts'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('deleteDraft sends DELETE', async () => {
      const fn = mockFetch(successResponse(null));
      const client = createTestClient(fn);

      await client.deleteDraft('d_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/drafts/d_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // =========================================================================
  // Agent Drafts
  // =========================================================================
  describe('agent drafts', () => {
    it('listAgentDrafts calls /v1/agent/drafts', async () => {
      const fn = mockFetch(successResponse({ drafts: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listAgentDrafts('proj_1');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/agent/drafts');
    });

    it('getAgentDraft calls /v1/agent/drafts/:id', async () => {
      const fn = mockFetch(successResponse({ draft_id: 'ad_1' }));
      const client = createTestClient(fn);

      await client.getAgentDraft('ad_1');
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/agent/drafts/ad_1'),
        expect.any(Object)
      );
    });

    it('createAgentDraft sends POST', async () => {
      const fn = mockFetch(successResponse({ draft_id: 'ad_new' }));
      const client = createTestClient(fn);

      await client.createAgentDraft({
        project_id: 'proj_1',
        conversation_id: 'conv_1',
        bridge_id: 'br_1',
        intent: 'agent test',
      });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/agent/drafts'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // =========================================================================
  // Diff
  // =========================================================================
  describe('diff', () => {
    it('twoWayDiff sends POST /v1/diff/two-way', async () => {
      const fn = mockFetch(
        successResponse({ changes: [], stats: { added: 0, removed: 0, modified: 0 } })
      );
      const client = createTestClient(fn);

      await client.twoWayDiff({ base_commit_hash: 'sha256:a', target_commit_hash: 'sha256:b' });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/diff/two-way'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // =========================================================================
  // Export
  // =========================================================================
  describe('export', () => {
    it('exportCfpack returns Blob', async () => {
      const fn = mockFetch({ version: '1.0.0' });
      const client = createTestClient(fn);

      const result = await client.exportCfpack({ project_id: 'proj_1' });
      expect(result).toBeInstanceOf(Blob);
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/export/cfpack');
      expect(url).toContain('project_id=proj_1');
    });

    it('exportCfpack throws on failure', async () => {
      const fn = mockFetch({}, 500, false);
      const client = createTestClient(fn);

      await expect(client.exportCfpack({ project_id: 'proj_1' })).rejects.toThrow(T3xApiError);
    });

    it('exportLedger returns string', async () => {
      const fn = mockFetch({ type: 'project' });
      const client = createTestClient(fn);

      const result = await client.exportLedger({ project_id: 'proj_1' });
      expect(typeof result).toBe('string');
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/export/ledger');
    });

    it('exportLedger throws on failure', async () => {
      const fn = mockFetch({}, 404, false);
      const client = createTestClient(fn);

      await expect(client.exportLedger({ project_id: 'proj_1' })).rejects.toThrow(T3xApiError);
    });
  });

  // =========================================================================
  // Chat
  // =========================================================================
  describe('chat', () => {
    it('chat sends POST /v1/chat', async () => {
      const fn = mockFetch(successResponse({ message: { role: 'assistant', content: 'Hi' } }));
      const client = createTestClient(fn);

      await client.chat({ messages: [{ role: 'user', content: 'Hello' }] });
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('listChatProviders sends GET /v1/chat/providers', async () => {
      const fn = mockFetch(successResponse([{ id: 'openai', name: 'OpenAI', models: ['gpt-4'] }]));
      const client = createTestClient(fn);

      const result = await client.listChatProviders();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('openai');
    });
  });

  // =========================================================================
  // createClient helper
  // =========================================================================
  describe('createClient', () => {
    it('returns T3xClient instance', () => {
      const client = createClient({ baseUrl: 'http://localhost:8000' });
      expect(client).toBeInstanceOf(T3xClient);
    });
  });

  // =========================================================================
  // Query parameter handling
  // =========================================================================
  describe('query parameters', () => {
    it('skips undefined values in query params', async () => {
      const fn = mockFetch(successResponse({ commits: [], limit: 20, offset: 0 }));
      const client = createTestClient(fn);

      await client.listCommits('proj_1', undefined, { limit: 10 });
      const url = (fn.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/v1/projects/proj_1/commits');
      expect(url).toContain('limit=10');
      // branch should not appear since it's undefined
      expect(url).not.toContain('branch');
    });
  });
});
