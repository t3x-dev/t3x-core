import { describe, expect, it } from 'vitest';
import {
  getAllModels,
  getCanonicalModelId,
  getModelInfo,
  getModelsByProvider,
  MODEL_CATALOG,
  normalizeModelId,
} from '../../llm/catalog';

describe('Model Catalog', () => {
  it('publishes the expected 3-model sets for each provider', () => {
    expect(getModelsByProvider('anthropic').map((model) => model.id)).toEqual([
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-haiku-4-5-20251001',
    ]);
    expect(getModelsByProvider('openai').map((model) => model.id)).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
    ]);
    expect(getModelsByProvider('google').map((model) => model.id)).toEqual([
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite-preview',
    ]);
  });

  it('has entries for all 3 providers', () => {
    expect(Object.keys(MODEL_CATALOG)).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'google'])
    );
  });

  it('each model has required fields', () => {
    for (const models of Object.values(MODEL_CATALOG)) {
      for (const model of Object.values(models)) {
        expect(model.id).toBeTruthy();
        expect(model.label).toBeTruthy();
        expect(model.provider).toBeTruthy();
        expect(model.capabilities.length).toBeGreaterThan(0);
        expect(model.maxOutputTokens).toBeGreaterThan(0);
      }
    }
  });

  it('getAllModels returns flat list', () => {
    const all = getAllModels();
    expect(all).toHaveLength(9);
    expect(all.every((m) => m.id && m.provider)).toBe(true);
  });

  it('getModelsByProvider filters correctly', () => {
    const anthropic = getModelsByProvider('anthropic');
    expect(anthropic.every((m) => m.provider === 'anthropic')).toBe(true);
    expect(anthropic.length).toBeGreaterThanOrEqual(2);
  });

  it('getModelInfo finds canonical model by ID', () => {
    const info = getModelInfo('gpt-5.4');
    expect(info).toBeDefined();
    expect(info!.provider).toBe('openai');
  });

  it('getModelInfo returns undefined for unknown model', () => {
    expect(getModelInfo('nonexistent-model')).toBeUndefined();
  });

  it('normalizes retired Anthropic model ids to canonical ids', () => {
    expect(normalizeModelId('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-6');
    expect(normalizeModelId('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-6');
    expect(normalizeModelId('claude-opus-4-20250514')).toBe('claude-opus-4-6');
    expect(normalizeModelId('claude-opus-4-1-20250805')).toBe('claude-opus-4-6');
    expect(getCanonicalModelId('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-6');
    expect(getCanonicalModelId('claude-opus-4-1-20250805')).toBe('claude-opus-4-6');
    expect(getModelInfo('claude-sonnet-4-20250514')?.id).toBe('claude-sonnet-4-6');
  });

  it('normalizes legacy OpenAI and Google ids to the current catalog', () => {
    expect(normalizeModelId('gpt-4o')).toBe('gpt-5.4');
    expect(getCanonicalModelId('gpt-4o-mini')).toBe('gpt-5.4-mini');
    expect(getModelInfo('gpt-4o')?.id).toBe('gpt-5.4');

    expect(normalizeModelId('gemini-3.1-pro-preview')).toBe('gemini-2.5-pro');
    expect(getCanonicalModelId('gemini-2.5-flash')).toBe('gemini-3-flash-preview');
    expect(getModelInfo('gemini-3.1-pro-preview')?.id).toBe('gemini-2.5-pro');
  });
});
