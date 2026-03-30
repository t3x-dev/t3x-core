/**
 * Meaning Pipeline Agents — each does ONE focused job.
 *
 * Code agents: output_regulator, fuzzy_quote_validator, dedup_checker,
 *              nester, contradiction_checker, regression_checker,
 *              structural_validator, source_trace_validator
 * LLM agents: topic_namer, coverage_checker
 *
 * Order matters — see createMeaningPipeline.ts for execution order.
 */

// Code agents
export { outputRegulatorAgent } from './outputRegulatorAgent';
export { fuzzyQuoteValidatorAgent } from './fuzzyQuoteValidator';
export { dedupCheckerAgent } from './dedupCheckerAgent';
export { nesterAgent } from './nesterAgent';
export { contradictionCheckerAgent } from './contradictionCheckerAgent';
export { regressionCheckerAgent } from './regressionCheckerAgent';
export { structuralValidatorAgent } from './structuralValidatorAgent';
export { sourceTraceValidatorAgent } from './sourceTraceValidatorAgent';

// LLM agents (kept — lightweight and additive)
export { topicNamerAgent } from './topicNamerAgent';
export { coverageCheckerAgent } from './coverageCheckerAgent';

