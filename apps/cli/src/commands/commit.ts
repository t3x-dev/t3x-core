/**
 * Commit Command
 *
 * Commit a draft as an immutable structured-state commit.
 */

import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, getDraftId, success } from '../utils.js';

export function registerCommitCommand(program: Command): void {
  program
    .command('commit [draft-id]')
    .description('Commit a draft as an immutable structured-state commit')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-m, --message <message>', 'Commit message')
    .option('-b, --branch <branch>', 'Branch name (default: main)')
    .option('--json', 'Output as JSON')
    .action(async (draftIdArg: string | undefined, options) => {
      const draftId = getDraftId(draftIdArg);
      if (!draftId) return;
      const spinner = options.json ? null : createSpinner('Committing draft...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const result = await client.commitFromDraft({
          project_id: options.project,
          draft_id: draftId,
          message: options.message,
          branch: options.branch,
        });

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          success(`Committed: ${result.commit_hash}`);
          console.log(`  Draft: ${draftId}`);
          console.log(`  Trees: ${result.tree_count}`);
          if (result.branch) {
            console.log(`  Branch: ${result.branch}`);
          }
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed to commit draft: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
