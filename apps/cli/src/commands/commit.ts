/**
 * Commit Command
 *
 * Read a local YAML/JSON file, validate against T3X schema, and commit via API.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, readStdin, success } from '../utils.js';
import { parseAndValidate } from './validate.js';

export function registerCommitCommand(program: Command): void {
  program
    .command('commit [file]')
    .description('Commit a YAML/JSON file as a semantic commit')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-m, --message <message>', 'Commit message')
    .option('-b, --branch <branch>', 'Branch name (default: main)')
    .option('--stdin', 'Read from stdin')
    .option('--json', 'Output as JSON')
    .action(async (file: string | undefined, options) => {
      // 1. Read content
      let raw: string;
      if (options.stdin) {
        raw = await readStdin();
      } else if (file) {
        const resolvedPath = path.resolve(file);
        if (!fs.existsSync(resolvedPath)) {
          error(`File not found: ${resolvedPath}`);
          process.exit(1);
        }
        raw = fs.readFileSync(resolvedPath, 'utf-8');
      } else {
        error('Provide a file path or use --stdin');
        process.exit(1);
        return;
      }

      // 2. Detect format
      let format: 'json' | 'yaml';
      if (file) {
        const ext = path.extname(file).toLowerCase();
        format = ext === '.json' ? 'json' : 'yaml';
      } else {
        format = raw.trimStart().startsWith('{') ? 'json' : 'yaml';
      }

      // 3. Validate locally
      const validation = parseAndValidate(raw, format, false);
      if (!validation.valid) {
        error('Validation failed:');
        for (const e of validation.errors) {
          console.error(`  - ${e}`);
        }
        process.exit(1);
        return;
      }

      // 4. Parse content for API (we need the actual object, not the string)
      // parseAndValidate already validated, so we can safely parse again
      let content: unknown;
      if (format === 'yaml') {
        const YAML = await import('yaml');
        content = YAML.default.parse(raw);
      } else {
        content = JSON.parse(raw);
      }

      // 5. Commit via API
      const spinner = createSpinner('Committing...');
      spinner.start();

      try {
        const client = getClientWithAuth();
        const result = await client.createCommit({
          project_id: options.project,
          content: content as { trees: unknown[]; relations?: unknown[] },
          message: options.message,
          branch: options.branch,
        });

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          success(`Committed: ${result.commit_hash}`);
          if (result.branch) {
            console.log(`  Branch: ${result.branch}`);
          }
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to commit: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
