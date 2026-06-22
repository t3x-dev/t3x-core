/**
 * YLint Types — Knowledge Tree Linter
 *
 * Runs the 4 built-in structural normal forms. Domain-specific YSchema P0
 * contract validation lives in @t3x-dev/yschema.
 */

import type { YOp } from '@t3x-dev/yops';

export interface LintWarning {
  form: 1 | 2 | 3 | 4;
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
