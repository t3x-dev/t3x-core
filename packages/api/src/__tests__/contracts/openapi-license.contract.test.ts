import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

describe('OpenAPI metadata contract', () => {
  it('publishes the repository license in the API spec metadata', async () => {
    const { app } = createApp({ skipBuiltinAuth: true });
    const res = await app.request('/api/openapi.json');

    expect(res.status).toBe(200);

    const spec = await res.json();
    expect(spec.info.license).toEqual({
      name: 'Apache-2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
    });
  });
});
