/**
 * Import Commands
 *
 * Import content from URLs, files, and platform exports.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@t3x/api-client';
import type { Command } from 'commander';
import { createSpinner, error, getApiUrl, info, success } from '../utils.js';

export function registerImportCommands(program: Command): void {
  const imp = program.command('import').alias('i').description('Import content into a project');

  // Import from URL
  imp
    .command('url <url>')
    .description('Import content from a URL')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (url: string, options) => {
      const spinner = createSpinner('Importing from URL...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const result = await client.importUrl({
          url,
          project_id: options.project,
        });

        spinner.stop();
        success(
          `Imported ${result.turns_imported} turns into conversation ${result.conversation_id}`
        );
        if (result.duplicate_warning) {
          info(`Note: ${result.duplicate_warning}`);
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to import URL: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Import document file
  imp
    .command('file <path>')
    .description('Import a document file (PDF, TXT, MD, HTML, DOCX)')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (filePath: string, options) => {
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        error(`File not found: ${resolvedPath}`);
        process.exit(1);
      }

      const spinner = createSpinner(`Importing ${path.basename(resolvedPath)}...`);
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const buffer = fs.readFileSync(resolvedPath);
        const blob = new Blob([buffer]);
        const filename = path.basename(resolvedPath);

        const result = await client.importDocument(options.project, blob, filename);

        spinner.stop();
        success(
          `Imported ${result.turns_imported} turns into conversation ${result.conversation_id}`
        );
        if (result.duplicate_warning) {
          info(`Note: ${result.duplicate_warning}`);
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to import file: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Import platform export
  imp
    .command('platform <path>')
    .description('Import platform export (ChatGPT, Claude, Gemini, Discord, Feishu JSON)')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (filePath: string, options) => {
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        error(`File not found: ${resolvedPath}`);
        process.exit(1);
      }

      const spinner = createSpinner(`Importing platform export...`);
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const platformData = fs.readFileSync(resolvedPath, 'utf-8');

        const result = await client.importPlatform(options.project, platformData);

        spinner.stop();
        success(
          `Imported ${result.total_conversations} conversations (${result.total_turns} turns)`
        );
        for (const conv of result.imported) {
          info(`  ${conv.title} → ${conv.conversation_id} (${conv.turns_imported} turns)`);
        }
      } catch (err) {
        spinner.stop();
        error(
          `Failed to import platform export: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    });

  // Batch import multiple files
  imp
    .command('batch <glob>')
    .description('Batch import multiple files matching a glob pattern')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--type <type>', 'Import type: url, file, platform', 'file')
    .action(async (globPattern: string, options) => {
      // Use glob to find matching files
      let files: string[];
      try {
        const { globSync } = await import('glob');
        files = globSync(globPattern);
      } catch {
        error('glob package not available. Install with: npm install -g glob');
        process.exit(1);
      }

      if (files.length === 0) {
        error(`No files matching pattern: ${globPattern}`);
        process.exit(1);
      }

      info(`Found ${files.length} file(s) to import`);

      const client = createClient({ baseUrl: getApiUrl() });
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const filePath = path.resolve(files[i]);
        const filename = path.basename(filePath);
        const spinner = createSpinner(`[${i + 1}/${files.length}] Importing ${filename}...`);
        spinner.start();

        try {
          if (options.type === 'platform') {
            const platformData = fs.readFileSync(filePath, 'utf-8');
            const result = await client.importPlatform(options.project, platformData);
            spinner.stop();
            success(
              `${filename}: ${result.total_conversations} conversations (${result.total_turns} turns)`
            );
          } else {
            const buffer = fs.readFileSync(filePath);
            const blob = new Blob([buffer]);
            const result = await client.importDocument(options.project, blob, filename);
            spinner.stop();
            success(`${filename}: ${result.turns_imported} turns`);
          }
          successCount++;
        } catch (err) {
          spinner.stop();
          error(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
          failCount++;
        }
      }

      info(`\nBatch complete: ${successCount} succeeded, ${failCount} failed`);
      if (failCount > 0) process.exit(1);
    });
}
