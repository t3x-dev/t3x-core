import { yamlLanguage } from '@codemirror/lang-yaml';
import type { SemanticContent } from '@t3x-dev/core';
import { load } from 'js-yaml';
import { buildCanonicalStateYaml } from '@/domain/project/stateViewModel';

export interface StateYamlReviewLine {
  text: string;
  path: string | null;
  kind: 'added' | 'removed' | 'unchanged';
}

/** Use the YAML parser, not indentation guesses: multiline values and quoted keys retain their path. */
export function stateYamlLinePaths(text: string): Array<string | null> {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const paths: Array<string | null> = starts.map(() => null);
  const tree = yamlLanguage.parser.parse(text);
  type Node = typeof tree.topNode;
  const assign = (node: Node, path: string) => {
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] < node.to && (starts[i + 1] ?? text.length + 1) > node.from) paths[i] = path;
    }
  };
  const visit = (node: Node, path: string) => {
    if (node.name === 'Pair') {
      const key = node.getChild('Key');
      if (!key) return;
      const name = String(load(text.slice(key.from, key.to)));
      const next = path ? `${path}/${name}` : name;
      assign(node, next);
      for (let child = key.nextSibling; child; child = child.nextSibling) visit(child, next);
      return;
    }
    if (node.name === 'BlockSequence') {
      let index = 0;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'Item') continue;
        const next = `${path}/${index++}`;
        assign(child, next);
        visit(child, next);
      }
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child, path);
  };
  visit(tree.topNode, '');
  return paths;
}

/** Canonical State serialization shared with State / Code, presented as a read-only unified diff. */
export function buildStateYamlReview(
  baseline: SemanticContent,
  head: SemanticContent
): StateYamlReviewLine[] {
  const beforeText = buildCanonicalStateYaml(baseline);
  const afterText = buildCanonicalStateYaml(head);
  const before = beforeText.split('\n');
  const after = afterText.split('\n');
  const beforePaths = stateYamlLinePaths(beforeText);
  const afterPaths = stateYamlLinePaths(afterText);
  const result: StateYamlReviewLine[] = [];
  const emit = (side: 'before' | 'after', index: number, kind: StateYamlReviewLine['kind']) => {
    result.push({
      text: (side === 'before' ? before : after)[index],
      path: (side === 'before' ? beforePaths : afterPaths)[index],
      kind,
    });
  };
  // Bound memory for large documents; an unaligned full replacement is still an honest diff.
  if ((before.length + 1) * (after.length + 1) > 1_000_000) {
    if (beforeText === afterText) after.forEach((_, i) => emit('after', i, 'unchanged'));
    else {
      before.forEach((_, i) => emit('before', i, 'removed'));
      after.forEach((_, i) => emit('after', i, 'added'));
    }
    return result;
  }
  const width = after.length + 1;
  const lengths = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      // Equal text in a different node is not the same line.
      lengths[i * width + j] =
        before[i] === after[j] && beforePaths[i] === afterPaths[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (
      i < before.length &&
      j < after.length &&
      before[i] === after[j] &&
      beforePaths[i] === afterPaths[j]
    ) {
      emit('after', j++, 'unchanged');
      i++;
    } else if (
      i < before.length &&
      (j === after.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
    ) {
      emit('before', i++, 'removed');
    } else emit('after', j++, 'added');
  }
  return result;
}
