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
  outputRegulatorAgent,
  reviewerAgent,
  slotPolisherAgent,
  topicEvolverAgent,
  topicNamerAgent,
} from './agents';
import { MeaningPipeline } from './meaningPipeline';

/**
 * Create the default meaning pipeline with all agents.
 *
 * Agent execution order (agents decide independently whether to run):
 * 1. output_regulator (CODE) — consolidate duplicate frame types into arrays
 * 2. dedup_checker (LLM) — find and merge semantically duplicate frames
 * 3. nester (CODE) — build nested tree from relations
 * 4. topic_namer (LLM) — name the root topic (first extraction)
 * 5. topic_evolver (LLM) — update topic name (delta updates)
 * 6. slot_polisher (LLM) — clean up slot names and values
 * 7. reviewer (LLM) — quality gate: review structure, flag issues, auto-fix
 *
 * After each step, a snapshot is saved for human review.
 */
export function createMeaningPipeline(provider: LLMProvider): MeaningPipeline {
  return new MeaningPipeline(provider)
    .register(outputRegulatorAgent)  // CODE: fix duplicates first
    .register(dedupCheckerAgent)     // LLM: semantic dedup
    .register(nesterAgent)           // CODE: build tree
    .register(topicNamerAgent)       // LLM: name root topic
    .register(topicEvolverAgent)     // LLM: evolve topic name
    .register(slotPolisherAgent)     // LLM: clean up slots
    .register(reviewerAgent);        // LLM: quality gate
}
