// @vitest-environment jsdom

import { createExtractionFailure } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import { ExtractionRequestError } from '@/commands/yops/errors';

const postExtractYopsMock = vi.fn();

vi.mock('@/infrastructure/llm', () => ({
  postExtractYops: (...args: unknown[]) => postExtractYopsMock(...args),
}));

import { callExtractionLLM } from '@/commands/yops/llmAdapter';

describe('callExtractionLLM', () => {
  it('returns ops on success', async () => {
    postExtractYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ops: [{ define: { path: 'project' } }] } }),
      text: async () => '',
    });

    await expect(
      callExtractionLLM({
        conversationId: 'conv_123',
        turns: [],
      })
    ).resolves.toEqual({ ops: [{ define: { path: 'project' } }] });
  });

  it('returns preset variants on success when the API includes them', async () => {
    postExtractYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          ops: [{ define: { path: 'balanced_root' } }],
          variants: {
            concise: [{ define: { path: 'concise_root' } }],
            balanced: [{ define: { path: 'balanced_root' } }],
            detailed: [{ define: { path: 'detailed_root' } }],
          },
        },
      }),
      text: async () => '',
    });

    await expect(
      callExtractionLLM({
        conversationId: 'conv_123',
        turns: [],
        preset: 'balanced',
      })
    ).resolves.toEqual({
      ops: [{ define: { path: 'balanced_root' } }],
      variants: {
        concise: [{ define: { path: 'concise_root' } }],
        balanced: [{ define: { path: 'balanced_root' } }],
        detailed: [{ define: { path: 'detailed_root' } }],
      },
    });
  });

  it('maps API failure_code into an ExtractionRequestError', async () => {
    postExtractYopsMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: 'Draft schema invalid',
          details: { failure_code: 'draft_schema' },
        },
      }),
      text: async () => '',
    });

    await expect(
      callExtractionLLM({
        conversationId: 'conv_123',
        turns: [],
      })
    ).rejects.toEqual(
      new ExtractionRequestError(
        createExtractionFailure('draft_schema', 'Draft schema invalid'),
        400,
        'EXTRACTION_FAILED'
      )
    );
  });
});
