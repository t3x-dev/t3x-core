import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { type TestStep, TestStepSchema } from './types.js';

/**
 * Eval Suite - A collection of test cases for an agent
 */
export const EvalSuiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  agent_id: z.string(),
  cases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      input: z.string(),
      context: z.record(z.string(), z.unknown()).optional(),
      assertions: z.array(TestStepSchema),
    })
  ),
});

export type EvalSuite = z.infer<typeof EvalSuiteSchema>;
export type EvalCase = EvalSuite['cases'][number];

/**
 * Load a suite from a JSON file
 */
export function loadSuite(filePath: string): EvalSuite {
  const content = readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);
  return EvalSuiteSchema.parse(json);
}

/**
 * Load all suites from a directory
 */
export function loadSuites(dirPath: string): EvalSuite[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const files = readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  const suites: EvalSuite[] = [];

  for (const file of files) {
    try {
      const suite = loadSuite(join(dirPath, file));
      suites.push(suite);
    } catch (error) {
      console.error(`Failed to load suite ${file}:`, error);
    }
  }

  return suites;
}

/**
 * Get the default eval-suites directory path
 */
export function getDefaultSuitesPath(): string {
  // Relative to packages/runner
  return join(__dirname, '..', 'eval-suites');
}

/**
 * Convert an EvalCase to test steps for the eval engine
 */
export function caseToTestSteps(evalCase: EvalCase): TestStep[] {
  return evalCase.assertions;
}

/**
 * Suite runner result
 */
export interface SuiteRunResult {
  suite_id: string;
  suite_name: string;
  agent_id: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  case_results: Array<{
    case_id: string;
    case_name: string;
    passed: boolean;
    run_id?: string;
    error?: string;
    assertions: Array<{
      id: string;
      name: string;
      passed: boolean;
      message?: string;
    }>;
  }>;
}
