/**
 * YLint Types — Knowledge Tree Linter
 *
 * Two layers:
 *   General — 4 normal forms, always runs, no schema needed
 *   Schema  — validates against user-defined @t3x-dev/schema (optional)
 */

import type { YOp } from '@t3x-dev/yops';

export interface LintWarning {
  form: 1 | 2 | 3 | 4 | 'schema';
  rule: string;
  path: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
  fix?: YOp[];
}

export interface LintResult {
  valid: boolean;
  warnings: LintWarning[];
}

export interface LintConfig {
  max_key_words: number; // default: 3
  max_scalar_length: number; // default: 100
  max_depth: number; // default: 5
  generic_keys: string[]; // default list
  verb_list: string[]; // default list
  enabled_forms: (1 | 2 | 3 | 4)[]; // default: [1,2,3,4]
}
