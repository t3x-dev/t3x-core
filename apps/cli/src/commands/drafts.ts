/**
 * Draft Commands (kubectl-style)
 *
 * CLI mutations to drafts MUST go through YOps.
 * These commands cover draft lifecycle (list/show/delete) only — no semantic
 * editing. For interactive semantic editing use the WebUI.
 */

import type { Command } from 'commander';
import {
  createSpinner,
  error,
  formatDate,
  getClientWithAuth,
  getDraftId,
  printTable,
  success,
  truncate,
} from '../utils.js';

/** Register: t3x list drafts */
export function registerListDrafts(parent: Command): void {
  parent
    .command('drafts')
    .description('List drafts for a project')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .option('-o, --offset <number>', 'Offset for pagination', '0')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = options.json ? null : createSpinner('Fetching drafts...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const result = await client.listDrafts(options.project, {
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
        });

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.drafts.length === 0) {
          console.log('No drafts found.');
          return;
        }

        printTable({
          columns: ['Draft ID', 'Conversation', 'Status', 'Intent', 'Created'],
          rows: result.drafts.map((d) => [
            d.draft_id,
            d.conversation_id,
            d.status,
            truncate(d.intent ?? '', 30),
            formatDate(d.created_at),
          ]),
        });
      } catch (err) {
        spinner?.stop();
        error(`Failed to list drafts: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
