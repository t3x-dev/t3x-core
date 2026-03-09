/**
 * Gate Runner — Orchestrates the 3-layer quality gate system
 *
 * Gate 1: Structure (deterministic, always runs)
 * Gate 2: Semantic (LLM-based, optional)
 * Gate 3: Business (configurable rules, optional)
 *
 * @see docs/plans/core-engine/09-gate-and-ci.md
 */

import type { LLMProvider } from '../llm/types';
import { BusinessGate } from './businessGate';
import { SemanticGate } from './gate';
import type {
  BusinessGateResult,
  BusinessRuleConfig,
  GateResult,
  SemanticContent,
  SemanticGateResult,
  StructureGateResult,
} from './types';
import { checkRelationSanity, validateIntegrity } from './validate';

export interface GateRunnerOptions {
  provider?: LLMProvider; // needed for Gate 2 + LLM rules in Gate 3
  businessRules?: BusinessRuleConfig[]; // Gate 3 rules
  skipSemantic?: boolean; // skip Gate 2 (for fast checks)
  skipBusiness?: boolean; // skip Gate 3
  turns?: { role: string; content: string }[]; // needed for Gate 2
}

export class GateRunner {
  /**
   * Run all gates on semantic content.
   * Gate 1 always runs. Gates 2 and 3 are optional.
   */
  async run(content: SemanticContent, options: GateRunnerOptions = {}): Promise<GateResult> {
    // 1. Gate 1: Structure (always runs, deterministic)
    const structure = this.runStructureGate(content);
    if (!structure.passed) {
      return { passed: false, structure };
    }

    // 2. Gate 2: Semantic (optional, needs LLM + turns)
    let semantic: SemanticGateResult | undefined;
    if (!options.skipSemantic && options.provider && options.turns) {
      const gate = new SemanticGate(options.provider);
      semantic = await gate.review(options.turns, content);
    }

    // 3. Gate 3: Business (optional, needs rules)
    let business: BusinessGateResult | undefined;
    if (!options.skipBusiness && options.businessRules && options.businessRules.length > 0) {
      const gate = new BusinessGate(options.provider);
      business = await gate.evaluate(options.businessRules, content);
    }

    // Overall: passed if all run gates passed
    const passed = structure.passed && (semantic?.passed ?? true) && (business?.passed ?? true);

    return { passed, structure, semantic, business };
  }

  private runStructureGate(content: SemanticContent): StructureGateResult {
    const validation = validateIntegrity(content);
    // Also run relation sanity (produces warnings, not errors — informational)
    checkRelationSanity(content);

    // Map validation results to StructureGateResult checks
    const checks = {
      schema_valid: true, // assumed if we got this far (Zod validation happens upstream)
      refs_intact: !validation.errors.some((e) => e.type === 'broken_ref'),
      relations_valid: !validation.errors.some((e) => e.type === 'broken_relation'),
      no_cycles: !validation.errors.some((e) => e.type === 'cycle'),
      no_duplicate_ids: !validation.errors.some((e) => e.type === 'duplicate_id'),
      no_self_relations: !validation.errors.some((e) => e.type === 'self_relation'),
    };

    return {
      passed: validation.valid,
      checks,
    };
  }
}
