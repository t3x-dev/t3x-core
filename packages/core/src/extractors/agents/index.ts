/**
 * Meaning Pipeline Agents — each does ONE focused job.
 *
 * Code agents: output_regulator, nester
 * LLM agents: dedup_checker, topic_namer, topic_evolver, slot_polisher,
 *             reviewer, coverage_checker, contradiction_checker
 *
 * Order matters — see createMeaningPipeline.ts for execution order.
 */

// Code agents (deterministic, run first)
export { outputRegulatorAgent } from './outputRegulatorAgent';
export { nesterAgent } from './nesterAgent';
// LLM agents (focused, one job each)
export { dedupCheckerAgent } from './dedupCheckerAgent';
export { topicNamerAgent } from './topicNamerAgent';
export { topicEvolverAgent } from './topicEvolverAgent';
export { slotPolisherAgent } from './slotPolisherAgent';
export { reviewerAgent } from './reviewerAgent';
export { coverageCheckerAgent } from './coverageCheckerAgent';
export { contradictionCheckerAgent } from './contradictionCheckerAgent';
