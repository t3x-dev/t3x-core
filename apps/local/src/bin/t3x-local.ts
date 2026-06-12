#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { runDoctorCommand } from '../commands/doctor.js';
import { runLaunchCommand } from '../commands/launch.js';
import { runResetCommand } from '../commands/reset.js';
import { runStartCommand } from '../commands/start.js';
import { runStopCommand } from '../commands/stop.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version?: string };

const program = new Command();

program
  .name('t3x-local')
  .description('T3X local runtime entrypoint')
  .version(packageJson.version ?? '0.0.0')
  .option('-y, --yes', 'Run setup and launch without confirmation prompts')
  .option('--no-open', 'Do not prompt to open the WebUI in a browser')
  .option('--verbose', 'Print API, log, and state details')
  .option('--data-dir <path>', 'Embedded PostgreSQL data directory')
  .option('--api-port <port>', 'API port (default: 8000)', parseInteger)
  .option('--web-port <port>', 'Web port (default: 3000)', parseInteger)
  .action(async (options) => {
    const result = await runLaunchCommand({
      ...options,
      packageVersion: packageJson.version ?? '0.0.0',
    });
    if (result === 'needs-yes') {
      process.exitCode = 1;
    }
  });

program
  .command('start')
  .description('Start the local API and Web runtimes in the background')
  .option('--data-dir <path>', 'Embedded PostgreSQL data directory')
  .option('--api-port <port>', 'API port (default: 8000)', parseInteger)
  .option('--web-port <port>', 'Web port (default: 3000)', parseInteger)
  .option('--verbose', 'Print API, log, and state details')
  .action(async (options) => {
    await runStartCommand(options);
  });

program
  .command('stop')
  .description('Stop the local API and Web runtimes')
  .action(async () => {
    await runStopCommand();
  });

program
  .command('doctor')
  .description('Print local runtime diagnostics')
  .option('--data-dir <path>', 'Embedded PostgreSQL data directory')
  .option('--api-port <port>', 'API port override', parseInteger)
  .option('--web-port <port>', 'Web port override', parseInteger)
  .action(async (options) => {
    await runDoctorCommand(options);
  });

program
  .command('reset')
  .description('Remove local runtime state and data')
  .option('--data-dir <path>', 'Embedded PostgreSQL data directory')
  .option('--force', 'Stop the runtime before clearing local data')
  .action(async (options) => {
    await runResetCommand(options);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[t3x-local] ${message}`);
  process.exit(1);
});

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer: ${value}`);
  }
  return parsed;
}
