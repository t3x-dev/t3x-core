/**
 * Commit Commands
 */

import { createClient } from '@t3x/api-client';
import type { Command } from 'commander';
import { createSpinner, error, formatDate, getApiUrl, printTable, truncate } from '../utils.js';

export function registerCommitCommands(program: Command): void {
  const commits = program.command('commits').alias('c').description('Manage commits');

  // List commits
  commits
    .command('list')
    .alias('ls')
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
        const result = await client.listCommits(options.project, options.branch, {
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
        });

        spinner.stop();

        if (result.commits.length === 0) {
          console.log('No commits found.');
          return;
        }

        printTable({
          columns: ['Hash', 'Branch', 'Message', 'Created'],
          rows: result.commits.map((c) => [
            c.commit_hash.slice(0, 12),
            c.branch,
            truncate(c.message, 40),
            formatDate(c.created_at),
          ]),
        });
      } catch (err) {
        spinner.stop();
        error(`Failed to list commits: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Get commit
  commits
    .command('show <hash>')
    .description('Show commit details')
    .action(async (hash: string) => {
      const spinner = createSpinner('Fetching commit...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const commit = await client.getCommit(hash);

        spinner.stop();

        console.log();
        console.log(`Commit: ${commit.commit_hash}`);
        console.log(`Branch: ${commit.branch}`);
        console.log(`Message: ${commit.message}`);
        console.log(`Created: ${formatDate(commit.created_at)}`);
        console.log();
        console.log('Parents:');
        if (commit.parent_hashes.length === 0) {
          console.log('  (root commit)');
        } else {
          for (const p of commit.parent_hashes) {
            console.log(`  - ${p.slice(0, 12)}`);
          }
        }
        console.log();
        console.log('Turn Window:');
        console.log(`  Start: ${commit.turn_window.start_turn_hash.slice(0, 12)}`);
        console.log(`  End: ${commit.turn_window.end_turn_hash.slice(0, 12)}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to get commit: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
