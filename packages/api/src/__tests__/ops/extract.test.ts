import { collectResult, runOperation } from '@t3x-dev/core';
import type { PipelineEvent } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { PipelineEvent as ExtractionEvent } from '../../lib/extraction-pipeline';
import type { ApiPipelineContext } from '../../ops/context';
import { extractOp } from '../../ops/extract';
import type { ExtractInput } from '../../ops/extract';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExtractionEvents: ExtractionEvent[] = [
	{ type: 'status', data: { message: 'Loading conversation...' } },
	{ type: 'status', data: { message: 'Extracting semantics...' } },
	{ type: 'yop', data: { op: 'upsert', path: '/topics/t1', value: 'greeting' } },
	{ type: 'reorganized', data: { trees: [{ key: 'topics' }] } },
	{ type: 'gate', data: { gate: 'quality', passed: true } },
	{ type: 'done', data: { snapshot: { trees: [{ key: 'topics' }] }, yops_count: 1 } },
];

async function* fakeExtractionPipeline() {
	for (const event of mockExtractionEvents) {
		yield event;
	}
}

vi.mock('../../lib/extraction-pipeline', () => ({
	runExtractionPipeline: vi.fn(() => fakeExtractionPipeline()),
}));

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
	return {
		db: {} as any,
		projectId: 'proj_123',
		userId: 'user_1',
		providerRegistry: {} as any,
		abortSignal: new AbortController().signal,
		...overrides,
	} as ApiPipelineContext;
}

const baseInput: ExtractInput = {
	conversationId: 'conv_abc',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractOp', () => {
	it('has the correct name', () => {
		expect(extractOp.name).toBe('extract');
	});

	it('yields op_start, extraction events as step_done, and op_done', async () => {
		const ctx = buildMockContext();
		const events: PipelineEvent[] = [];

		const gen = runOperation(extractOp, baseInput, ctx);

		let result: IteratorResult<PipelineEvent, any>;
		do {
			result = await gen.next();
			if (!result.done) {
				events.push(result.value);
			}
		} while (!result.done);

		const eventSummary = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);

		// Envelope events from runOperation
		expect(eventSummary).toContain('op_start');
		expect(eventSummary).toContain('op_done');

		// Step wrapper events from extractOp
		expect(eventSummary).toContain('step_start:extract');
		expect(eventSummary).toContain('step_done:extract');

		// Re-yielded extraction events (step_done with extraction event type as step)
		expect(eventSummary).toContain('step_done:status');
		expect(eventSummary).toContain('step_done:yop');
		expect(eventSummary).toContain('step_done:reorganized');
		expect(eventSummary).toContain('step_done:gate');
		expect(eventSummary).toContain('step_done:done');
	});

	it('returns collected events and finalEvent', async () => {
		const ctx = buildMockContext();
		const output = await collectResult(runOperation(extractOp, baseInput, ctx));

		expect(output.events).toHaveLength(mockExtractionEvents.length);
		expect(output.events[0]).toEqual(mockExtractionEvents[0]);
		expect(output.finalEvent).toBeDefined();
		expect(output.finalEvent?.type).toBe('done');
		expect(output.finalEvent?.data).toEqual({ snapshot: { trees: [{ key: 'topics' }] }, yops_count: 1 });
	});

	it('passes input parameters to runExtractionPipeline', async () => {
		const ctx = buildMockContext({ projectId: 'proj_999', userId: 'user_42' });
		const { runExtractionPipeline } = await import('../../lib/extraction-pipeline');
		(runExtractionPipeline as any).mockClear();

		const input: ExtractInput = {
			conversationId: 'conv_xyz',
			turnHashes: ['sha256:turn1', 'sha256:turn2'],
			driftDecision: { choice: 'continue', relation: 'subtopic' },
			topicId: 'topic_1',
			forceExtract: true,
		};

		await collectResult(runOperation(extractOp, input, ctx));

		expect(runExtractionPipeline).toHaveBeenCalledWith({
			conversationId: 'conv_xyz',
			projectId: 'proj_999',
			turnHashes: ['sha256:turn1', 'sha256:turn2'],
			driftDecision: { choice: 'continue', relation: 'subtopic' },
			topicId: 'topic_1',
			forceExtract: true,
			userId: 'user_42',
		});
	});

	it('re-yields extraction event data in PipelineEvent data field', async () => {
		const ctx = buildMockContext();
		const events: PipelineEvent[] = [];

		const gen = runOperation(extractOp, baseInput, ctx);

		let result: IteratorResult<PipelineEvent, any>;
		do {
			result = await gen.next();
			if (!result.done) {
				events.push(result.value);
			}
		} while (!result.done);

		// Find the yop event
		const yopEvent = events.find((e) => e.step === 'yop');
		expect(yopEvent).toBeDefined();
		expect(yopEvent?.data).toEqual({ op: 'upsert', path: '/topics/t1', value: 'greeting' });

		// Find the gate event
		const gateEvent = events.find((e) => e.step === 'gate');
		expect(gateEvent).toBeDefined();
		expect(gateEvent?.data).toEqual({ gate: 'quality', passed: true });
	});

	it('handles pipeline with no done event gracefully', async () => {
		const { runExtractionPipeline } = await import('../../lib/extraction-pipeline');

		async function* noDonePipeline() {
			yield { type: 'status' as const, data: { message: 'started' } };
			yield { type: 'error' as const, data: { message: 'something went wrong' } };
		}

		(runExtractionPipeline as any).mockReturnValueOnce(noDonePipeline());

		const ctx = buildMockContext();
		const output = await collectResult(runOperation(extractOp, baseInput, ctx));

		expect(output.events).toHaveLength(2);
		expect(output.finalEvent).toBeUndefined();
	});
});
