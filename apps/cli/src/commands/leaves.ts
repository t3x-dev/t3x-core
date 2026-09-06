/**
 * Leaf Commands
 */

import type { Command } from 'commander';
import {
  createSpinner,
  error,
  formatDate,
  getClientWithAuth,
  printTable,
  success,
  truncate,
} from '../utils.js';

/** Register: t3x list leaves */
export function registerListLeaves(parent: Command): void {
  parent
    .command('leaves')
    .description('List leaves in a project')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = options.json ? null : createSpinner('Fetching leaves...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const leaves = await client.listLeaves(options.project);

        spinner?.stop();

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
        spinner?.stop();
        error(`Failed to list leaves: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/** Register: t3x show leaf <id> */
export function registerShowLeaf(parent: Command): void {
  parent
    .command('leaf <id>')
    .description('Show leaf details')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      const spinner = options.json ? null : createSpinner('Fetching leaf...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const leaf = await client.getLeaf(id);

        spinner?.stop();

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
        console.log(`Assertions: ${Array.isArray(leaf.assertions) ? leaf.assertions.length : 0}`);
        if (leaf.output) {
          console.log();
          console.log('Output:');
          console.log(truncate(leaf.output, 500));
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed to get leaf: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/** Register: t3x create leaf */
export function registerCreateLeaf(parent: Command): void {
  parent
    .command('leaf')
    .description('Retired Leaf writer; use State/Commit export')
    .option('-p, --project <id>')
    .option('-c, --commit <hash>')
    .option('-t, --type <type>')
    .option('--title <title>')
    .option('--model <model>')
    .option('--provider <provider>')
    .option('--json')
    .action(() => {
      error(
        'LEAF_WRITER_RETIRED: Export exact YAML/JSON or its render from State or Commit; use Workspace Delivery. Historical Leaf reads remain available.'
      );
      process.exit(1);
    });
}

/** Register: t3x generate leaf <id> */
export function registerGenerateLeaf(parent: Command): void {
  parent
    .command('leaf <id>')
    .description('Retired Leaf writer; use State/Commit export')
    .option('-p, --project <id>')
    .option('-c, --commit <hash>')
    .option('-t, --type <type>')
    .option('--title <title>')
    .option('--model <model>')
    .option('--provider <provider>')
    .option('--json')
    .action(() => {
      error(
        'LEAF_WRITER_RETIRED: Export exact YAML/JSON or its render from State or Commit; use Workspace Delivery. Historical Leaf reads remain available.'
      );
      process.exit(1);
    });
}

/** Register: t3x delete leaf <id> */
export function registerDeleteLeaf(parent: Command): void {
  parent
    .command('leaf <id>')
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
        const client = getClientWithAuth();
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
