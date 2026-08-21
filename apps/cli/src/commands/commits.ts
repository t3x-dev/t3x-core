/**
 * Commit Commands
 */

import { createClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { createSpinner, error, formatDate, getApiUrl, printTable } from '../utils.js';

/** Register: t3x list commits */
export function registerListCommits(parent: Command): void {
  parent
    .command('commits')
    .alias('c')
    .description('List commits')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-b, --branch <name>', 'Filter by branch')
    .option('-l, --limit <number>', 'Maximum number of commits', '50')
    .option('-o, --offset <number>', 'Offset for pagination', '0')
    .action(async (options) => {
      const spinner = createSpinner('Fetching commits...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const result = await client.listCommits(options.project, {
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
        });

        spinner.stop();

        if (result.commits.length === 0) {
          console.log('No commits found.');
          return;
        }

        if (options.branch !== undefined) {
          console.log(
            'Branch filtering is not available on the Transition commit history endpoint; showing recent project commits.'
          );
        }

        printTable({
          columns: ['Commit', 'Decision', 'Parents', 'Recorded'],
          rows: result.commits.map((c) => [
            c.id.slice(0, 12),
            c.assurance.decision.digest.slice(0, 12),
            String(c.parents.length),
            formatDate(c.recordedAt),
          ]),
        });
      } catch (err) {
        spinner.stop();
        error(`Failed to list commits: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/** Register: t3x show commit <hash> */
export function registerShowCommit(parent: Command): void {
  parent
    .command('commit <hash>')
    .description('Show commit details')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (hash: string, options) => {
      const spinner = createSpinner('Fetching commit...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const commit = await client.getCommit(options.project, hash);

        spinner.stop();

        console.log();
        console.log(`Commit: ${commit.digest}`);
        console.log(`Schema: ${commit.object.schema}`);
        console.log(`Recorded: ${formatDate(commit.recorded_at)}`);
        console.log();
        console.log('Parents:');
        if (commit.object.parents.length === 0) {
          console.log('  (root commit)');
        } else {
          for (const p of commit.object.parents) {
            console.log(`  - ${p.digest.slice(0, 12)}`);
          }
        }
        console.log();
        console.log('Decision:');
        console.log(`  ${commit.object.decision.digest}`);
        console.log('Result:');
        console.log(`  ${commit.object.result.digest}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to get commit: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
