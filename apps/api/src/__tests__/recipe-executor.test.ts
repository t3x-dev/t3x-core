import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeRecipe } from '../lib/recipe-executor';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Recipe Executor', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('send_webhook', () => {
    it('dispatches webhook with correct payload', async () => {
      const webhookDispatch = vi.fn().mockResolvedValue(undefined);
      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'send_webhook', config: { url: 'https://example.com/hook' } }],
        },
        { projectId: 'proj_1', event: 'commit.created', payload: { hash: 'abc' } },
        { webhookDispatch }
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ action: 'send_webhook', success: true });
      expect(webhookDispatch).toHaveBeenCalledWith('https://example.com/hook', {
        recipe_id: 'recipe_1',
        recipe_name: 'Test Recipe',
        event: 'commit.created',
        project_id: 'proj_1',
        hash: 'abc',
      });
    });

    it('succeeds without webhook dispatch function', async () => {
      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'send_webhook', config: { url: 'https://example.com/hook' } }],
        },
        { projectId: 'proj_1', event: 'commit.created', payload: {} },
        {}
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ action: 'send_webhook', success: true });
    });

    it('captures webhook dispatch error', async () => {
      const webhookDispatch = vi.fn().mockRejectedValue(new Error('Network failure'));
      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'send_webhook', config: { url: 'https://example.com/hook' } }],
        },
        { projectId: 'proj_1', event: 'commit.created', payload: {} },
        { webhookDispatch }
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        action: 'send_webhook',
        success: false,
        error: 'Network failure',
      });
    });
  });

  describe('run_eval', () => {
    it('creates a run with leaf_id from step config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { run_id: 'run_123' } }),
      });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'run_eval', config: { leaf_id: 'leaf_abc' } }],
        },
        { projectId: 'proj_1', event: 'leaf.generated', payload: {} },
        { apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        action: 'run_eval',
        success: true,
        data: { run_id: 'run_123' },
      });
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/v1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaf_id: 'leaf_abc',
          project_id: 'proj_1',
          source: 'recipe',
          tags: ['recipe:recipe_1'],
        }),
      });
    });

    it('uses leaf_id from context payload when not in step config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { run_id: 'run_456' } }),
      });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'run_eval', config: {} }],
        },
        { projectId: 'proj_1', event: 'leaf.generated', payload: { leaf_id: 'leaf_xyz' } },
        { apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('fails without leaf_id', async () => {
      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'run_eval', config: {} }],
        },
        { projectId: 'proj_1', event: 'leaf.generated', payload: {} },
        {}
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        action: 'run_eval',
        success: false,
        error: 'Missing leaf_id in step config or context payload',
      });
    });

    it('handles API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'run_eval', config: { leaf_id: 'leaf_abc' } }],
        },
        { projectId: 'proj_1', event: 'leaf.generated', payload: {} },
        { apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        action: 'run_eval',
        success: false,
        error: 'POST /v1/runs failed: 500',
      });
    });
  });

  describe('export_report', () => {
    it('exports report using run_id from step config', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              run_id: 'run_123',
              status: 'completed',
              result: { passed: true, score: 0.9 },
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'export_report', config: { run_id: 'run_123' } }],
        },
        { projectId: 'proj_1', event: 'run.completed', payload: {} },
        { apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].data?.report).toBeDefined();
      const report = results[0].data?.report as Record<string, unknown>;
      expect(report.run_id).toBe('run_123');
      expect(report.project_id).toBe('proj_1');
      expect(report.status).toBe('completed');
    });

    it('uses run_id from prior run_eval result', async () => {
      // First: run_eval
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { run_id: 'run_auto_1' } }),
      });
      // Then: GET run data for export
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            run_id: 'run_auto_1',
            status: 'completed',
            result: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      });
      // Then: PATCH to store report
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [
            { action: 'run_eval', config: { leaf_id: 'leaf_abc' } },
            { action: 'export_report', config: {} },
          ],
        },
        { projectId: 'proj_1', event: 'leaf.generated', payload: {} },
        { apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('fails without run_id', async () => {
      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'export_report', config: {} }],
        },
        { projectId: 'proj_1', event: 'run.completed', payload: {} },
        {}
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        action: 'export_report',
        success: false,
        error: 'Missing run_id in step config or prior run_eval result',
      });
    });

    it('handles GET failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test Recipe',
          steps: [{ action: 'export_report', config: { run_id: 'run_notfound' } }],
        },
        { projectId: 'proj_1', event: 'run.completed', payload: {} },
        { apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('GET /v1/runs/run_notfound failed');
    });
  });

  describe('sequential execution', () => {
    it('executes steps in order', async () => {
      const webhookDispatch = vi.fn().mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { run_id: 'run_seq' } }),
      });

      const results = await executeRecipe(
        {
          id: 'recipe_seq',
          name: 'Sequential Recipe',
          steps: [
            { action: 'send_webhook', config: { url: 'https://example.com/hook' } },
            { action: 'run_eval', config: { leaf_id: 'leaf_1' } },
          ],
        },
        { projectId: 'proj_1', event: 'commit.created', payload: {} },
        { webhookDispatch, apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ action: 'send_webhook', success: true });
      expect(results[1].success).toBe(true);
    });

    it('continues after step failure', async () => {
      const webhookDispatch = vi.fn().mockRejectedValue(new Error('fail'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { run_id: 'run_after_fail' } }),
      });

      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test',
          steps: [
            { action: 'send_webhook', config: { url: 'https://example.com' } },
            { action: 'run_eval', config: { leaf_id: 'leaf_1' } },
          ],
        },
        { projectId: 'proj_1', event: 'test', payload: {} },
        { webhookDispatch, apiBaseUrl: 'http://localhost:8000' }
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles unknown action', async () => {
      const results = await executeRecipe(
        {
          id: 'recipe_1',
          name: 'Test',
          steps: [{ action: 'unknown_action' as 'send_webhook', config: {} }],
        },
        { projectId: 'proj_1', event: 'test', payload: {} },
        {}
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        action: 'unknown_action',
        success: false,
        error: 'Unknown action',
      });
    });
  });
});
