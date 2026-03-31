/**
 * Branch Commands
 */

import { createClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { createSpinner, error, formatDate, getApiUrl, printTable, success } from '../utils.js';

/** Register: t3x list branches */
export function registerListBranches(parent: Command): void {
  parent
    .command('branches')
    .description('List branches')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (options) => {
      const spinner = createSpinner('Fetching branches...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const result = await client.listBranches(options.project);

        spinner.stop();

        if (result.branches.length === 0) {
          console.log('No branches found.');
          return;
        }

        printTable({
          columns: ['ID', 'Name', 'Head Commit', 'Created'],
          rows: result.branches.map((b) => [
            b.branch_id,
            b.name,
            b.head_commit_hash?.slice(0, 12) || '(none)',
            formatDate(b.created_at),
          ]),
        });
      } catch (err) {
        spinner.stop();
        error(`Failed to list branches: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/** Register: t3x create branch <name> */
export function registerCreateBranch(parent: Command): void {
  parent
    .command('branch <name>')
    .description('Create a new branch')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-h, --head <hash>', 'Head commit hash')
    .action(async (name: string, options) => {
      const spinner = createSpinner('Creating branch...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const branch = await client.createBranch({
          project_id: options.project,
          name,
          head_commit_hash: options.head,
        });

        spinner.stop();
        success(`Branch created: ${branch.name} (${branch.branch_id})`);
      } catch (err) {
        spinner.stop();
        error(`Failed to create branch: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/** Register: t3x switch-branch <name> (independent command) */
export function registerSwitchBranch(program: Command): void {
  program
    .command('switch-branch <name>')
    .description('Switch to a branch')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (name: string, options) => {
      const spinner = createSpinner('Switching branch...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const branch = await client.switchBranch(options.project, name);

        spinner.stop();
        success(`Switched to branch: ${branch.name}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to switch branch: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/** Register: t3x current-branch (independent command) */
export function registerCurrentBranch(program: Command): void {
  program
    .command('current-branch')
    .description('Show current branch')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (options) => {
      const spinner = createSpinner('Fetching current branch...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const branch = await client.getCurrentBranch(options.project);

        spinner.stop();

        console.log();
        console.log(`Current branch: ${branch.name}`);
        console.log(`ID: ${branch.branch_id}`);
        console.log(`Head: ${branch.head_commit_hash?.slice(0, 12) || '(none)'}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to get current branch: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
