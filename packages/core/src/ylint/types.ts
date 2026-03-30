/**
 * YLint Types — Knowledge Tree Linter (4 Normal Forms)
 */

export interface LintWarning {
  form: 1 | 2 | 3 | 4;
  rule: string;
  path: string;
  message: string;
  suggestion?: string;
  severity: 'info' | 'warn';
}

export interface LintResult {
  warnings: LintWarning[];
  scores: {
    form1: number; // 0-1, fraction of keys passing Form 1
    form2: number; // 0-1, fraction of scalars passing Form 2
    form3: number; // 0-1, fraction of lists passing Form 3
    form4: number; // 0-1, fraction of nodes passing Form 4
  };
  overall: number; // 0-1, average of form scores
}

export interface LintConfig {
  max_key_words: number; // default: 3
  max_scalar_length: number; // default: 100
  max_depth: number; // default: 3
  generic_keys: string[]; // default list
  verb_list: string[]; // default list
  enabled_forms: (1 | 2 | 3 | 4)[]; // default: [1,2,3,4]
}
