/**
 * Diff Command
 *
 * Compare two commits and display semantic differences.
 *
 *   t3x diff <from> <to> [--slot] [--json]
 */

import { createClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { formatSlotDiff, formatTreeDiff } from '../lib/diff-format.js';
import { createSpinner, error, getApiUrl } from '../utils.js';

export function registerDiffCommand(program: Command): void {
  program
    .command('diff <from> <to>')
    .description('Compare two commits (by hash or branch name)')
    .option('-p, --project <id>', 'Project ID (required when using branch names)')
    .option('--slot', 'Show slot-level word diff instead of tree-level summary')
    .option('--json', 'Output raw JSON')
    .action(async (from: string, to: string, options) => {
      const spinner = createSpinner('Computing diff...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });

        // Resolve branch names to commit hashes if needed
        const fromHash = await resolveRef(client, from, options.project);
        const toHash = await resolveRef(client, to, options.project);

        const result = await client.twoWayDiff({
          base_hash: fromHash,
          head_hash: toHash,
        });

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log();
        console.log(`Comparing ${fromHash.slice(0, 12)}...${toHash.slice(0, 12)}`);
        console.log();

        if (options.slot) {
          console.log(formatSlotDiff(result));
        } else {
          console.log(formatTreeDiff(result));
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to compute diff: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/**
 * Resolve a ref (commit hash or branch name) to a commit hash.
 *
 * If the ref looks like a hash (64-char hex or starts with sha256:),
 * return it as-is. Otherwise treat it as a branch name and fetch the
 * tip commit. Branch resolution requires a project ID.
 */
async function resolveRef(
  client: ReturnType<typeof createClient>,
  ref: string,
  projectId?: string
): Promise<string> {
  // Looks like a full or partial commit hash
  if (ref.startsWith('sha256:') || /^[0-9a-f]{8,64}$/.test(ref)) {
    return ref;
  }

  // Branch name — needs project context
  if (!projectId) {
    throw new Error(
      `Branch name "${ref}" requires --project. Provide -p <project_id> or use a commit hash.`
    );
  }

  const result = await client.listCommits(projectId, ref, { limit: 1, offset: 0 });
  if (result.commits.length === 0) {
    throw new Error(`Branch not found or has no commits: ${ref}`);
  }
  return result.commits[0].commit_hash;
}
