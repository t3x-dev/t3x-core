/**
 * Export Commands
 */

import { createClient } from '@t3x/api-client';
import * as fs from 'node:fs';
import type { Command } from 'commander';
import { createSpinner, error, getApiUrl, success } from '../utils.js';

export function registerExportCommands(program: Command): void {
  const exp = program.command('export').alias('x').description('Export project data');

  // Export cfpack
  exp
    .command('cfpack')
    .description('Export project as .cfpack JSON archive')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      const spinner = createSpinner('Exporting cfpack...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const blob = await client.exportCfpack({ project_id: options.project });
        const content = await blob.text();

        spinner.stop();

        const outputFile = options.output || `${options.project}.cfpack`;
        fs.writeFileSync(outputFile, content, 'utf-8');
        success(`Exported to ${outputFile}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to export cfpack: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Export ledger
  exp
    .command('ledger')
    .description('Export project as JSONL ledger')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      const spinner = createSpinner('Exporting ledger...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const content = await client.exportLedger({ project_id: options.project });

        spinner.stop();

        const outputFile = options.output || `${options.project}.jsonl`;
        fs.writeFileSync(outputFile, content, 'utf-8');
        success(`Exported to ${outputFile}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to export ledger: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Export leaf output
  exp
    .command('leaf <id>')
    .description('Export leaf output to file')
    .option('-o, --output <file>', 'Output file path')
    .option('--json', 'Output as JSON (full leaf)')
    .action(async (id: string, options) => {
      const spinner = createSpinner('Fetching leaf...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const leaf = await client.getLeaf(id);

        spinner.stop();

        if (options.json) {
          const content = JSON.stringify(leaf, null, 2);
          if (options.output) {
            fs.writeFileSync(options.output, content, 'utf-8');
            success(`Exported to ${options.output}`);
          } else {
            console.log(content);
          }
          return;
        }

        if (!leaf.output) {
          error('Leaf has no generated output');
          process.exit(1);
        }

        if (options.output) {
          fs.writeFileSync(options.output, leaf.output, 'utf-8');
          success(`Exported to ${options.output}`);
        } else {
          console.log(leaf.output);
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to export leaf: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
