/**
 * Meaning Pipeline Agents — each does ONE focused job.
 *
 * Code agents: output_regulator, nester
 * LLM agents: dedup_checker, topic_namer, topic_evolver, slot_polisher,
 *             reviewer, coverage_checker, contradiction_checker
 *
 * Order matters — see createMeaningPipeline.ts for execution order.
 */

export { contradictionCheckerAgent } from './contradictionCheckerAgent';
export { coverageCheckerAgent } from './coverageCheckerAgent';
// LLM agents (focused, one job each)
export { dedupCheckerAgent } from './dedupCheckerAgent';
export { nesterAgent } from './nesterAgent';
// Code agents (deterministic, run first)
export { outputRegulatorAgent } from './outputRegulatorAgent';
export { reviewerAgent } from './reviewerAgent';
export { slotPolisherAgent } from './slotPolisherAgent';
export { topicEvolverAgent } from './topicEvolverAgent';
export { topicNamerAgent } from './topicNamerAgent';
