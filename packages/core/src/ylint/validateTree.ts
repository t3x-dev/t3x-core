/**
 * validateTree — entry point for built-in YAML tree hygiene validation.
 *
 * Runs ylint's 4 normal-form structural hygiene checks and returns a unified
 * result with warnings and auto-fix YOps.
 * The caller can auto-apply fixes via applyYOps() or surface them for review.
 */

import type { YOp } from '@t3x-dev/yops';
import type { SemanticContent } from '../semantic/types';
import { ylint } from './linter';
import type { LintConfig, LintWarning } from './types';

export interface ValidateTreeResult {
  /** True if no errors (warnings and info are ok). */
  valid: boolean;
  /** All ylint warnings. */
  warnings: LintWarning[];
  /** YOps operations that would fix auto-fixable issues. */
  fixes: YOp[];
  /** Number of issues that need human review (no auto-fix). */
  manual_count: number;
}

export interface ValidateTreeOptions {
  /** YLint config overrides (optional). */
  lint?: Partial<LintConfig>;
}

/**
 * Validate a SemanticContent tree with ylint.
 * Returns unified warnings and a ready-to-apply fix plan.
 */
export function validateTree(
  content: SemanticContent,
  options?: ValidateTreeOptions
): ValidateTreeResult {
  const allWarnings: LintWarning[] = [];
  const allFixes: YOp[] = [];
  let manualCount = 0;

  // Layer 1: ylint general (structural hygiene)
  const lintResult = ylint(content, options?.lint);
  for (const w of lintResult.warnings) {
    allWarnings.push(w);
    if (w.fix) {
      allFixes.push(...w.fix);
    } else {
      manualCount++;
    }
  }

  const hasErrors = allWarnings.some((w) => w.severity === 'error');

  return {
    valid: !hasErrors,
    warnings: allWarnings,
    fixes: allFixes,
    manual_count: manualCount,
  };
}
