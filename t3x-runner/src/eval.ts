import type {
  RunTrace,
  TestStep,
  TestResult,
  EvalRequest,
  EvalResponse
} from './types.js';

/**
 * Eval Engine - Runs test steps against agent traces
 *
 * Supports assertion types:
 * - contains: output contains string
 * - not_contains: output does not contain string
 * - regex: output matches regex pattern
 * - json_path: JSON path exists and optionally matches value
 * - semantic: semantic similarity threshold (uses t3x-core)
 * - custom: custom JavaScript function
 */

export class EvalEngine {
  /**
   * Run evaluation against a trace
   */
  async evaluate(request: EvalRequest): Promise<EvalResponse> {
    const trace = request.trace;
    if (!trace) {
      throw new Error('Trace is required for evaluation');
    }

    const results: TestResult[] = [];
    const options = request.options ?? {};

    for (const step of request.test_steps) {
      const result = await this.runStep(step, trace);
      results.push(result);

      if (!result.passed && options.stop_on_first_failure) {
        break;
      }
    }

    const passedSteps = results.filter(r => r.passed).length;
    const failedSteps = results.filter(r => !r.passed && r.severity === 'error').length;

    const response: EvalResponse = {
      run_id: trace.run_id,
      passed: failedSteps === 0,
      total_steps: results.length,
      passed_steps: passedSteps,
      failed_steps: failedSteps,
      results,
    };

    // Generate suggestions if requested
    if (options.generate_suggestions && failedSteps > 0) {
      response.suggestions = this.generateSuggestions(results, trace);
    }

    return response;
  }

  /**
   * Run a single test step
   */
  private async runStep(step: TestStep, trace: RunTrace): Promise<TestResult> {
    const baseResult: TestResult = {
      step_id: step.id,
      step_name: step.name,
      passed: false,
      severity: step.severity,
    };

    try {
      const targetValue = this.getTargetValue(step.target, trace);

      switch (step.type) {
        case 'contains':
          return this.assertContains(baseResult, targetValue, step.assertion.value!, false);

        case 'not_contains':
          return this.assertContains(baseResult, targetValue, step.assertion.value!, true);

        case 'regex':
          return this.assertRegex(baseResult, targetValue, step.assertion.pattern!);

        case 'json_path':
          return this.assertJsonPath(baseResult, targetValue, step.assertion.path!, step.assertion.value);

        case 'semantic':
          return await this.assertSemantic(baseResult, targetValue, step.assertion.value!, step.assertion.threshold ?? 0.8);

        case 'custom':
          return await this.assertCustom(baseResult, targetValue, step.assertion.fn!, trace);

        default:
          return {
            ...baseResult,
            message: `Unknown assertion type: ${step.type}`,
          };
      }
    } catch (error) {
      return {
        ...baseResult,
        message: `Error running step: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get the target value based on step target
   */
  private getTargetValue(target: TestStep['target'], trace: RunTrace): unknown {
    switch (target) {
      case 'input':
        return trace.input;
      case 'output':
        return trace.output;
      case 'llm_call':
        return trace.events.filter(e => e.type === 'llm_call');
      case 'tool_call':
        return trace.events.filter(e => e.type === 'tool_call');
      case 'trace':
        return trace;
      default:
        throw new Error(`Unknown target: ${target}`);
    }
  }

  /**
   * Assert contains/not_contains
   */
  private assertContains(
    result: TestResult,
    value: unknown,
    expected: string,
    negate: boolean
  ): TestResult {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const contains = stringValue.includes(expected);
    const passed = negate ? !contains : contains;

    return {
      ...result,
      passed,
      expected: negate ? `not contain "${expected}"` : `contain "${expected}"`,
      actual: contains ? 'contains' : 'does not contain',
      message: passed ? undefined : `Expected output to ${negate ? 'not ' : ''}contain "${expected}"`,
    };
  }

  /**
   * Assert regex match
   */
  private assertRegex(
    result: TestResult,
    value: unknown,
    pattern: string
  ): TestResult {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const regex = new RegExp(pattern);
    const passed = regex.test(stringValue);

    return {
      ...result,
      passed,
      expected: `match pattern /${pattern}/`,
      actual: passed ? 'matches' : 'does not match',
      message: passed ? undefined : `Expected output to match pattern /${pattern}/`,
    };
  }

  /**
   * Assert JSON path exists and optionally matches value
   */
  private assertJsonPath(
    result: TestResult,
    value: unknown,
    path: string,
    expected?: string
  ): TestResult {
    const obj = typeof value === 'object' ? value : JSON.parse(String(value));
    const actual = this.getByPath(obj, path);

    if (actual === undefined) {
      return {
        ...result,
        passed: false,
        expected: `path "${path}" to exist`,
        actual: 'path not found',
        message: `JSON path "${path}" not found`,
      };
    }

    if (expected !== undefined) {
      const passed = String(actual) === expected;
      return {
        ...result,
        passed,
        expected,
        actual: String(actual),
        message: passed ? undefined : `Expected ${path} to be "${expected}", got "${actual}"`,
      };
    }

    return {
      ...result,
      passed: true,
      expected: `path "${path}" to exist`,
      actual: String(actual),
    };
  }

  /**
   * Get value by dot-notation path
   */
  private getByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Assert semantic similarity (uses t3x-core embeddings)
   */
  private async assertSemantic(
    result: TestResult,
    value: unknown,
    expected: string,
    threshold: number
  ): Promise<TestResult> {
    // TODO: Integrate with t3x-core embedding provider
    // For now, use simple string similarity as placeholder
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const similarity = this.simpleSimilarity(stringValue, expected);
    const passed = similarity >= threshold;

    return {
      ...result,
      passed,
      expected: `semantic similarity >= ${threshold}`,
      actual: `similarity = ${similarity.toFixed(3)}`,
      message: passed ? undefined : `Semantic similarity ${similarity.toFixed(3)} below threshold ${threshold}`,
      suggestion: passed ? undefined : `Consider adjusting prompt to better match: "${expected}"`,
    };
  }

  /**
   * Simple string similarity (placeholder for semantic)
   */
  private simpleSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }

  /**
   * Assert custom function
   */
  private async assertCustom(
    result: TestResult,
    value: unknown,
    fn: string,
    trace: RunTrace
  ): Promise<TestResult> {
    try {
      // Create a safe function from string
      // Note: In production, this should be sandboxed
      const assertFn = new Function('value', 'trace', fn);
      const passed = Boolean(await assertFn(value, trace));

      return {
        ...result,
        passed,
        message: passed ? undefined : 'Custom assertion failed',
      };
    } catch (error) {
      return {
        ...result,
        passed: false,
        message: `Custom assertion error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Generate suggestions based on failed tests
   */
  private generateSuggestions(
    results: TestResult[],
    trace: RunTrace
  ): EvalResponse['suggestions'] {
    const suggestions: NonNullable<EvalResponse['suggestions']> = [];
    const failedResults = results.filter(r => !r.passed);

    for (const result of failedResults) {
      if (result.suggestion) {
        suggestions.push({
          type: 'prompt_change',
          description: result.suggestion,
          confidence: 0.7,
        });
      }

      // Auto-generate suggestions based on failure type
      if (result.expected && result.actual) {
        suggestions.push({
          type: 'prompt_change',
          description: `Test "${result.step_name}" failed: expected ${result.expected}, got ${result.actual}`,
          confidence: 0.5,
        });
      }
    }

    return suggestions;
  }
}

// Singleton instance
export const evalEngine = new EvalEngine();
