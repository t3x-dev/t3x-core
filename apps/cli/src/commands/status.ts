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
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = createSpinner('Checking health...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const health = await client.health();

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(health, null, 2));
          return;
        }

        const statusColor = health.status === 'ok' ? chalk.green : chalk.red;
        console.log();
        console.log(`Status: ${statusColor(health.status)}`);
        console.log(`Service: ${health.service}`);
        console.log(`Timestamp: ${health.timestamp}`);

        if (health.database) {
          console.log();
          console.log('Database:');
          console.log(
            `  Connected: ${health.database.connected ? chalk.green('Yes') : chalk.red('No')}`
          );
          if (health.database.latency_ms !== undefined) {
            console.log(`  Latency: ${health.database.latency_ms}ms`);
          }
        }
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
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = createSpinner('Fetching status...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const status = await client.status();

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

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
