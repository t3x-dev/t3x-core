/**
 * Status Commands
 */

import { createClient } from '@t3x-dev/api-client';
import chalk from 'chalk';
import type { Command } from 'commander';
import { createSpinner, error, getApiUrl } from '../utils.js';

export function registerStatusCommands(program: Command): void {
  // Health check
  program
    .command('health')
    .description('Check API health')
    .action(async () => {
      const spinner = createSpinner('Checking health...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const health = await client.health();

        spinner.stop();

        const statusColor = health.status === 'ok' ? chalk.green : chalk.red;
        console.log();
        console.log(`Status: ${statusColor(health.status)}`);
        console.log(`Version: ${health.version}`);
        console.log(`Uptime: ${health.uptime}s`);
      } catch (err) {
        spinner.stop();
        error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Status
  program
    .command('status')
    .description('Get API status')
    .action(async () => {
      const spinner = createSpinner('Fetching status...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const status = await client.status();

        spinner.stop();

        console.log();
        console.log(`Version: ${status.version}`);
        console.log(`Environment: ${status.environment}`);
        console.log(`Uptime: ${Math.floor(status.uptime_seconds / 60)} minutes`);
        console.log();
        console.log('Database:');
        console.log(`  Type: ${status.database.type}`);
        console.log(
          `  Connected: ${status.database.connected ? chalk.green('Yes') : chalk.red('No')}`
        );
      } catch (err) {
        spinner.stop();
        error(`Status check failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
