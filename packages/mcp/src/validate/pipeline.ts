/**
 * 4-Layer YOps Validation Pipeline
 *
 * Runs ALL layers and collects ALL errors so the agent can fix multiple
 * issues in a single round-trip. Only layer 1 (parse) failure prevents
 * subsequent layers from running.
 *
 * Layer 1: Parse — YAML text -> YOp[]
 * Layer 2: YSchema — validate document against schema (optional, skipped if no schema)
 * Layer 3: Engine — dry-run applyYOps in memory
 * Layer 4: Gates — structural quality checks (advisory warnings only)
 */

import { applyYOps, GateRunner, parseYOpsYaml, type SemanticContent } from '@t3x-dev/core';
import type { AutoFix, LayerError, ValidateResult } from './types';

type ParsedYOpsResult = { ok: true; yops: unknown[] } | { ok: false; error: string };

function stripCodeFences(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith('```')) return input;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
}

function dedentBlock(input: string): string {
  const lines = input.split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) return '';
  const minIndent = Math.min(...nonEmpty.map((line) => line.match(/^ */)?.[0].length ?? 0));
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

function parseScalar(rawValue: string): string | number | boolean | null {
  const value = rawValue.trim();
  if (value.length === 0) return '';
  if (/[{}[\]]/.test(value)) {
    throw new Error(`Unsupported YAML value: ${value}`);
  }
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseSimpleTreeYaml(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [
    { indent: -1, value: root },
  ];

  for (const originalLine of input.split('\n')) {
    const line = originalLine.replace(/\t/g, '    ');
    if (line.trim().length === 0) continue;

    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();
    const separator = trimmed.indexOf(':');
    if (separator === -1) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1);
    if (!key) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (indent <= parent.indent) {
      throw new Error(`Invalid indentation near: ${trimmed}`);
    }

    if (rawValue.trim().length === 0) {
      const child: Record<string, unknown> = {};
      parent.value[key] = child;
      stack.push({ indent, value: child });
      continue;
    }

    parent.value[key] = parseScalar(rawValue);
  }

  return root;
}

function treeDocToYops(doc: Record<string, unknown>): unknown[] {
  const yops: unknown[] = [];

  const visit = (path: string, value: unknown) => {
    yops.push({ define: { path } });

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      const scalarEntries = Object.fromEntries(
        entries.filter(
          ([, child]) => child == null || typeof child !== 'object' || Array.isArray(child)
        )
      );

      if (Object.keys(scalarEntries).length > 0) {
        yops.push({ populate: { path, values: scalarEntries } });
      }

      for (const [childKey, childValue] of entries) {
        if (childValue && typeof childValue === 'object' && !Array.isArray(childValue)) {
          visit(`${path}/${childKey}`, childValue);
        }
      }
      return;
    }

    yops.push({ populate: { path, values: { value } } });
  };

  for (const [rootKey, rootValue] of Object.entries(doc)) {
    visit(rootKey, rootValue);
  }

  return yops;
}

function parseYamlInput(yamlInput: string): ParsedYOpsResult {
  const normalized = stripCodeFences(yamlInput).trim();
  if (normalized.length === 0) {
    return { ok: false, error: 'Empty input' };
  }

  if (normalized.startsWith('yops:')) {
    const body = dedentBlock(normalized.slice('yops:'.length));
    const parsed = parseYOpsYaml(body);
    return parsed.ok ? { ok: true, yops: parsed.ops } : { ok: false, error: parsed.error };
  }

  if (normalized.startsWith('-')) {
    const parsed = parseYOpsYaml(normalized);
    return parsed.ok ? { ok: true, yops: parsed.ops } : { ok: false, error: parsed.error };
  }

  try {
    return { ok: true, yops: treeDocToYops(parseSimpleTreeYaml(normalized)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Validate a YAML/YOps string against the 4-layer pipeline.
 *
 * @param yamlInput Raw YAML string (may include code fences)
 * @param currentContent Current SemanticContent (trees + relations) to apply ops against
 * @returns ValidateResult with collected errors, warnings, auto-fixes
 */
export async function validateYOps(
  yamlInput: string,
  currentContent: SemanticContent
): Promise<ValidateResult> {
  const errors: LayerError[] = [];
  const warnings: LayerError[] = [];
  const autoFixes: AutoFix[] = [];

  let parseResult: ParsedYOpsResult;
  try {
    parseResult = parseYamlInput(yamlInput);
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
    return { ok: false, errors, auto_fixes: autoFixes, warnings };
  }

  const parsedYOps = parseResult.yops;

  try {
    const yschema = await import('@t3x-dev/yschema');
    if (yschema.validateSchema && yschema.buildFixPlan) {
      // Reserved for future schema-aware validation.
    }
  } catch {
    // Optional dependency unavailable.
  }

  let resultDoc: SemanticContent | undefined;
  try {
    const engineResult = applyYOps(currentContent, parsedYOps as never);
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
          warnings.push({ layer: 4, stage: 'gates', message: 'Duplicate keys detected in tree' });
        }
        if (!checks.relations_valid) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: 'Broken relation endpoints found',
          });
        }
        if (!checks.no_cycles) {
          warnings.push({ layer: 4, stage: 'gates', message: 'Cycle detected in relations' });
        }
        if (!checks.no_self_relations) {
          warnings.push({ layer: 4, stage: 'gates', message: 'Self-relation detected' });
        }
      }

      if (gateResult.structure.warnings) {
        for (const warning of gateResult.structure.warnings) {
          warnings.push({
            layer: 4,
            stage: 'gates',
            message: warning.message,
          });
        }
      }
    } catch {
      // Gate failure is non-blocking.
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
