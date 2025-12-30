/**
 * LLM Asserter - Generates assertions from eval results and evidence
 *
 * This module uses an LLM to analyze eval results and generate:
 * - Structured assertions (pass/fail with evidence refs)
 * - Improvement suggestions (patch_suggestion)
 * - Confidence scores
 */

import Anthropic from '@anthropic-ai/sdk';
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

// ============================================
// Types
// ============================================

export interface EvidencePack {
  n8n_output?: Record<string, unknown>;
  n8n_meta?: { latency_ms?: number; tokens?: number };
  error?: string | null;
  trace_events?: unknown[];
}

export interface RunReport {
  output?: Record<string, unknown>;
  meta?: { latency_ms?: number; tokens?: number };
}

export interface EvalMetrics {
  correctness?: number;  // 0-1: Did output meet expectations?
  coverage?: number;     // 0-1: Were all expected behaviors present?
  efficiency?: number;   // 0-1: Resource usage (time, tokens)
}

export interface Assertion {
  id: string;
  type: 'pass' | 'fail' | 'warning';
  category: 'correctness' | 'coverage' | 'efficiency' | 'behavior' | 'error';
  message: string;
  evidence_refs: string[];  // References to evidence (e.g., "n8n_output.text")
  confidence: number;       // 0-1
  patch_suggestion?: string; // Suggested fix
}

export interface AssertionResult {
  run_id: string;
  assertions: Assertion[];
  metrics: EvalMetrics;
  summary: string;
  generated_at: string;
}

export interface GenerateAssertionsInput {
  run_id: string;
  leaf?: {
    id: string;
    type: 'deploy' | 'eval';
    content?: string;  // JSON string with eval rules
  };
  inputs?: Record<string, unknown>;
  run_report: RunReport;
  evidence_pack: EvidencePack;
  eval_rules?: {
    expected_output?: string;
    must_contain?: string[];
    must_not_contain?: string[];
    custom_checks?: string[];
  };
}

// ============================================
// LLM Asserter Class
// ============================================

export class LLMAsserter {
  private client: Anthropic | null = null;
  private model = 'claude-sonnet-4-20250514';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      logger.info('LLM Asserter initialized with Anthropic API');
    } else {
      logger.warn('ANTHROPIC_API_KEY not set, LLM assertions will use fallback mode');
    }
  }

  /**
   * Generate assertions from run results
   */
  async generateAssertions(input: GenerateAssertionsInput): Promise<AssertionResult> {
    const startTime = Date.now();

    // If no API key, use rule-based fallback
    if (!this.client) {
      return this.generateFallbackAssertions(input);
    }

    try {
      // Build prompt for LLM
      const prompt = this.buildPrompt(input);

      // Call LLM
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse LLM response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const result = this.parseLLMResponse(content.text, input.run_id);

      const latencyMs = Date.now() - startTime;
      logger.info({ run_id: input.run_id, latency_ms: latencyMs, assertions_count: result.assertions.length }, 'LLM assertions generated');

      return result;
    } catch (error) {
      logger.error({ run_id: input.run_id, error: String(error) }, 'LLM assertion generation failed, using fallback');
      return this.generateFallbackAssertions(input);
    }
  }

  /**
   * Build prompt for LLM
   */
  private buildPrompt(input: GenerateAssertionsInput): string {
    const { run_id, leaf, inputs, run_report, evidence_pack, eval_rules } = input;

    return `You are an AI agent evaluator. Analyze the following run results and generate structured assertions.

## Run Information
- Run ID: ${run_id}
- Leaf ID: ${leaf?.id || 'unknown'}
- Leaf Type: ${leaf?.type || 'unknown'}

## Input
${JSON.stringify(inputs || {}, null, 2)}

## Output (from n8n workflow)
${JSON.stringify(run_report.output || evidence_pack.n8n_output || {}, null, 2)}

## Evidence Pack
- Latency: ${evidence_pack.n8n_meta?.latency_ms || run_report.meta?.latency_ms || 'unknown'}ms
- Error: ${evidence_pack.error || 'none'}

${eval_rules ? `## Evaluation Rules
- Expected Output: ${eval_rules.expected_output || 'not specified'}
- Must Contain: ${eval_rules.must_contain?.join(', ') || 'none'}
- Must Not Contain: ${eval_rules.must_not_contain?.join(', ') || 'none'}
- Custom Checks: ${eval_rules.custom_checks?.join(', ') || 'none'}` : ''}

## Task
Analyze the run and generate assertions. For each assertion, provide:
1. Type: pass, fail, or warning
2. Category: correctness, coverage, efficiency, behavior, or error
3. Message: Clear description of what was checked and the result
4. Evidence refs: JSON paths to relevant evidence (e.g., "n8n_output.text")
5. Confidence: 0-1 score
6. Patch suggestion: If failed, suggest how to fix it

Also calculate overall metrics:
- Correctness (0-1): Did output meet expectations?
- Coverage (0-1): Were all expected behaviors present?
- Efficiency (0-1): Was resource usage reasonable?

Respond in JSON format:
{
  "assertions": [
    {
      "id": "assertion-1",
      "type": "pass|fail|warning",
      "category": "correctness|coverage|efficiency|behavior|error",
      "message": "...",
      "evidence_refs": ["..."],
      "confidence": 0.9,
      "patch_suggestion": "..." // optional, only for failures
    }
  ],
  "metrics": {
    "correctness": 0.8,
    "coverage": 0.9,
    "efficiency": 0.7
  },
  "summary": "Brief summary of the evaluation results"
}`;
  }

  /**
   * Parse LLM response into structured result
   */
  private parseLLMResponse(text: string, runId: string): AssertionResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      return {
        run_id: runId,
        assertions: parsed.assertions || [],
        metrics: parsed.metrics || {},
        summary: parsed.summary || '',
        generated_at: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to parse LLM response');

      // Return minimal result on parse failure
      return {
        run_id: runId,
        assertions: [
          {
            id: 'parse-error',
            type: 'warning',
            category: 'error',
            message: 'Failed to parse LLM response',
            evidence_refs: [],
            confidence: 0.5,
          },
        ],
        metrics: {},
        summary: 'LLM response parsing failed',
        generated_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Fallback rule-based assertions (when no API key)
   */
  private generateFallbackAssertions(input: GenerateAssertionsInput): AssertionResult {
    const { run_id, run_report, evidence_pack } = input;
    const assertions: Assertion[] = [];
    const output = run_report.output || evidence_pack.n8n_output || {};

    // Check 1: Output exists
    assertions.push({
      id: 'check-output-exists',
      type: Object.keys(output).length > 0 ? 'pass' : 'fail',
      category: 'correctness',
      message: Object.keys(output).length > 0
        ? 'Output is not empty'
        : 'Output is empty or missing',
      evidence_refs: ['n8n_output'],
      confidence: 0.9,
    });

    // Check 2: No error
    assertions.push({
      id: 'check-no-error',
      type: evidence_pack.error ? 'fail' : 'pass',
      category: 'error',
      message: evidence_pack.error
        ? `Error occurred: ${evidence_pack.error}`
        : 'No errors during execution',
      evidence_refs: ['evidence_pack.error'],
      confidence: 0.95,
      patch_suggestion: evidence_pack.error ? 'Review workflow error handling' : undefined,
    });

    // Check 3: Reasonable latency
    const latencyMs = evidence_pack.n8n_meta?.latency_ms || run_report.meta?.latency_ms || 0;
    assertions.push({
      id: 'check-latency',
      type: latencyMs < 10000 ? 'pass' : 'warning',
      category: 'efficiency',
      message: latencyMs < 10000
        ? `Latency acceptable: ${latencyMs}ms`
        : `High latency: ${latencyMs}ms`,
      evidence_refs: ['n8n_meta.latency_ms'],
      confidence: 0.8,
    });

    // Calculate metrics
    const passCount = assertions.filter(a => a.type === 'pass').length;
    const metrics: EvalMetrics = {
      correctness: evidence_pack.error ? 0.0 : (Object.keys(output).length > 0 ? 0.8 : 0.2),
      coverage: passCount / assertions.length,
      efficiency: latencyMs < 5000 ? 0.9 : latencyMs < 10000 ? 0.6 : 0.3,
    };

    return {
      run_id,
      assertions,
      metrics,
      summary: `Fallback evaluation: ${passCount}/${assertions.length} checks passed`,
      generated_at: new Date().toISOString(),
    };
  }
}

// Singleton instance
export const llmAsserter = new LLMAsserter();
