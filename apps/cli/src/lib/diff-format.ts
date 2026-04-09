/**
 * Diff output formatters for CLI display.
 */
import chalk from 'chalk';

interface DiffChange {
  type: 'added' | 'removed' | 'modified';
  path: string;
  old_value?: unknown;
  new_value?: unknown;
}

interface DiffResult {
  changes: DiffChange[];
  stats: { added: number; removed: number; modified: number };
}

/**
 * Tree-level diff — one line per node showing what changed.
 */
export function formatTreeDiff(diff: DiffResult): string {
  if (diff.changes.length === 0) {
    return chalk.gray('  No differences.');
  }

  const lines: string[] = [];

  for (const change of diff.changes) {
    switch (change.type) {
      case 'modified': {
        const slotCount = countChangedSlots(change.old_value, change.new_value);
        lines.push(
          chalk.yellow(`  ± ${change.path}`) +
            chalk.gray(` (${slotCount} slot${slotCount !== 1 ? 's' : ''} changed)`)
        );
        break;
      }
      case 'added':
        lines.push(chalk.green(`  + ${change.path}`) + chalk.gray(' (added)'));
        break;
      case 'removed':
        lines.push(chalk.red(`  - ${change.path}`) + chalk.gray(' (removed)'));
        break;
    }
  }

  lines.push('');
  const parts: string[] = [];
  if (diff.stats.modified > 0) parts.push(`${diff.stats.modified} modified`);
  if (diff.stats.added > 0) parts.push(`${diff.stats.added} added`);
  if (diff.stats.removed > 0) parts.push(`${diff.stats.removed} removed`);
  lines.push(chalk.gray(`Summary: ${parts.join(', ')}`));

  return lines.join('\n');
}

/**
 * Slot-level diff — shows individual slot changes within each node.
 */
export function formatSlotDiff(diff: DiffResult): string {
  if (diff.changes.length === 0) {
    return chalk.gray('  No differences.');
  }

  const lines: string[] = [];

  for (const change of diff.changes) {
    switch (change.type) {
      case 'modified': {
        lines.push(chalk.yellow(`± ${change.path}`));
        const oldSlots = flattenSlots(change.old_value);
        const newSlots = flattenSlots(change.new_value);
        const allKeys = new Set([...Object.keys(oldSlots), ...Object.keys(newSlots)]);
        for (const key of allKeys) {
          const oldVal = oldSlots[key];
          const newVal = newSlots[key];
          if (oldVal === newVal) {
            lines.push(chalk.gray(`  ${key}: (unchanged)`));
          } else if (oldVal !== undefined && newVal !== undefined) {
            lines.push(`  ${key}:  ${chalk.red(String(oldVal))} → ${chalk.green(String(newVal))}`);
          } else if (oldVal === undefined) {
            lines.push(chalk.green(`  ${key}: ${String(newVal)}`));
          } else {
            lines.push(chalk.red(`  ${key}: ${String(oldVal)} (removed)`));
          }
        }
        lines.push('');
        break;
      }
      case 'added': {
        lines.push(chalk.green(`+ ${change.path}`));
        const slots = flattenSlots(change.new_value);
        for (const [key, val] of Object.entries(slots)) {
          lines.push(chalk.green(`  ${key}: ${String(val)}`));
        }
        lines.push('');
        break;
      }
      case 'removed': {
        lines.push(chalk.red(`- ${change.path}`));
        const slots = flattenSlots(change.old_value);
        for (const [key, val] of Object.entries(slots)) {
          lines.push(chalk.red(`  ${key}: ${String(val)}`));
        }
        lines.push('');
        break;
      }
    }
  }

  const parts: string[] = [];
  if (diff.stats.modified > 0) parts.push(`${diff.stats.modified} modified`);
  if (diff.stats.added > 0) parts.push(`${diff.stats.added} added`);
  if (diff.stats.removed > 0) parts.push(`${diff.stats.removed} removed`);
  lines.push(chalk.gray(`Summary: ${parts.join(', ')}`));

  return lines.join('\n');
}

/** Count how many top-level keys differ between old and new value objects. */
function countChangedSlots(oldVal: unknown, newVal: unknown): number {
  const oldSlots = flattenSlots(oldVal);
  const newSlots = flattenSlots(newVal);
  const allKeys = new Set([...Object.keys(oldSlots), ...Object.keys(newSlots)]);
  let count = 0;
  for (const key of allKeys) {
    if (oldSlots[key] !== newSlots[key]) count++;
  }
  return count;
}

/** Flatten an object's top-level keys to string values. */
function flattenSlots(val: unknown): Record<string, string> {
  if (!val || typeof val !== 'object') return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    result[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return result;
}
