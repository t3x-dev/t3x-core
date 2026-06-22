/**
 * 4-Layer YOps Validation Pipeline — Types
 *
 * Layer 1: Parse (YAML text -> JS objects)
 * Layer 2: Reserved for schema contract checks
 * Layer 3: Engine dry-run (apply ops in memory)
 * Layer 4: Gates (structural quality checks)
 */

export interface LayerError {
  layer: 1 | 2 | 3 | 4;
  stage: 'parse' | 'yschema' | 'engine' | 'gates';
  message: string;
  path?: string;
  fix_hint?: string;
}

export interface AutoFix {
  layer: number;
  description: string;
}

export interface ValidateResult {
  ok: boolean;
  errors: LayerError[];
  auto_fixes: AutoFix[];
  warnings: LayerError[];
  parsed_yops?: unknown[];
  result_doc?: unknown;
}
