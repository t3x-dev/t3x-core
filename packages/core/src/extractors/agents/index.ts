/**
 * Meaning Pipeline Agents — each does ONE focused job.
 *
 * LLM agents: topic_namer, slot_polisher, dedup_checker, topic_evolver
 * Code agents: nester
 *
 * Order matters — nester runs before namer (needs flat frames to nest first).
 */

export { nesterAgent } from './nesterAgent';
export { topicNamerAgent } from './topicNamerAgent';
export { slotPolisherAgent } from './slotPolisherAgent';
export { dedupCheckerAgent } from './dedupCheckerAgent';
export { topicEvolverAgent } from './topicEvolverAgent';
