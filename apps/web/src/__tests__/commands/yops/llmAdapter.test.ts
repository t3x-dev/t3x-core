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
  it('returns ops on a kind:"ok" outcome envelope', async () => {
    postExtractYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { kind: 'ok', ops: [{ define: { path: 'project' } }], warnings: [] },
      }),
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
          kind: 'ok',
          ops: [{ define: { path: 'balanced_root' } }],
          warnings: [],
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

  it('sends selected_pin_ids when selectedPinIds are provided', async () => {
    postExtractYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { kind: 'ok', ops: [], warnings: [] },
      }),
      text: async () => '',
    });

    await callExtractionLLM({
      conversationId: 'conv_123',
      turns: [],
      selectedPinIds: ['pin_1', 'pin_2'],
    });

    expect(postExtractYopsMock).toHaveBeenCalledWith({
      conversation_id: 'conv_123',
      turns: [],
      selected_pin_ids: ['pin_1', 'pin_2'],
    });
  });

  it('treats kind:"partial" as success and surfaces ops, logging the salvage reason', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    postExtractYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          kind: 'partial',
          ops: [{ define: { path: 'project' } }],
          warnings: [{ message: 'Style cap dropped 1 of 3' }],
          dropped: [],
          reason: 'compile',
          message: 'compile failed for item_2',
        },
      }),
      text: async () => '',
    });

    await expect(callExtractionLLM({ conversationId: 'conv_123', turns: [] })).resolves.toEqual({
      ops: [{ define: { path: 'project' } }],
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[extract-yops] partial outcome',
      expect.objectContaining({ reason: 'compile' })
    );
    warnSpy.mockRestore();
  });

  it('throws ExtractionRequestError when 200 envelope carries kind:"failed"', async () => {
    postExtractYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          kind: 'failed',
          reason: 'unverifiable_quote',
          message: 'Could not verify 2 source quotes',
          details: { failingOps: [{ opIndex: 0 }] },
        },
      }),
      text: async () => '',
    });

    await expect(callExtractionLLM({ conversationId: 'conv_123', turns: [] })).rejects.toEqual(
      new ExtractionRequestError(
        createExtractionFailure('unverifiable_quote', 'Could not verify 2 source quotes', {
          details: { statusCode: 200, failingOps: [{ opIndex: 0 }] },
        }),
        200
      )
    );
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
