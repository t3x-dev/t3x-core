/**
 * Factory for creating a pre-configured MeaningPipeline.
 *
 * v2: Simplified pipeline — 8 CODE agents + 2 LLM agents.
 * LLM agents removed: slot_polisher, reviewer, topic_evolver.
 * LLM agents converted to CODE: dedup_checker, contradiction_checker.
 * New CODE agent: fuzzy_quote_validator.
 */

import type { LLMProvider } from '../llm/types';
import {
  contradictionCheckerAgent,
  coverageCheckerAgent,
  dedupCheckerAgent,
  fuzzyQuoteValidatorAgent,
  nesterAgent,
  outputRegulatorAgent,
  regressionCheckerAgent,
  sourceTraceValidatorAgent,
  structuralValidatorAgent,
  topicNamerAgent,
} from './agents';
import { MeaningPipeline } from './meaningPipeline';

/**
 * Create the simplified meaning pipeline.
 *
 * Agent execution order:
 * 1.  output_regulator       (CODE) — consolidate duplicate frame types
 * 2.  fuzzy_quote_validator   (CODE) — validate source quotes, adjust confidence
 * 3.  dedup_checker           (CODE) — exact key + Jaccard similarity dedup
 * 4.  nester                  (CODE) — build nested tree from relations
 * 5.  topic_namer             (LLM)  — name root topic (first extraction only)
 * 6.  coverage_checker        (LLM)  — verify all user points captured, auto-add
 * 7.  contradiction_checker   (CODE) — flag (not delete) contradicting slots
 * 8.  regression_checker      (CODE) — detect significant content loss
 * 9.  structural_validator    (CODE) — validate structural integrity
 * 10. source_trace_validator  (CODE) — validate source references
 */
export function createMeaningPipeline(provider: LLMProvider): MeaningPipeline {
  return new MeaningPipeline(provider)
    .register(outputRegulatorAgent)
    .register(fuzzyQuoteValidatorAgent)
    .register(dedupCheckerAgent)
    .register(nesterAgent)
    .register(topicNamerAgent)
    .register(coverageCheckerAgent)
    .register(contradictionCheckerAgent)
    .register(regressionCheckerAgent)
    .register(structuralValidatorAgent)
    .register(sourceTraceValidatorAgent);
}
