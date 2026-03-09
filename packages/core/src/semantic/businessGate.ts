/**
 * Business Gate (Gate 3) — Configurable rule system
 *
 * Supports:
 * - Deterministic rules: JavaScript expressions evaluated against frames/relations
 * - LLM-based checks: Prompt-based evaluation using an LLM provider
 *
 * @see docs/plans/core-engine/09-gate-and-ci.md §Gate 3
 */

import type { LLMProvider } from '../llm/types';
import type { BusinessGateResult, BusinessRuleConfig, SemanticContent } from './types';

/**
 * Parse and validate a business rules configuration array.
 * Accepts `BusinessRuleConfig[]` directly (JSON format for v1).
 *
 * @throws Error if any rule is missing required fields
 */
export function parseGatesConfig(rules: BusinessRuleConfig[]): BusinessRuleConfig[] {
  if (!Array.isArray(rules)) {
    throw new Error('Business gates config must be an array');
  }
  for (const rule of rules) {
    if (!rule.id || typeof rule.id !== 'string') {
      throw new Error('Each business rule must have a string "id"');
    }
    if (rule.type !== 'rule' && rule.type !== 'llm') {
      throw new Error(`Rule "${rule.id}": type must be "rule" or "llm", got "${rule.type}"`);
    }
    if (rule.severity !== 'error' && rule.severity !== 'warning') {
      throw new Error(
        `Rule "${rule.id}": severity must be "error" or "warning", got "${rule.severity}"`
      );
    }
    if (rule.type === 'rule' && !rule.rule) {
      throw new Error(`Rule "${rule.id}": type "rule" requires a "rule" expression`);
    }
    if (rule.type === 'llm' && !rule.prompt) {
      throw new Error(`Rule "${rule.id}": type "llm" requires a "prompt"`);
    }
  }
  return rules;
}

/**
 * Evaluate a single deterministic rule expression against semantic content.
 *
 * The expression has access to `frames` and `relations` variables.
 * It should return a truthy value to pass.
 */
export function evaluateRule(
  rule: BusinessRuleConfig,
  content: SemanticContent
): { passed: boolean; message?: string } {
  if (rule.type !== 'rule' || !rule.rule) {
    return { passed: false, message: 'Not a deterministic rule' };
  }

  try {
    // Create a sandboxed function that only exposes frames and relations
    const fn = new Function('frames', 'relations', `"use strict"; return (${rule.rule});`);
    const result = fn(content.frames, content.relations);
    if (result) {
      return { passed: true };
    }
    return { passed: false, message: rule.message ?? `Rule "${rule.id}" failed` };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      passed: false,
      message: `Rule "${rule.id}" threw an error: ${errMsg}`,
    };
  }
}

/**
 * Business Gate evaluator.
 *
 * Evaluates a set of business rules (deterministic + LLM) against semantic content.
 * An LLMProvider is only needed when rules of type 'llm' are present.
 */
export class BusinessGate {
  private provider?: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Evaluate all rules against the given semantic content.
   *
   * - `type: 'rule'` — deterministic JS expression
   * - `type: 'llm'` — LLM prompt (requires provider; skipped with warning if absent)
   *
   * `passed` is true when no rule with severity 'error' has failed.
   * Warnings do not block.
   */
  async evaluate(
    rules: BusinessRuleConfig[],
    content: SemanticContent
  ): Promise<BusinessGateResult> {
    const results: BusinessGateResult['results'] = [];

    for (const rule of rules) {
      if (rule.type === 'rule') {
        const result = evaluateRule(rule, content);
        results.push({
          rule_id: rule.id,
          passed: result.passed,
          message: result.message,
          severity: rule.severity,
        });
      } else if (rule.type === 'llm') {
        if (!this.provider) {
          results.push({
            rule_id: rule.id,
            passed: true,
            message: 'Skipped: no LLM provider available',
            severity: rule.severity,
          });
          continue;
        }

        try {
          const prompt = this.buildLLMPrompt(rule, content);
          const response = await this.provider.generate(prompt, {
            temperature: 0.1,
            maxTokens: 256,
          });
          const passed = this.parseLLMResponse(response);
          results.push({
            rule_id: rule.id,
            passed,
            message: passed
              ? undefined
              : (rule.message ?? `LLM check "${rule.id}" failed: ${response.slice(0, 200)}`),
            severity: rule.severity,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          results.push({
            rule_id: rule.id,
            passed: false,
            message: `LLM check "${rule.id}" error: ${errMsg}`,
            severity: rule.severity,
          });
        }
      }
    }

    // passed = no 'error' severity failures
    const passed = results.every((r) => r.passed || r.severity === 'warning');

    return { passed, results };
  }

  /** Build the prompt sent to the LLM for an llm-type rule */
  private buildLLMPrompt(rule: BusinessRuleConfig, content: SemanticContent): string {
    const framesJson = JSON.stringify(content.frames, null, 2);
    const relationsJson = JSON.stringify(content.relations, null, 2);
    return [
      rule.prompt,
      '',
      '## Semantic Content',
      '',
      '### Frames',
      framesJson,
      '',
      '### Relations',
      relationsJson,
      '',
      'Answer with "yes" if the check passes, or "no" followed by an explanation if it fails.',
    ].join('\n');
  }

  /** Parse LLM yes/no response */
  private parseLLMResponse(response: string): boolean {
    const trimmed = response.trim().toLowerCase();
    if (trimmed.startsWith('yes')) return true;
    if (trimmed.startsWith('no')) return false;
    // If unclear, treat as failed
    return false;
  }
}
