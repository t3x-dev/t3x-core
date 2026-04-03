/**
 * extractOp — unified pipeline operation for semantic extraction.
 *
 * Wraps the existing `runExtractionPipeline()` async generator as an Operation.
 * The SSE route continues to call runExtractionPipeline directly (it needs raw
 * extraction events for the frontend). This op provides a convenient entry point
 * for non-SSE callers (batch endpoints, tests, future orchestration).
 *
 * Steps:
 *   extract — delegates to runExtractionPipeline, re-yields events
 */

import type { Operation, PipelineEvent } from '@t3x-dev/core';
import {
	runExtractionPipeline,
	type ExtractionPipelineParams,
	type PipelineEvent as ExtractionEvent,
} from '../lib/extraction-pipeline';
import type { ApiPipelineContext } from './context';

export interface ExtractInput {
	conversationId: string;
	turnHashes?: string[];
	driftDecision?: { choice: string; relation?: string; new_topic?: string };
	topicId?: string;
	forceExtract?: boolean;
}

export interface ExtractOutput {
	/** All extraction events collected during the pipeline run. */
	events: ExtractionEvent[];
	/** The final 'done' event containing the snapshot, if the pipeline completed. */
	finalEvent?: ExtractionEvent;
}

export const extractOp: Operation<ExtractInput, ExtractOutput> = {
	name: 'extract',
	async *run(input: ExtractInput, ctx): AsyncGenerator<PipelineEvent, ExtractOutput> {
		const { conversationId, turnHashes, driftDecision, topicId, forceExtract } = input;
		const { projectId, userId } = ctx as ApiPipelineContext;

		yield { type: 'step_start', step: 'extract', timestamp: Date.now() };

		const events: ExtractionEvent[] = [];
		let finalEvent: ExtractionEvent | undefined;

		const params: ExtractionPipelineParams = {
			conversationId,
			projectId,
			turnHashes,
			driftDecision,
			topicId,
			forceExtract,
			userId,
		};

		const pipeline = runExtractionPipeline(params);

		for await (const event of pipeline) {
			events.push(event);

			// Re-yield each extraction event as a step_done with the extraction
			// event type as the step name and its data in the data field.
			yield {
				type: 'step_done',
				step: event.type,
				data: event.data,
				timestamp: Date.now(),
			};

			if (event.type === 'done') {
				finalEvent = event;
			}
		}

		yield { type: 'step_done', step: 'extract', timestamp: Date.now() };

		return { events, finalEvent };
	},
};
