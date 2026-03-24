/**
 * Show Command
 */

import { createClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { createSpinner, error, getApiUrl } from '../utils.js';

export function registerShowCommands(program: Command): void {
  program
    .command('show')
    .description('Show current project knowledge')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-b, --branch <branch>', 'Branch name (default: main)')
    .option('--format <format>', 'Output format: json or yaml', 'json')
    .option('--json', 'Output as JSON (same as --format json)')
    .action(async (options) => {
      const format = options.json ? 'json' : options.format;
      const spinner = options.json ? null : createSpinner('Fetching context...');
      spinner?.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const result = await client.context(options.project, {
          branch: options.branch,
          format,
        });

        spinner?.stop();

        if (options.json || format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.yaml) {
          console.log(result.yaml);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
