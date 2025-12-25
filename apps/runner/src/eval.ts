import type {
  RunTrace,
  TestStep,
  TestResult,
  EvalRequest,
  EvalResponse
} from './types.js';

// Graybox trace event from agent (different from internal TraceEvent)
interface GrayboxTraceEvent {
  type: 'step' | 'tool_call' | 'tool_result' | 'error';
  name: string;
  ok: boolean;
  args?: Record<string, unknown>;
  result?: unknown;
  latency_ms?: number;
  error?: string;
}

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
    const options = {
      stop_on_first_failure: request.options?.stop_on_first_failure ?? false,
      generate_suggestions: request.options?.generate_suggestions ?? true,
    };

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

        case 'json_schema':
          return this.assertJsonSchema(baseResult, targetValue, step.assertion.schema!);

        case 'trace_must_call':
          return this.assertTraceMustCall(baseResult, trace, step.assertion.tool!);

        case 'trace_order':
          return this.assertTraceOrder(baseResult, trace, step.assertion.before!, step.assertion.after!);

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
   * Assert JSON schema validation
   */
  private assertJsonSchema(
    result: TestResult,
    value: unknown,
    schema: Record<string, unknown>
  ): TestResult {
    try {
      const obj = typeof value === 'object' ? value : JSON.parse(String(value));
      const errors = this.validateJsonSchema(obj, schema);

      if (errors.length === 0) {
        return {
          ...result,
          passed: true,
          expected: 'match JSON schema',
          actual: 'valid',
        };
      }

      return {
        ...result,
        passed: false,
        expected: 'match JSON schema',
        actual: errors.join('; '),
        message: `Schema validation failed: ${errors.join('; ')}`,
        suggestion: 'Ensure output structure matches the expected schema',
      };
    } catch (error) {
      return {
        ...result,
        passed: false,
        message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Simple JSON schema validator (subset of JSON Schema)
   * For production, use ajv or zod
   */
  private validateJsonSchema(obj: unknown, schema: Record<string, unknown>, path = ''): string[] {
    const errors: string[] = [];

    if (schema.type) {
      const actualType = Array.isArray(obj) ? 'array' : typeof obj;
      if (schema.type !== actualType) {
        errors.push(`${path || 'root'}: expected ${schema.type}, got ${actualType}`);
        return errors;
      }
    }

    if (schema.const !== undefined && obj !== schema.const) {
      errors.push(`${path || 'root'}: expected const "${schema.const}", got "${obj}"`);
    }

    if (schema.required && Array.isArray(schema.required) && typeof obj === 'object' && obj !== null) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) {
          errors.push(`${path || 'root'}: missing required property "${key}"`);
        }
      }
    }

    if (schema.properties && typeof obj === 'object' && obj !== null) {
      const props = schema.properties as Record<string, Record<string, unknown>>;
      for (const [key, propSchema] of Object.entries(props)) {
        if (key in obj) {
          const propErrors = this.validateJsonSchema(
            (obj as Record<string, unknown>)[key],
            propSchema,
            path ? `${path}.${key}` : key
          );
          errors.push(...propErrors);
        }
      }
    }

    if (schema.minLength && typeof obj === 'string' && obj.length < (schema.minLength as number)) {
      errors.push(`${path || 'root'}: string length ${obj.length} < minLength ${schema.minLength}`);
    }

    return errors;
  }

  /**
   * Assert that a tool was called in the trace
   */
  private assertTraceMustCall(
    result: TestResult,
    trace: RunTrace,
    toolName: string
  ): TestResult {
    // Check internal trace events
    const internalCalls = trace.events.filter(
      e => e.type === 'tool_call' && e.data.tool_name === toolName
    );

    // Check graybox trace_events in output (from agent response)
    const output = trace.output as { trace_events?: GrayboxTraceEvent[] } | null;
    const grayboxCalls = (output?.trace_events || []).filter(
      (e: GrayboxTraceEvent) => e.type === 'tool_call' && e.name === toolName
    );

    const found = internalCalls.length > 0 || grayboxCalls.length > 0;

    return {
      ...result,
      passed: found,
      expected: `tool "${toolName}" to be called`,
      actual: found ? 'called' : 'not called',
      message: found ? undefined : `Expected tool "${toolName}" to be called, but it was not`,
      suggestion: found ? undefined : `Ensure the agent calls the "${toolName}" tool`,
    };
  }

  /**
   * Assert tool call order: 'before' must be called before 'after'
   */
  private assertTraceOrder(
    result: TestResult,
    trace: RunTrace,
    before: string,
    after: string
  ): TestResult {
    // Get graybox trace_events from output
    const output = trace.output as { trace_events?: GrayboxTraceEvent[] } | null;
    const events = output?.trace_events || [];

    // Find indices of tool calls (or steps)
    let beforeIndex = -1;
    let afterIndex = -1;

    events.forEach((e: GrayboxTraceEvent, i: number) => {
      if ((e.type === 'tool_call' || e.type === 'step') && e.name === before && beforeIndex === -1) {
        beforeIndex = i;
      }
      if ((e.type === 'tool_call' || e.type === 'step') && e.name === after && afterIndex === -1) {
        afterIndex = i;
      }
    });

    // Also check internal events
    if (beforeIndex === -1 || afterIndex === -1) {
      trace.events.forEach((e, i) => {
        if (e.type === 'tool_call' && e.data.tool_name === before && beforeIndex === -1) {
          beforeIndex = i;
        }
        if (e.type === 'tool_call' && e.data.tool_name === after && afterIndex === -1) {
          afterIndex = i;
        }
      });
    }

    if (beforeIndex === -1) {
      return {
        ...result,
        passed: false,
        expected: `"${before}" before "${after}"`,
        actual: `"${before}" not found`,
        message: `"${before}" was not called`,
      };
    }

    if (afterIndex === -1) {
      return {
        ...result,
        passed: false,
        expected: `"${before}" before "${after}"`,
        actual: `"${after}" not found`,
        message: `"${after}" was not called`,
      };
    }

    const passed = beforeIndex < afterIndex;

    return {
      ...result,
      passed,
      expected: `"${before}" before "${after}"`,
      actual: passed ? 'correct order' : `"${after}" came first`,
      message: passed ? undefined : `Expected "${before}" before "${after}", but order was reversed`,
      suggestion: passed ? undefined : `Reorder agent steps: ${before} should happen before ${after}`,
    };
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
