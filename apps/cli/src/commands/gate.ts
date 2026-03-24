/**
 * Gate Commands
 *
 * Run quality gates (structure, semantic, business) on commit semantic content.
 */

import chalk from 'chalk';
import type { Command } from 'commander';
import { createSpinner, error, getApiUrl } from '../utils.js';

// ============================================================
// Types (mirror API response shapes)
// ============================================================

interface StructureGateResult {
  passed: boolean;
  checks: Record<string, boolean>;
}

interface DimensionResult {
  score: number;
  details: string;
}

interface SemanticIssue {
  severity: 'error' | 'warning' | 'info';
  frame_id?: string;
  dimension: string;
  description: string;
  suggestion?: string;
}

interface SemanticGateResult {
  passed: boolean;
  score: number;
  dimensions: Record<string, DimensionResult>;
  issues: SemanticIssue[];
}

interface BusinessRuleResult {
  rule_id: string;
  passed: boolean;
  message?: string;
  severity: 'error' | 'warning';
}

interface BusinessGateResult {
  passed: boolean;
  results: BusinessRuleResult[];
}

interface GateResult {
  passed: boolean;
  structure: StructureGateResult;
  semantic?: SemanticGateResult;
  business?: BusinessGateResult;
}

interface SemanticContent {
  frames: unknown[];
  relations: unknown[];
}

// ============================================================
// Helpers
// ============================================================

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(passed: boolean, ci: boolean): string {
  if (ci) return passed ? 'PASS' : 'FAIL';
  return passed ? chalk.green('✅') : chalk.red('❌');
}

function warnIcon(ci: boolean): string {
  if (ci) return 'WARN';
  return chalk.yellow('⚠️');
}

function formatGateLabel(name: string, ci: boolean): string {
  if (ci) return name;
  return chalk.bold(name);
}

function formatScore(score: number, ci: boolean): string {
  const text = score.toFixed(2);
  if (ci) return text;
  if (score >= 0.8) return chalk.green(text);
  if (score >= 0.6) return chalk.yellow(text);
  return chalk.red(text);
}

/**
 * Fetch a V4 commit from the API and extract its semantic content.
 */
async function fetchSemanticContent(apiUrl: string, commitHash: string): Promise<SemanticContent> {
  const encodedHash = encodeURIComponent(commitHash);
  const url = `${apiUrl}/v1/commits-v4/${encodedHash}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Failed to fetch commit ${commitHash}: ${msg}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    data: { semantic?: SemanticContent };
  };

  if (!json.success || !json.data) {
    throw new Error(`Unexpected API response for commit ${commitHash}`);
  }

  const semantic = json.data.semantic;
  if (!semantic || !semantic.frames || semantic.frames.length === 0) {
    throw new Error(
      `Commit ${commitHash} has no semantic content (frames). ` +
        'Gate check requires frames and relations.'
    );
  }

  return semantic;
}

/**
 * Call the gate check API endpoint.
 */
async function runGateCheck(
  apiUrl: string,
  content: SemanticContent,
  gates: string[]
): Promise<GateResult> {
  const url = `${apiUrl}/v1/gate/check`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, gates }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gate check failed: ${msg}`);
  }

  const json = (await res.json()) as { success: boolean; data: GateResult };

  if (!json.success || !json.data) {
    throw new Error('Unexpected API response from gate check');
  }

  return json.data;
}

/**
 * Print gate results to console.
 */
function printResults(result: GateResult, ci: boolean): void {
  console.log();

  // Gate 1: Structure
  const structLabel = formatGateLabel('Gate 1 (structure):', ci);
  const structStatus = statusIcon(result.structure.passed, ci);
  console.log(`${structLabel}  ${structStatus} ${result.structure.passed ? 'passed' : 'FAILED'}`);

  if (!result.structure.passed) {
    const failedChecks = Object.entries(result.structure.checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    for (const check of failedChecks) {
      const icon = ci ? 'FAIL' : chalk.red('✗');
      console.log(`  ${icon} ${check}`);
    }
  }

  // Gate 2: Semantic
  if (result.semantic) {
    const semLabel = formatGateLabel('Gate 2 (semantic):', ci);
    const semStatus = statusIcon(result.semantic.passed, ci);
    const scoreText = formatScore(result.semantic.score, ci);
    console.log(
      `${semLabel}  ${semStatus} ${result.semantic.passed ? 'passed' : 'FAILED'}, score: ${scoreText}`
    );

    // Print dimension scores
    for (const [dim, dimResult] of Object.entries(result.semantic.dimensions)) {
      const dimScore = formatScore(dimResult.score, ci);
      console.log(`  ${dim}: ${dimScore}`);
    }

    // Print issues if any
    if (result.semantic.issues.length > 0) {
      console.log();
      for (const issue of result.semantic.issues) {
        const icon =
          issue.severity === 'error'
            ? ci
              ? 'ERR'
              : chalk.red('✗')
            : issue.severity === 'warning'
              ? warnIcon(ci)
              : ci
                ? 'INFO'
                : chalk.blue('ℹ');
        const frameRef = issue.frame_id ? ` [${issue.frame_id}]` : '';
        console.log(`  ${icon} ${issue.description}${frameRef}`);
      }
    }
  } else {
    const semLabel = formatGateLabel('Gate 2 (semantic):', ci);
    console.log(`${semLabel}  skipped`);
  }

  // Gate 3: Business
  if (result.business) {
    const bizLabel = formatGateLabel('Gate 3 (business):', ci);
    const bizStatus = statusIcon(result.business.passed, ci);
    console.log(`${bizLabel}  ${bizStatus} ${result.business.passed ? 'passed' : 'FAILED'}`);

    for (const ruleResult of result.business.results) {
      const icon = ruleResult.passed
        ? statusIcon(true, ci)
        : ruleResult.severity === 'warning'
          ? warnIcon(ci)
          : statusIcon(false, ci);
      const msg = ruleResult.message ? `: ${ruleResult.message}` : '';
      console.log(`  ${icon} ${ruleResult.rule_id}${msg}`);
    }
  } else {
    const bizLabel = formatGateLabel('Gate 3 (business):', ci);
    console.log(`${bizLabel}  skipped (no rules configured)`);
  }

  // Overall result
  console.log();
  const overallLabel = ci ? 'Result:' : chalk.bold('Result:');
  const overallStatus = result.passed
    ? ci
      ? 'PASS'
      : chalk.green('PASS')
    : ci
      ? 'FAIL'
      : chalk.red('FAIL');
  console.log(`${overallLabel} ${overallStatus}`);
  console.log();
}

// ============================================================
// Command Registration
// ============================================================

export function registerGateCommands(program: Command): void {
  const gate = program.command('gate').description('Quality gate checks');

  gate
    .command('check [commit_hash]')
    .description('Run quality gates on a commit')
    .option('--structure-only', 'Only run Gate 1 (structure check)')
    .option('--ci', 'Non-interactive mode (plain output, exit codes)')
    .option('--fail-on <level>', 'Failure threshold: "error" (default) or "warning"', 'error')
    .option('--json', 'Output as JSON')
    .action(
      async (
        commitHash: string | undefined,
        options: {
          structureOnly?: boolean;
          ci?: boolean;
          failOn?: string;
          json?: boolean;
        }
      ) => {
        if (!commitHash) {
          error('Please provide a commit hash');
          process.exit(1);
        }

        const ciMode = options.ci ?? false;
        const apiUrl = getApiUrl();

        // Determine which gates to run
        const gates: string[] = options.structureOnly
          ? ['structure']
          : ['structure', 'semantic', 'business'];

        const spinner = ciMode || options.json ? null : createSpinner('Running gate checks...');
        spinner?.start();

        const startTime = Date.now();

        try {
          // 1. Fetch semantic content from commit
          const content = await fetchSemanticContent(apiUrl, commitHash);

          // 2. Run gate check via API
          const result = await runGateCheck(apiUrl, content, gates);

          const elapsed = Date.now() - startTime;

          spinner?.stop();

          // 3. JSON output mode
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.passed ? 0 : 1);
          }

          // 4. Print results
          printResults(result, ciMode);

          if (!ciMode) {
            console.log(chalk.dim(`Completed in ${formatMs(elapsed)}`));
          }

          // 5. Exit code for CI mode
          if (ciMode) {
            const hasWarnings = result.business?.results.some(
              (r) => !r.passed && r.severity === 'warning'
            );
            const hasErrors = !result.passed;

            if (hasErrors) {
              process.exit(1);
            }
            if (options.failOn === 'warning' && hasWarnings) {
              process.exit(1);
            }
            process.exit(0);
          } else if (!result.passed) {
            process.exit(1);
          }
        } catch (err) {
          spinner?.stop();
          error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );
}
