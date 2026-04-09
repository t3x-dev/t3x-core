/**
 * Merge output formatters for CLI display.
 */
import chalk from 'chalk';

interface ConflictSummary {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
}

interface PrepareResultInput {
  mergeId: string;
  autoKept: number;
  onlyInSource: number;
  onlyInTarget: number;
  conflicts: ConflictSummary[];
  projectId: string;
  webUrl: string;
}

interface MergeCommitInput {
  hash: string;
  parents: string[];
  branch: string;
  mergeSummary: {
    kept_identical: number;
    resolved_conflicts: number;
    kept_from_source: number;
    kept_from_target: number;
    discarded: number;
    total_nodes: number;
  };
}

/**
 * Format the output of `t3x merge prepare`.
 */
export function formatPrepareResult(input: PrepareResultInput): string {
  const lines: string[] = [];
  const { mergeId, autoKept, onlyInSource, onlyInTarget, conflicts, projectId, webUrl } = input;

  lines.push(`  Auto-kept:    ${autoKept} nodes`);
  lines.push(`  Only source:  ${onlyInSource} nodes`);
  lines.push(`  Only target:  ${onlyInTarget} nodes`);
  lines.push(`  Conflicts:    ${conflicts.length}${conflicts.length > 0 ? ' ' + chalk.yellow('⚠') : ''}`);

  if (conflicts.length > 0) {
    lines.push('');
    lines.push('Conflicts:');
    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      const src = formatValue(c.sourceValue);
      const tgt = formatValue(c.targetValue);
      lines.push(`  ${i + 1}. ${c.path}  source: ${chalk.red(src)}  target: ${chalk.green(tgt)}`);
    }
    lines.push('');
    lines.push(chalk.blue('→ Resolve conflicts in WebUI:'));
    lines.push(chalk.blue(`  ${webUrl}/project/${projectId}/merge/${mergeId}`));
    lines.push('');
    lines.push(`Then run: ${chalk.bold(`t3x merge execute ${mergeId} -m "merge complete"`)}`);
    lines.push(`Or abort: ${chalk.bold(`t3x merge abort ${mergeId}`)}`);
  }

  return lines.join('\n');
}

/**
 * Format the output of `t3x merge execute`.
 */
export function formatMergeCommitResult(input: MergeCommitInput): string {
  const { hash, parents, branch, mergeSummary } = input;
  const lines: string[] = [];

  lines.push(`  Commit:           ${shortHash(hash)}`);
  lines.push(`  Parents:          ${parents.map((p) => shortHash(p)).join(' + ')}`);
  lines.push(`  Branch:           ${branch}`);
  lines.push(`  Kept identical:   ${mergeSummary.kept_identical}`);
  lines.push(`  Resolved:         ${mergeSummary.resolved_conflicts}`);
  lines.push(`  From source:      ${mergeSummary.kept_from_source}`);
  lines.push(`  From target:      ${mergeSummary.kept_from_target}`);

  return lines.join('\n');
}

function formatValue(val: unknown): string {
  if (val === undefined || val === null) return '(none)';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function shortHash(hash: string): string {
  // Strip "sha256:" prefix if present, then take first 12 chars of the actual hash
  const stripped = hash.replace(/^sha256:/, '');
  return stripped.slice(0, 12);
}
