import type { Operation, OpsPipelineContext, PipelineEvent } from './types';

/**
 * Wraps an Operation's run() generator with op_start/op_done/op_error events.
 * Universal entry point — every operation goes through here.
 */
export async function* runOperation<I, O>(
	op: Operation<I, O>,
	input: I,
	ctx: OpsPipelineContext,
): AsyncGenerator<PipelineEvent, O> {
	yield { type: 'op_start', op: op.name, timestamp: Date.now() };
	try {
		const result: O = yield* op.run(input, ctx);
		yield { type: 'op_done', op: op.name, timestamp: Date.now() };
		return result;
	} catch (err) {
		yield {
			type: 'op_error',
			op: op.name,
			error: err,
			timestamp: Date.now(),
		};
		throw err;
	}
}

/**
 * Consume a runOperation() generator and return the final result.
 * For synchronous (non-SSE) endpoints.
 *
 * NOTE: for-await-of discards generator return values.
 * We use manual .next() iteration to capture the return.
 */
export async function collectResult<O>(
	gen: AsyncGenerator<PipelineEvent, O>,
): Promise<O> {
	let result: IteratorResult<PipelineEvent, O>;
	do {
		result = await gen.next();
	} while (!result.done);
	return result.value;
}
