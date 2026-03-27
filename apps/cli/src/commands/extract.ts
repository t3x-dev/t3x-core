/**
 * Extract Commands
 */

import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, readStdin, success } from '../utils.js';

export function registerExtractCommands(program: Command): void {
  program
    .command('extract')
    .description('Extract semantic knowledge from text')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--text <text>', 'Text to extract from')
    .option('--conversation-id <id>', 'Conversation ID for incremental extraction')
    .option('--source <source>', 'Source label')
    .option('--stdin', 'Read text from stdin')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      let text = options.text;

      if (options.stdin) {
        text = await readStdin();
      }

      if (!text) {
        error('Provide text via --text or --stdin');
        process.exit(1);
      }

      const spinner = options.json ? null : createSpinner('Extracting...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const result = await client.extract({
          project_id: options.project,
          text,
          conversation_id: options.conversationId,
          source: options.source,
        });

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        success(`Extracted ${result.trees.length} trees`);
        console.log(`Draft: ${result.draft_id}`);
        console.log(`Conversation: ${result.conversation_id}`);
        if (result.drift && result.drift.length > 0) {
          console.log(`Drift detected: ${result.drift.length} changes`);
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
