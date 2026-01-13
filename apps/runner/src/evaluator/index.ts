/**
 * Evaluation Engine
 *
 * Deterministic evaluation of RunRecords against EvalRules.
 * This is the core of the evaluation system - no LLM involved.
 */

import pino from 'pino';
import type { RunRecord } from '../schemas/run-record.js';
import type { EvalRules, Rule, RuleType } from '../schemas/eval-rules.js';
import type { EvalResult, CheckResult, Violation, DimensionScores } from '../schemas/eval-result.js';
import { runOperator, type OperatorOptions } from './operators.js';
import { parseRulesFromLeaf, DEFAULT_RULES, type LeafForRules } from './rule-parser.js';

/**
 * Mapping from rule.type to dimension_scores keys
 */
const RULE_TYPE_TO_DIMENSION: Record<RuleType, keyof DimensionScores> = {
  basic: 'task_completion',
  tool_use: 'tool_use',
  trajectory: 'trajectory_efficiency',
  cost: 'cost_efficiency',
  performance: 'latency',
};

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/**
 * Get value from object by dot-notation path
 *
 * @example
 * getByPath({ output: { result: 'hello' } }, 'output.result') // 'hello'
 * getByPath({ steps: [{ status: 'ok' }] }, 'steps') // [{ status: 'ok' }]
 */
function getByPath(obj: unknown, path: string): unknown {
  if (!path || path === '.') {
    return obj;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    // Handle array index notation: steps[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr)) {
        return undefined;
      }
      current = arr[parseInt(indexStr, 10)];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Calculate dimension scores from check results and rules
 *
 * Groups rules by their type and calculates weighted average for each dimension.
 * Dimensions without rules get a perfect score of 1.0 (not penalized).
 */
function calculateDimensionScores(
  checks: CheckResult[],
  rules: Rule[]
): DimensionScores {
  // Create a map of rule_id to rule for quick lookup
  const ruleMap = new Map<string, Rule>();
  for (const rule of rules) {
    ruleMap.set(rule.id, rule);
  }

  // Group checks by dimension
  const dimensionData: Record<keyof DimensionScores, { earned: number; total: number }> = {
    task_completion: { earned: 0, total: 0 },
    tool_use: { earned: 0, total: 0 },
    trajectory_efficiency: { earned: 0, total: 0 },
    cost_efficiency: { earned: 0, total: 0 },
    latency: { earned: 0, total: 0 },
  };

  // Aggregate scores by dimension
  for (const check of checks) {
    const rule = ruleMap.get(check.rule_id);
    if (!rule) continue;

    const ruleType = rule.type || 'basic';
    const dimension = RULE_TYPE_TO_DIMENSION[ruleType];

    dimensionData[dimension].total += rule.weight;
    dimensionData[dimension].earned += check.score;
  }

  // Calculate weighted average for each dimension
  // Dimensions without rules default to 1.0 (not penalized)
  const scores: DimensionScores = {
    task_completion: dimensionData.task_completion.total > 0
      ? dimensionData.task_completion.earned / dimensionData.task_completion.total
      : 1.0,
    tool_use: dimensionData.tool_use.total > 0
      ? dimensionData.tool_use.earned / dimensionData.tool_use.total
      : 1.0,
    trajectory_efficiency: dimensionData.trajectory_efficiency.total > 0
      ? dimensionData.trajectory_efficiency.earned / dimensionData.trajectory_efficiency.total
      : 1.0,
    cost_efficiency: dimensionData.cost_efficiency.total > 0
      ? dimensionData.cost_efficiency.earned / dimensionData.cost_efficiency.total
      : 1.0,
    latency: dimensionData.latency.total > 0
      ? dimensionData.latency.earned / dimensionData.latency.total
      : 1.0,
  };

  return scores;
}

/**
 * Build operator options from rule
 */
function buildOptions(rule: Rule): OperatorOptions {
  return {
    pattern: rule.pattern,
    min: rule.min,
    max: rule.max,
    condition: rule.condition,
  };
}

/**
 * Evaluate a single rule against a RunRecord
 */
function evaluateRule(record: RunRecord, rule: Rule): CheckResult {
  // Get actual value from target path
  const actual = getByPath(record, rule.target);

  // Run the operator check
  const options = buildOptions(rule);
  const passed = runOperator(rule.check, actual, rule.value, options);

  // Build check result
  const result: CheckResult = {
    rule_id: rule.id,
    passed,
    score: passed ? rule.weight : 0,
    actual,
    expected: rule.value ?? rule.condition ?? rule.pattern ?? { min: rule.min, max: rule.max },
    message: passed
      ? `Rule "${rule.name || rule.id}" passed`
      : `Rule "${rule.name || rule.id}" failed: ${rule.check} check on "${rule.target}"`,
  };

  return result;
}

/**
 * Evaluation Engine
 *
 * Evaluates RunRecords against EvalRules deterministically.
 */
export class EvalEngine {
  /**
   * Evaluate a RunRecord against rules
   *
   * @param record - The run record to evaluate
   * @param rules - The evaluation rules (optional, uses defaults if not provided)
   * @returns Deterministic evaluation result
   */
  evaluate(record: RunRecord, rules?: EvalRules): EvalResult {
    const evalRules = rules || DEFAULT_RULES;

    logger.debug(
      {
        run_id: record.run_id,
        rules_version: evalRules.version,
        rules_count: evalRules.rules.length,
      },
      'Starting evaluation'
    );

    const checks: CheckResult[] = [];
    const violations: Violation[] = [];

    // Evaluate each rule
    for (const rule of evalRules.rules) {
      const result = evaluateRule(record, rule);
      checks.push(result);

      // Collect violations for failed checks
      if (!result.passed) {
        violations.push({
          rule_id: rule.id,
          severity: rule.severity,
          message: result.message,
          // Try to identify which step caused the issue (if applicable)
          step_id: this.findCausingStep(record, rule),
        });
      }
    }

    // Calculate weighted score
    const totalWeight = evalRules.rules.reduce((sum, r) => sum + r.weight, 0);
    const earnedWeight = checks.reduce((sum, c) => sum + c.score, 0);
    const score = totalWeight > 0 ? earnedWeight / totalWeight : 0;

    // Calculate dimension scores
    const dimension_scores = calculateDimensionScores(checks, evalRules.rules);

    // Determine pass/fail based on threshold
    const passed = score >= evalRules.pass_threshold;

    const evalResult: EvalResult = {
      run_id: record.run_id,
      rules_version: evalRules.version,
      evaluated_at: new Date().toISOString(),
      passed,
      score,
      checks,
      violations,
      dimension_scores,
    };

    logger.info(
      {
        run_id: record.run_id,
        passed,
        score: score.toFixed(2),
        checks_passed: checks.filter((c) => c.passed).length,
        checks_failed: checks.filter((c) => !c.passed).length,
        violations_count: violations.length,
        dimension_scores: {
          task_completion: dimension_scores.task_completion.toFixed(2),
          tool_use: dimension_scores.tool_use.toFixed(2),
          trajectory_efficiency: dimension_scores.trajectory_efficiency.toFixed(2),
          cost_efficiency: dimension_scores.cost_efficiency.toFixed(2),
          latency: dimension_scores.latency.toFixed(2),
        },
      },
      'Evaluation complete'
    );

    return evalResult;
  }

  /**
   * Try to find which step caused a rule violation
   */
  private findCausingStep(record: RunRecord, rule: Rule): string | undefined {
    // If rule targets steps with error condition
    if (rule.target === 'steps' && rule.condition?.status === 'ok') {
      const failedStep = record.steps.find((s) => s.status === 'error');
      return failedStep?.step_id;
    }

    // If there's an error in the record, return that step
    if (record.error?.step_id) {
      return record.error.step_id;
    }

    return undefined;
  }

  /**
   * 使用 leaf 对象进行评测（推荐）
   *
   * 根据 leaf.rules_ref 从 resources/rules/ 目录加载规则文件
   * leaf.content 是给 n8n 的 prompt，不参与规则解析
   *
   * @param record - 运行记录（来自 n8n 执行结果）
   * @param leaf - Leaf 对象，包含 rules_ref 字段
   * @returns 评测结果
   */
  evaluateWithLeaf(
    record: RunRecord,
    leaf?: LeafForRules
  ): EvalResult {
    const rules = parseRulesFromLeaf(leaf);
    return this.evaluate(record, rules);
  }

  /**
   * @deprecated 请使用 evaluateWithLeaf() 代替
   *
   * 保留此方法是为了向后兼容，新代码请使用 evaluateWithLeaf()
   */
  evaluateWithLeafRules(record: RunRecord, _leafContent?: string): EvalResult {
    // 向后兼容：不再尝试解析 leafContent，直接使用默认规则
    return this.evaluateWithLeaf(record, undefined);
  }
}

// Default singleton instance
export const evalEngine = new EvalEngine();

// Re-export utilities
export {
  parseRulesFromLeaf,
  parseRulesFromJson,
  parseRulesFromYaml,
  loadRulesFromFile,
  loadDefaultRules,
  validateRules,
  DEFAULT_RULES,
  type LeafForRules,
} from './rule-parser.js';
export { runOperator, operators } from './operators.js';
export type { OperatorOptions, OperatorFn } from './operators.js';
