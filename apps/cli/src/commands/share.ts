/**
 * Share Commands
 */

import { createClient } from '@t3x/api-client';
import type { Command } from 'commander';
import { createSpinner, error, formatDate, getApiUrl, printTable, success } from '../utils.js';

export function registerShareCommands(program: Command): void {
  const share = program.command('share').description('Manage share links');

  // Create share link
  share
    .command('create')
    .description('Create a share link')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--entity-type <type>', 'Entity type (project, leaf, commit)')
    .requiredOption('--entity-id <id>', 'Entity ID')
    .option('--expires <hours>', 'Expiration in hours')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = createSpinner('Creating share link...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const token = await client.createShareToken({
          project_id: options.project,
          entity_type: options.entityType,
          entity_id: options.entityId,
          expires_in_hours: options.expires ? parseInt(options.expires, 10) : undefined,
        });

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(token, null, 2));
          return;
        }

        success(`Share link created: ${token.id}`);
        console.log(`Token: ${token.token}`);
        console.log(`Expires: ${token.expires_at ? formatDate(token.expires_at) : 'never'}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to create share link: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // List share links
  share
    .command('list')
    .alias('ls')
    .description('List share links')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = createSpinner('Fetching share links...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const tokens = await client.listShareTokensByEntity('project', options.project);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(tokens, null, 2));
          return;
        }

        if (tokens.length === 0) {
          console.log('No share links found.');
          return;
        }

        printTable({
          columns: ['ID', 'Type', 'Entity', 'Created', 'Expires'],
          rows: tokens.map((t) => [
            t.id,
            t.entity_type,
            t.entity_id,
            formatDate(t.created_at),
            t.expires_at ? formatDate(t.expires_at) : 'never',
          ]),
        });
      } catch (err) {
        spinner.stop();
        error(`Failed to list share links: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Revoke share link
  share
    .command('revoke <id>')
    .description('Revoke a share link')
    .option('--confirm', 'Confirm revocation')
    .action(async (id: string, options) => {
      if (!options.confirm) {
        console.log('Use --confirm to confirm revocation');
        process.exit(1);
      }

      const spinner = createSpinner('Revoking share link...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        await client.revokeShareToken(id);

        spinner.stop();
        success(`Share link revoked: ${id}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to revoke share link: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
