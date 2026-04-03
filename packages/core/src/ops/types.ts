/**
 * A PipelineEvent is yielded by Operations during execution.
 * All events flow through yield only — no separate emit callback.
 */
export type PipelineEvent = {
	type:
		| 'op_start'
		| 'op_done'
		| 'op_error'
		| 'step_start'
		| 'step_done'
		| 'step_error';
	op?: string;
	step?: string;
	timestamp?: number;
	error?: unknown;
	data?: unknown;
};

/**
 * Context passed to every Operation. Core defines the shape with unknown types
 * to avoid depending on storage. Concrete ops in packages/api narrow the types.
 */
export interface OpsPipelineContext {
	db: unknown;
	projectId: string;
	userId?: string;
	providerRegistry?: unknown;
	abortSignal?: AbortSignal;
}

/**
 * An Operation is a unit of work in the unified pipeline.
 * The run() generator yields PipelineEvents and returns a result.
 */
export interface Operation<TInput, TOutput> {
	name: string;
	run(
		input: TInput,
		ctx: OpsPipelineContext,
	): AsyncGenerator<PipelineEvent, TOutput>;
}
