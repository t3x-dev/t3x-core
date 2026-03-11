/**
 * Leaf Commands
 */

import { createClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import {
  createSpinner,
  error,
  formatDate,
  getApiUrl,
  printTable,
  success,
  truncate,
} from '../utils.js';

export function registerLeafCommands(program: Command): void {
  const leaves = program.command('leaves').alias('l').description('Manage leaves');

  // List leaves
  leaves
    .command('list')
    .alias('ls')
    .description('List leaves in a project')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = createSpinner('Fetching leaves...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const leaves = await client.listLeaves(options.project);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(leaves, null, 2));
          return;
        }

        if (leaves.length === 0) {
          console.log('No leaves found.');
          return;
        }

        printTable({
          columns: ['ID', 'Type', 'Title', 'Commit', 'Created'],
          rows: leaves.map((l) => [
            l.id,
            l.type,
            truncate(l.title || '(untitled)', 30),
            l.commit_hash.slice(0, 12),
            formatDate(l.created_at),
          ]),
        });
      } catch (err) {
        spinner.stop();
        error(`Failed to list leaves: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Show leaf
  leaves
    .command('show <id>')
    .description('Show leaf details')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      const spinner = createSpinner('Fetching leaf...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const leaf = await client.getLeaf(id);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(leaf, null, 2));
          return;
        }

        console.log();
        console.log(`Leaf: ${leaf.id}`);
        console.log(`Type: ${leaf.type}`);
        console.log(`Title: ${leaf.title || '(untitled)'}`);
        console.log(`Commit: ${leaf.commit_hash}`);
        console.log(`Created: ${formatDate(leaf.created_at)}`);
        console.log(`Constraints: ${leaf.constraints.length}`);
        console.log(`Assertions: ${leaf.assertions.length}`);
        if (leaf.output) {
          console.log();
          console.log('Output:');
          console.log(truncate(leaf.output, 500));
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to get leaf: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Create leaf
  leaves
    .command('create')
    .description('Create a new leaf')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('-c, --commit <hash>', 'Commit hash')
    .requiredOption('-t, --type <type>', 'Leaf type (deploy_agent, tweet, email, etc.)')
    .option('--title <title>', 'Leaf title')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = createSpinner('Creating leaf...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const leaf = await client.createLeaf({
          project_id: options.project,
          commit_hash: options.commit,
          type: options.type,
          title: options.title,
        });

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(leaf, null, 2));
          return;
        }

        success(`Leaf created: ${leaf.id}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to create leaf: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Generate leaf output
  leaves
    .command('generate <id>')
    .description('Generate output for a leaf')
    .option('--model <model>', 'Model to use')
    .option('--provider <provider>', 'Provider to use')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      const spinner = createSpinner('Generating leaf output...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const leaf = await client.generateLeaf(id, {
          model: options.model,
          provider: options.provider,
        });

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(leaf, null, 2));
          return;
        }

        success(`Output generated for leaf ${leaf.id}`);
        if (leaf.output) {
          console.log();
          console.log(truncate(leaf.output, 500));
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to generate leaf: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Delete leaf
  leaves
    .command('delete <id>')
    .description('Delete a leaf')
    .option('--confirm', 'Confirm deletion')
    .action(async (id: string, options) => {
      if (!options.confirm) {
        console.log('Use --confirm to confirm deletion');
        process.exit(1);
      }

      const spinner = createSpinner('Deleting leaf...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        await client.deleteLeaf(id);

        spinner.stop();
        success(`Leaf deleted: ${id}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to delete leaf: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
