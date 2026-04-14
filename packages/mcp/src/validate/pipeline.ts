/**
 * 4-Layer YOps Validation Pipeline
 *
 * Runs ALL layers and collects ALL errors so the agent can fix multiple
 * issues in a single round-trip. Only layer 1 (parse) failure prevents
 * subsequent layers from running.
 *
 * Layer 1: Parse — YAML text -> YOp[] via parseYOpsOutput
 * Layer 2: YSchema — validate document against schema (optional, skipped if no schema)
 * Layer 3: Engine — dry-run applyYOps in memory
 * Layer 4: Gates — structural quality checks (advisory warnings only)
 */

import {
  applyYOps,
  GateRunner,
  parseYOpsOutput,
  type SemanticContent,
  type YOpsParseResult,
} from '@t3x-dev/core';
import type { AutoFix, LayerError, ValidateResult } from './types';

/**
 * Validate a YAML/YOps string against the 4-layer pipeline.
 *
 * @param yamlInput   Raw YAML string (may include code fences)
 * @param currentContent  Current SemanticContent (trees + relations) to apply ops against
 * @returns ValidateResult with collected errors, warnings, auto-fixes
 */
export async function validateYOps(
  yamlInput: string,
  currentContent: SemanticContent
): Promise<ValidateResult> {
  const errors: LayerError[] = [];
  const warnings: LayerError[] = [];
  const autoFixes: AutoFix[] = [];

  // ── Layer 1: Parse ──
  let parseResult: YOpsParseResult;
  try {
    parseResult = parseYOpsOutput(yamlInput);
  } catch (e) {
    errors.push({
      layer: 1,
      stage: 'parse',
      message: `Parse threw: ${e instanceof Error ? e.message : String(e)}`,
    });
    return { ok: false, errors, auto_fixes: autoFixes, warnings };
  }

  if (!parseResult.ok) {
    errors.push({
      layer: 1,
      stage: 'parse',
      message: parseResult.error,
    });
    // Cannot run subsequent layers without parsed ops
    return { ok: false, errors, auto_fixes: autoFixes, warnings };
  }

  const parsedYOps = parseResult.yops;

  // ── Layer 2: YSchema (optional) ──
  // @t3x-dev/yschema may not be installed. Try dynamic import and skip if unavailable.
  try {
    const yschema = await import('@t3x-dev/yschema');
    if (yschema.validateSchema && yschema.buildFixPlan) {
      // yschema validates a YValue doc against a Schema definition.
      // Without a user-provided schema, we skip this layer.
      // If a schema is provided in the future, it would be passed as a parameter.
      // For now, layer 2 is a no-op placeholder that won't produce errors.
    }
  } catch {
    // @t3x-dev/yschema not available — skip layer 2
  }

  // ── Layer 3: Engine dry-run ──
  let resultDoc: SemanticContent | undefined;
  try {
    const engineResult = applyYOps(currentContent, parsedYOps);
    if (!engineResult.ok) {
      const errMsg = engineResult.error
        ? `${engineResult.error.code}: ${engineResult.error.message}`
        : 'Engine returned ok=false';
      errors.push({
        layer: 3,
        stage: 'engine',
        message: errMsg,
        path:
          engineResult.error && 'op_index' in engineResult.error
            ? `op[${engineResult.error.op_index}]`
            : undefined,
        fix_hint:
          engineResult.error?.code === 'PATH_NOT_FOUND'
            ? 'Check that the target path exists in the current tree'
            : undefined,
      });
    } else {
      resultDoc = { trees: engineResult.trees, relations: engineResult.relations };
    }
  } catch (e) {
    errors.push({
      layer: 3,
      stage: 'engine',
      message: `Engine threw: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // ── Layer 4: Gates (advisory) ──
  if (resultDoc) {
    try {
      const gateRunner = new GateRunner();
      const gateResult = await gateRunner.run(resultDoc, {
        skipSemantic: true,
        skipBusiness: true,
      });

      if (!gateResult.passed) {
        const checks = gateResult.structure.checks;
        if (!checks.no_duplicate_keys) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: 'Duplicate keys detected in tree',
          });
        }
        if (!checks.relations_valid) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: 'Broken relation endpoints found',
          });
        }
        if (!checks.no_cycles) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: 'Cycle detected in relations',
          });
        }
        if (!checks.no_self_relations) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: 'Self-relation detected',
          });
        }
      }

      // Also collect structure gate warnings if present
      if (gateResult.structure.warnings) {
        for (const w of gateResult.structure.warnings) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: w.message,
          });
        }
      }
    } catch {
      // Gate failure is non-blocking — silently skip
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    auto_fixes: autoFixes,
    warnings,
    parsed_yops: parsedYOps,
    result_doc: resultDoc,
  };
}
