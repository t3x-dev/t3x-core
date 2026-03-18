/**
 * Factory for creating a pre-configured MeaningPipeline.
 *
 * Registers all default agents in the correct order.
 * Each agent decides independently whether to run via shouldRun().
 */

import type { LLMProvider } from '../llm/types';
import {
  contradictionCheckerAgent,
  coverageCheckerAgent,
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
 * 8. coverage_checker (LLM) — verify all user points are captured, auto-add missing
 * 9. contradiction_checker (LLM) — detect and remove content contradicting user statements
 *
 * After each step, a snapshot is saved for human review.
 */
export function createMeaningPipeline(provider: LLMProvider): MeaningPipeline {
  return new MeaningPipeline(provider)
    .register(outputRegulatorAgent) // CODE: fix duplicates first
    .register(dedupCheckerAgent) // LLM: semantic dedup
    .register(nesterAgent) // CODE: build tree
    .register(topicNamerAgent) // LLM: name root topic
    .register(topicEvolverAgent) // LLM: evolve topic name
    .register(slotPolisherAgent) // LLM: clean up slots
    .register(reviewerAgent) // LLM: quality gate
    .register(coverageCheckerAgent) // LLM: check coverage
    .register(contradictionCheckerAgent); // LLM: check contradictions
}
