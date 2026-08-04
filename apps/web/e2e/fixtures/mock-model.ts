import type { Page, Route } from '@playwright/test';

const LOCAL_PROVIDER_URL = '**/api/v1/providers/local/*';
const LLM_MODELS_URL = '**/api/v1/llm/models';

/**
 * Supply a deterministic runtime-usable model for tests that mock the actual
 * generation request. This exercises the same UI availability gate as a
 * configured local install while ensuring no external provider can be called.
 */
export async function mockConfiguredExtractionModel(page: Page): Promise<void> {
  await page.route(LOCAL_PROVIDER_URL, async (route: Route) => {
    const provider = new URL(route.request().url()).pathname.split('/').pop() ?? 'anthropic';
    const configured = provider === 'anthropic';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          provider,
          configured,
          default_model: configured ? 'mock-model' : null,
          last_test_status: configured ? 'ok' : null,
          last_tested_at: null,
          last_test_error: null,
          api_key_source: configured ? 'file' : 'none',
          api_key_preview: configured ? '…test' : null,
          env_overrides_stored: false,
        },
      }),
    });
  });

  await page.route(LLM_MODELS_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          generation_provider_order: ['anthropic'],
          default_provider: 'anthropic',
          providers: [
            {
              name: 'anthropic',
              label: 'Mock Anthropic',
              available: true,
              models: [
                {
                  id: 'mock-model',
                  label: 'Mock Model',
                  capabilities: [],
                  max_output_tokens: 4096,
                },
              ],
            },
          ],
        },
      }),
    });
  });
}
