/**
 * Show Command - Content Subcommand
 * Register: t3x show content
 */

import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth } from '../utils.js';

export function registerShowContent(parent: Command): void {
  parent
    .command('content')
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
        const client = getClientWithAuth();
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
