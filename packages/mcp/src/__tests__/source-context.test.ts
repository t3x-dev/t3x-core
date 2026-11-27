import { expect, it, vi } from 'vitest';

const { listGenerationModels } = vi.hoisted(() => ({ listGenerationModels: vi.fn() }));

vi.mock('../backend.js', () => ({
  isApiBackend: () => true,
  getApiClient: () => ({ listGenerationModels }),
}));

import { sourceContextHandler } from '../tools/source-context.js';

it('keeps the server model order and lists only available providers with models', async () => {
  const model = { id: 'model', label: 'Model', capabilities: ['chat'], max_output_tokens: 100 };
  const managed = { name: 'managed', label: 'Managed', available: true, models: [model] };
  listGenerationModels.mockResolvedValueOnce({
    default_provider: 'disabled',
    generation_provider_order: ['disabled', 'empty', 'managed'],
    providers: [
      { name: 'disabled', available: false, models: [model] },
      { name: 'empty', available: true, models: [] },
      managed,
    ],
    catalog: { internal: true },
  });
  const response = await sourceContextHandler({ action: 'models' });
  expect(response.isError).toBeUndefined();
  expect(JSON.parse(response.content[0]!.text)).toEqual({
    providers: [managed],
    generation_provider_order: ['managed'],
    default_provider: null,
  });
});
