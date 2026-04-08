/**
 * YLint — Knowledge Tree Linter (4 Normal Forms)
 *
 * Pure, deterministic linter for TreeNode structures.
 * Produces warnings (not errors) to nudge toward better structure.
 */

import type { SemanticContent, SlotValue, TreeNode } from '../semantic/types';
import type { LintConfig, LintResult, LintWarning } from './types';

export const DEFAULT_LINT_CONFIG: LintConfig = {
  max_key_words: 3,
  max_scalar_length: 100,
  max_depth: 5,
  generic_keys: [
    'details',
    'info',
    'data',
    'items',
    'stuff',
    'misc',
    'other',
    'general',
    'various',
  ],
  verb_list: [
    'is',
    'are',
    'was',
    'were',
    'should',
    'will',
    'can',
    'do',
    'does',
    'has',
    'have',
    'had',
    'get',
    'set',
    'make',
    'take',
    'go',
    'went',
  ],
  enabled_forms: [1, 2, 3, 4],
};

interface Counters {
  form1Total: number;
  form1Pass: number;
  form2Total: number;
  form2Pass: number;
  form3Total: number;
  form3Pass: number;
  form4Total: number;
  form4Pass: number;
}

function checkForm1(
  key: string,
  path: string,
  cfg: LintConfig,
  warnings: LintWarning[],
  counters: Counters,
): void {
  counters.form1Total++;
  let passed = true;

  // Check key length (count underscores to determine word count)
  const segments = key.split('_');
  if (segments.length > cfg.max_key_words) {
    warnings.push({
      form: 1,
      rule: 'key-too-long',
      path,
      message: `Key "${key}" has ${segments.length} words (max ${cfg.max_key_words})`,
      suggestion: `Shorten to ${cfg.max_key_words} words or nest under a parent node`,
      severity: 'warn',
    });
    passed = false;
  }

  // Check for verbs (word-boundary aware via underscore splitting)
  const verbSet = new Set(cfg.verb_list);
  const foundVerb = segments.find((seg) => verbSet.has(seg.toLowerCase()));
  if (foundVerb) {
    warnings.push({
      form: 1,
      rule: 'key-contains-verb',
      path,
      message: `Key "${key}" contains verb "${foundVerb}"`,
      suggestion: 'Use nouns for keys; move verbs to slot values',
      severity: 'warn',
    });
    passed = false;
  }

  if (passed) counters.form1Pass++;
}

function checkForm2Scalar(
  value: string,
  slotKey: string,
  path: string,
  cfg: LintConfig,
  warnings: LintWarning[],
  counters: Counters,
): void {
  counters.form2Total++;
  let passed = true;

  // Check for multi-fact (commas with 3+ segments)
  const commaSegments = value.split(',').map((s) => s.trim());
  if (commaSegments.length >= 3) {
    warnings.push({
      form: 2,
      rule: 'scalar-multi-fact',
      path: `${path}.${slotKey}`,
      message: `Scalar has ${commaSegments.length} comma-separated segments`,
      suggestion: 'Split into a map with named keys',
      severity: 'warn',
    });
    passed = false;
  }

  // Check for compound (contains " and " or " or ")
  if (/ and /i.test(value) || / or /i.test(value)) {
    warnings.push({
      form: 2,
      rule: 'scalar-compound',
      path: `${path}.${slotKey}`,
      message: 'Scalar contains compound conjunction (" and "/" or ")',
      suggestion: 'Split into a list',
      severity: 'info',
    });
    passed = false;
  }

  // Check length
  if (value.length > cfg.max_scalar_length) {
    warnings.push({
      form: 2,
      rule: 'scalar-too-long',
      path: `${path}.${slotKey}`,
      message: `Scalar is ${value.length} chars (max ${cfg.max_scalar_length})`,
      suggestion: 'Break into child nodes or shorten',
      severity: 'warn',
    });
    passed = false;
  }

  if (passed) counters.form2Pass++;
}

function checkForm3List(
  items: SlotValue[],
  slotKey: string,
  path: string,
  warnings: LintWarning[],
  counters: Counters,
): void {
  counters.form3Total++;
  let passed = true;

  // Single-item list
  if (items.length === 1) {
    warnings.push({
      form: 3,
      rule: 'list-single-item',
      path: `${path}.${slotKey}`,
      message: 'List has only one item',
      suggestion: 'Use a scalar instead of a single-item list',
      severity: 'info',
    });
    passed = false;
  }

  // Check each string item for map-like patterns
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === 'string') {
      if (item.includes(':') || item.includes(' is ') || item.includes('=')) {
        warnings.push({
          form: 3,
          rule: 'list-looks-like-map',
          path: `${path}.${slotKey}[${i}]`,
          message: `List item looks like a key-value pair: "${item.length > 50 ? `${item.slice(0, 50)}...` : item}"`,
          suggestion: 'Convert list to a map with named keys',
          severity: 'warn',
        });
        passed = false;
      }
    }
  }

  if (passed) counters.form3Pass++;
}

function checkForm4(
  node: TreeNode,
  path: string,
  depth: number,
  parentChildCount: number,
  cfg: LintConfig,
  warnings: LintWarning[],
  counters: Counters,
): void {
  counters.form4Total++;
  let passed = true;

  // Depth check
  if (depth > cfg.max_depth) {
    warnings.push({
      form: 4,
      rule: 'depth-exceeded',
      path,
      message: `Node at depth ${depth} exceeds max depth ${cfg.max_depth}`,
      suggestion: 'Flatten the hierarchy or move to a sibling tree',
      severity: 'warn',
    });
    passed = false;
  }

  // Single-child chain: node has exactly 1 child and is itself the only child of its parent
  if (node.children.length === 1 && parentChildCount === 1) {
    warnings.push({
      form: 4,
      rule: 'single-child-chain',
      path,
      message: `Node "${node.key}" forms a single-child chain`,
      suggestion: 'Fold parent and child into one node',
      severity: 'info',
    });
    passed = false;
  }

  // Generic container key
  if (cfg.generic_keys.includes(node.key.toLowerCase())) {
    warnings.push({
      form: 4,
      rule: 'generic-container-key',
      path,
      message: `Key "${node.key}" is a generic container name`,
      suggestion: 'Use a more specific, descriptive key',
      severity: 'warn',
    });
    passed = false;
  }

  if (passed) counters.form4Pass++;
}

function walkTree(
  node: TreeNode,
  parentPath: string,
  depth: number,
  parentChildCount: number,
  cfg: LintConfig,
  warnings: LintWarning[],
  counters: Counters,
): void {
  const path = parentPath ? `${parentPath}.${node.key}` : node.key;
  const enabled = new Set(cfg.enabled_forms);

  // Form 1: key checks
  if (enabled.has(1)) {
    checkForm1(node.key, path, cfg, warnings, counters);
  }

  // Form 4: depth, single-child, generic key
  if (enabled.has(4)) {
    checkForm4(node, path, depth, parentChildCount, cfg, warnings, counters);
  }

  // Build set of slot_quotes keys for exemption
  const quoteKeys = node.slot_quotes ? new Set(Object.keys(node.slot_quotes)) : new Set<string>();

  // Form 2 & 3: slot checks
  for (const [slotKey, slotValue] of Object.entries(node.slots)) {
    // Skip slot_quotes values (exempt from Form 2)
    const isQuoted = quoteKeys.has(slotKey);

    if (Array.isArray(slotValue)) {
      // Form 3: list checks
      if (enabled.has(3)) {
        checkForm3List(slotValue, slotKey, path, warnings, counters);
      }
    } else if (typeof slotValue === 'string' && !isQuoted) {
      // Form 2: scalar checks (only strings, skip quoted slots)
      if (enabled.has(2)) {
        checkForm2Scalar(slotValue, slotKey, path, cfg, warnings, counters);
      }
    }
    // number/boolean scalars are exempt from Form 2
  }

  // Recurse into children
  for (const child of node.children ?? []) {
    walkTree(child, path, depth + 1, node.children.length, cfg, warnings, counters);
  }
}

export function ylint(
  content: SemanticContent,
  config?: Partial<LintConfig>,
): LintResult {
  const cfg: LintConfig = { ...DEFAULT_LINT_CONFIG, ...config };
  const warnings: LintWarning[] = [];
  const counters: Counters = {
    form1Total: 0,
    form1Pass: 0,
    form2Total: 0,
    form2Pass: 0,
    form3Total: 0,
    form3Pass: 0,
    form4Total: 0,
    form4Pass: 0,
  };

  for (const tree of content.trees) {
    // Root nodes: parentChildCount = total root trees (for single-child chain detection)
    walkTree(tree, '', 0, content.trees.length, cfg, warnings, counters);
  }

  const enabled = new Set(cfg.enabled_forms);

  const form1 =
    enabled.has(1) && counters.form1Total > 0
      ? counters.form1Pass / counters.form1Total
      : 1.0;
  const form2 =
    enabled.has(2) && counters.form2Total > 0
      ? counters.form2Pass / counters.form2Total
      : 1.0;
  const form3 =
    enabled.has(3) && counters.form3Total > 0
      ? counters.form3Pass / counters.form3Total
      : 1.0;
  const form4 =
    enabled.has(4) && counters.form4Total > 0
      ? counters.form4Pass / counters.form4Total
      : 1.0;

  const enabledScores: number[] = [];
  if (enabled.has(1)) enabledScores.push(form1);
  if (enabled.has(2)) enabledScores.push(form2);
  if (enabled.has(3)) enabledScores.push(form3);
  if (enabled.has(4)) enabledScores.push(form4);

  const overall =
    enabledScores.length > 0
      ? enabledScores.reduce((a, b) => a + b, 0) / enabledScores.length
      : 1.0;

  return {
    warnings,
    scores: { form1, form2, form3, form4 },
    overall,
  };
}
