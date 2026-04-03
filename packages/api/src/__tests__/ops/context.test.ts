import { describe, expect, it, vi } from 'vitest';

const mockDB = { query: vi.fn() };
const mockRegistry = { getProvider: vi.fn() };

vi.mock('../../lib/db', () => ({
	getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

vi.mock('../../lib/provider-registry', () => ({
	getProviderRegistry: vi.fn(() => Promise.resolve(mockRegistry)),
}));

import { buildPipelineContext } from '../../ops/context';

function fakeHonoContext(overrides: { userId?: string } = {}) {
	const store = new Map<string, unknown>();
	if (overrides.userId) store.set('userId', overrides.userId);

	return {
		get: (key: string) => store.get(key),
		req: {
			raw: { signal: new AbortController().signal },
		},
	} as unknown as Parameters<typeof buildPipelineContext>[0];
}

describe('buildPipelineContext', () => {
	it('returns db, providerRegistry, projectId, userId, and abortSignal', async () => {
		const c = fakeHonoContext({ userId: 'user_abc' });
		const ctx = await buildPipelineContext(c, 'proj_123');

		expect(ctx.db).toBe(mockDB);
		expect(ctx.providerRegistry).toBe(mockRegistry);
		expect(ctx.projectId).toBe('proj_123');
		expect(ctx.userId).toBe('user_abc');
		expect(ctx.abortSignal).toBeInstanceOf(AbortSignal);
	});

	it('sets userId to undefined when not present in Hono context', async () => {
		const c = fakeHonoContext();
		const ctx = await buildPipelineContext(c, 'proj_456');

		expect(ctx.userId).toBeUndefined();
	});
});
