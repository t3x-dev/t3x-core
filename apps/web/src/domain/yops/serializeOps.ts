import type { HumanEditSurface, Source, SourcedYOp } from '@t3x-dev/core';
import * as yaml from 'js-yaml';

function surfaceLabel(surface: HumanEditSurface | undefined): string {
  switch (surface) {
    case 'tree':
      return 'Tree';
    case 'script':
      return 'YOps';
    case 'inline':
      return 'Inline';
    default:
      return 'Manual';
  }
}

function humanCommentForSource(source: Source | undefined): string | null {
  if (!source || source.type !== 'human') return null;
  return `Human edit via ${surfaceLabel(source.surface)}: manual change by ${source.author}`;
}

function llmCommentForSource(source: Source | undefined): string | null {
  if (!source || source.type !== 'llm') return null;
  return `LLM extract via ${source.model}: extracted from source text`;
}

function commentForSource(source: Source | undefined): string | null {
  return humanCommentForSource(source) ?? llmCommentForSource(source);
}

export function serializeOpsToYaml(ops: readonly SourcedYOp[]): string {
  if (ops.length === 0) return '';
  const stripped = ops.map((op) => {
    const { source, ...rest } = op as Record<string, unknown>;
    return rest;
  });
  const dumped = yaml.dump({ yops: stripped }, { lineWidth: -1, noRefs: true }).replace(/\n$/, '');
  const lines = dumped.split('\n');
  const output: string[] = [];
  let opIndex = 0;

  for (const line of lines) {
    if (line.startsWith('  - ')) {
      const comment = commentForSource((ops[opIndex] as { source?: Source }).source);
      if (comment) output.push(`  # ${comment}`);
      opIndex++;
    }
    output.push(line);
  }

  return output.join('\n');
}
