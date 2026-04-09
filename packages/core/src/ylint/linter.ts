/**
 * YLint — Knowledge Tree Linter (4 Normal Forms)
 *
 * Pure, deterministic linter for TreeNode structures.
 * Each warning optionally carries a YOps fix operation.
 *
 * General layer — always runs, no schema needed:
 *   Form 1: Keys Are Nouns (naming hygiene)
 *   Form 2: Scalars Are Atomic Facts (value quality)
 *   Form 3: Lists Are Genuinely Plural (list quality)
 *   Form 4: Depth Equals Specificity (tree shape)
 */

import type { YOp } from '@t3x-dev/yops';
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

/** Convert dot-path (ylint internal) to slash-path (YOps). */
function toYOpsPath(dotPath: string): string {
  return dotPath.replace(/\./g, '/');
}

function checkForm1(key: string, path: string, cfg: LintConfig, warnings: LintWarning[]): void {
  const segments = key.split('_');

  if (segments.length > cfg.max_key_words) {
    warnings.push({
      form: 1,
      rule: 'key-too-long',
      path,
      message: `Key "${key}" has ${segments.length} words (max ${cfg.max_key_words})`,
      severity: 'warn',
      // No auto-fix: needs domain knowledge to pick a better name
    });
  }

  const verbSet = new Set(cfg.verb_list);
  const foundVerb = segments.find((seg) => verbSet.has(seg.toLowerCase()));
  if (foundVerb) {
    warnings.push({
      form: 1,
      rule: 'key-contains-verb',
      path,
      message: `Key "${key}" contains verb "${foundVerb}"`,
      severity: 'warn',
      // No auto-fix: needs domain knowledge to pick a noun
    });
  }
}

function checkForm2Scalar(
  value: string,
  slotKey: string,
  path: string,
  cfg: LintConfig,
  warnings: LintWarning[]
): void {
  const commaSegments = value.split(',').map((s) => s.trim());
  if (commaSegments.length >= 3) {
    warnings.push({
      form: 2,
      rule: 'scalar-multi-fact',
      path: `${path}.${slotKey}`,
      message: `Scalar has ${commaSegments.length} comma-separated segments`,
      severity: 'warn',
      // No auto-fix: splitting requires understanding which parts are separate facts
    });
  }

  if (/ and /i.test(value) || / or /i.test(value)) {
    warnings.push({
      form: 2,
      rule: 'scalar-compound',
      path: `${path}.${slotKey}`,
      message: 'Scalar contains compound conjunction (" and "/" or ")',
      severity: 'info',
    });
  }

  if (value.length > cfg.max_scalar_length) {
    warnings.push({
      form: 2,
      rule: 'scalar-too-long',
      path: `${path}.${slotKey}`,
      message: `Scalar is ${value.length} chars (max ${cfg.max_scalar_length})`,
      severity: 'warn',
    });
  }
}

function checkForm3List(
  items: SlotValue[],
  slotKey: string,
  path: string,
  warnings: LintWarning[]
): void {
  if (items.length === 1) {
    const yopsPath = toYOpsPath(`${path}.${slotKey}`);
    warnings.push({
      form: 3,
      rule: 'list-single-item',
      path: `${path}.${slotKey}`,
      message: 'List has only one item',
      severity: 'info',
      fix: [{ set: { path: yopsPath, value: items[0] as import('@t3x-dev/yops').YValue } }],
    });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === 'string') {
      if (item.includes(':') || item.includes(' is ') || item.includes('=')) {
        warnings.push({
          form: 3,
          rule: 'list-looks-like-map',
          path: `${path}.${slotKey}[${i}]`,
          message: `List item looks like a key-value pair: "${item.length > 50 ? `${item.slice(0, 50)}...` : item}"`,
          severity: 'warn',
          // No auto-fix: parsing "key: value" strings requires heuristics
        });
      }
    }
  }
}

function checkForm4(
  node: TreeNode,
  path: string,
  depth: number,
  parentChildCount: number,
  cfg: LintConfig,
  warnings: LintWarning[]
): void {
  if (depth > cfg.max_depth) {
    warnings.push({
      form: 4,
      rule: 'depth-exceeded',
      path,
      message: `Node at depth ${depth} exceeds max depth ${cfg.max_depth}`,
      severity: 'warn',
      // No auto-fix: restructuring deep trees needs domain knowledge
    });
  }

  if (node.children.length === 1 && parentChildCount === 1) {
    const yopsPath = toYOpsPath(path);
    warnings.push({
      form: 4,
      rule: 'single-child-chain',
      path,
      message: `Node "${node.key}" forms a single-child chain`,
      severity: 'info',
      fix: [{ fold: { path: yopsPath } }],
    });
  }

  if (cfg.generic_keys.includes(node.key.toLowerCase())) {
    warnings.push({
      form: 4,
      rule: 'generic-container-key',
      path,
      message: `Key "${node.key}" is a generic container name`,
      severity: 'warn',
      // No auto-fix: needs domain knowledge to pick a better name
    });
  }
}

function walkTree(
  node: TreeNode,
  parentPath: string,
  depth: number,
  parentChildCount: number,
  cfg: LintConfig,
  warnings: LintWarning[]
): void {
  const path = parentPath ? `${parentPath}.${node.key}` : node.key;
  const enabled = new Set(cfg.enabled_forms);

  if (enabled.has(1)) {
    checkForm1(node.key, path, cfg, warnings);
  }

  if (enabled.has(4)) {
    checkForm4(node, path, depth, parentChildCount, cfg, warnings);
  }

  const quoteKeys = node.slot_quotes ? new Set(Object.keys(node.slot_quotes)) : new Set<string>();

  for (const [slotKey, slotValue] of Object.entries(node.slots)) {
    const isQuoted = quoteKeys.has(slotKey);

    if (Array.isArray(slotValue)) {
      if (enabled.has(3)) {
        checkForm3List(slotValue, slotKey, path, warnings);
      }
    } else if (typeof slotValue === 'string' && !isQuoted) {
      if (enabled.has(2)) {
        checkForm2Scalar(slotValue, slotKey, path, cfg, warnings);
      }
    }
  }

  for (const child of node.children ?? []) {
    walkTree(child, path, depth + 1, node.children.length, cfg, warnings);
  }
}

export function ylint(content: SemanticContent, config?: Partial<LintConfig>): LintResult {
  const cfg: LintConfig = { ...DEFAULT_LINT_CONFIG, ...config };
  const warnings: LintWarning[] = [];

  for (const tree of content.trees) {
    walkTree(tree, '', 0, content.trees.length, cfg, warnings);
  }

  const hasErrors = warnings.some((w) => w.severity === 'error');

  return {
    valid: !hasErrors,
    warnings,
  };
}
