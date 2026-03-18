import { describe, expect, it } from 'vitest';
import { getAllModels, getModelInfo, getModelsByProvider, MODEL_CATALOG } from '../../llm/catalog';

describe('Model Catalog', () => {
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
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((m) => m.id && m.provider)).toBe(true);
  });

  it('getModelsByProvider filters correctly', () => {
    const anthropic = getModelsByProvider('anthropic');
    expect(anthropic.every((m) => m.provider === 'anthropic')).toBe(true);
    expect(anthropic.length).toBeGreaterThanOrEqual(2);
  });

  it('getModelInfo finds model by ID', () => {
    const info = getModelInfo('gpt-4o');
    expect(info).toBeDefined();
    expect(info!.provider).toBe('openai');
  });

  it('getModelInfo returns undefined for unknown model', () => {
    expect(getModelInfo('nonexistent-model')).toBeUndefined();
  });
});
