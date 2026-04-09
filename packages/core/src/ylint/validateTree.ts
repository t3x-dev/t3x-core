/**
 * validateTree — Single entry point for all YAML tree validation.
 *
 * Runs all checks in order:
 *   1. ylint general (4 normal forms — structural hygiene)
 *   2. yschema (domain rules — if schema provided)
 *
 * Returns a unified result with all warnings and a combined fix plan.
 * The caller can auto-apply fixes via applyYOps() or surface them for review.
 */

import type { YOp } from '@t3x-dev/yops';
import type { Schema } from '@t3x-dev/yschema';
import { buildFixPlan, validateSchema } from '@t3x-dev/yschema';
import type { SemanticContent } from '../semantic/types';
import { treesToYValue } from '../t3x-yops/convert';
import { ylint } from './linter';
import type { LintConfig, LintWarning } from './types';

export interface ValidateTreeResult {
  /** True if no errors (warnings and info are ok). */
  valid: boolean;
  /** All warnings from both layers. */
  warnings: LintWarning[];
  /** YOps operations that would fix auto-fixable issues. */
  fixes: YOp[];
  /** Number of issues that need human review (no auto-fix). */
  manual_count: number;
}

export interface ValidateTreeOptions {
  /** YSchema to validate against (optional). */
  schema?: Schema;
  /** YLint config overrides (optional). */
  lint?: Partial<LintConfig>;
}

/**
 * Validate a SemanticContent tree. Runs ylint + yschema (if provided).
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

  // Layer 2: yschema (domain validation)
  if (options?.schema) {
    const doc = treesToYValue(content.trees);
    const schemaResult = validateSchema(doc, options.schema);
    const plan = buildFixPlan(schemaResult);

    for (const v of schemaResult.violations) {
      allWarnings.push({
        form: 'schema',
        rule: v.code,
        path: v.path,
        message: v.message,
        severity: v.severity,
        fix: v.fix,
      });
    }

    allFixes.push(...plan.ops);
    manualCount += plan.manual_count;
  }

  const hasErrors = allWarnings.some((w) => w.severity === 'error');

  return {
    valid: !hasErrors,
    warnings: allWarnings,
    fixes: allFixes,
    manual_count: manualCount,
  };
}
