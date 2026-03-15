/**
 * Factory for creating a pre-configured MeaningPipeline.
 *
 * Registers all default agents in the correct order:
 * 1. dedup_checker (LLM) — merge duplicate frames
 * 2. nester (CODE) — build nested tree from relations
 * 3. topic_namer (LLM) — name the root topic (first extraction only)
 * 4. topic_evolver (LLM) — update topic name (delta updates only)
 * 5. slot_polisher (LLM) — clean up slot names/values
 *
 * Each agent decides independently whether to run via shouldRun().
 */

import type { LLMProvider } from '../llm/types';
import {
  dedupCheckerAgent,
  nesterAgent,
  slotPolisherAgent,
  topicEvolverAgent,
  topicNamerAgent,
} from './agents';
import { MeaningPipeline } from './meaningPipeline';

export function createMeaningPipeline(provider: LLMProvider): MeaningPipeline {
  return new MeaningPipeline(provider)
    .register(dedupCheckerAgent)
    .register(nesterAgent)
    .register(topicNamerAgent)
    .register(topicEvolverAgent)
    .register(slotPolisherAgent);
}
