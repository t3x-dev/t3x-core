/**
 * Draft Commands (kubectl-style)
 *
 * CLI mutations to drafts MUST go through YOps.
 * These commands cover draft lifecycle (list/show/delete) only — no semantic
 * editing. For interactive semantic editing use the WebUI.
 */

import { createInterface } from 'node:readline/promises';
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

/** Register: t3x show draft [id] */
export function registerShowDraft(parent: Command): void {
  parent
    .command('draft [id]')
    .description('Show draft details (uses T3X_DRAFT env if id omitted)')
    .option('--json', 'Output as JSON')
    .action(async (idArg: string | undefined, options) => {
      const draftId = getDraftId(idArg);
      if (!draftId) return;
      const spinner = options.json ? null : createSpinner('Fetching draft...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const draft = (await client.getDraft(draftId)) as Record<string, unknown>;

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(draft, null, 2));
          return;
        }

        const id = String(draft.id ?? draft.draft_id ?? draftId);
        console.log();
        console.log(`Draft:         ${id}`);
        if (draft.project_id) console.log(`Project:       ${draft.project_id}`);
        if (draft.title) console.log(`Title:         ${draft.title}`);
        if (draft.status) console.log(`Status:        ${draft.status}`);
        if (typeof draft.revision === 'number') {
          console.log(`Revision:      ${draft.revision}`);
        }
        if (draft.created_at) console.log(`Created:       ${formatDate(String(draft.created_at))}`);
        if (Array.isArray(draft.nodes)) {
          console.log(`Nodes:         ${draft.nodes.length}`);
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed to show draft: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${prompt} [y/N] `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

/** Register: t3x delete draft [id] */
export function registerDeleteDraft(parent: Command): void {
  parent
    .command('draft [id]')
    .description('Delete a draft (uses T3X_DRAFT env if id omitted)')
    .option('--force', 'Skip confirmation prompt')
    .option('--json', 'Output as JSON (implies --force)')
    .action(async (idArg: string | undefined, options) => {
      const draftId = getDraftId(idArg);
      if (!draftId) return;

      const skipPrompt = options.force || options.json;
      if (!skipPrompt) {
        const ok = await confirm(`Delete draft ${draftId}?`);
        if (!ok) {
          console.log('Aborted.');
          return;
        }
      }

      const spinner = options.json ? null : createSpinner('Deleting draft...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        await client.deleteDraft(draftId);
        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify({ deleted: true, draft_id: draftId }, null, 2));
          return;
        }

        success(`Deleted draft ${draftId}`);
      } catch (err) {
        spinner?.stop();
        error(`Failed to delete draft: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

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

        const drafts = Array.isArray(result) ? result : (result.drafts ?? []);

        if (options.json) {
          console.log(JSON.stringify(drafts, null, 2));
          return;
        }

        if (drafts.length === 0) {
          console.log('No drafts found.');
          return;
        }

        printTable({
          columns: ['Draft ID', 'Status', 'Title', 'Created'],
          rows: drafts.map((d: Record<string, unknown>) => [
            String(d.id ?? d.draft_id ?? ''),
            String(d.status ?? ''),
            truncate(String(d.title ?? d.intent ?? ''), 30),
            formatDate(String(d.created_at ?? '')),
          ]),
        });
      } catch (err) {
        spinner?.stop();
        error(`Failed to list drafts: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
