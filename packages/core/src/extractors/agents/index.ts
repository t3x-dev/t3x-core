/**
 * Meaning Pipeline Agents — each does ONE focused job.
 *
 * LLM agents: topic_namer, slot_polisher, dedup_checker, topic_evolver
 * Code agents: nester
 *
 * Order matters — nester runs before namer (needs flat frames to nest first).
 */

export { dedupCheckerAgent } from './dedupCheckerAgent';
export { nesterAgent } from './nesterAgent';
// Code agents (deterministic, run first)
export { outputRegulatorAgent } from './outputRegulatorAgent';
export { reviewerAgent } from './reviewerAgent';
export { slotPolisherAgent } from './slotPolisherAgent';
export { topicEvolverAgent } from './topicEvolverAgent';
// LLM agents (focused, one job each)
export { topicNamerAgent } from './topicNamerAgent';
