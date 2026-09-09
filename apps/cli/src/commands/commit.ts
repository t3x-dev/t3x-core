/**
 * Commit Command
 *
 * Compatibility command for the canonical Transition commit action.
 */

import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, success } from '../utils.js';

export function registerCommitCommand(program: Command): void {
  program
    .command('commit <transition-id>')
    .description('Commit an accepted Transition with exact expected-head CAS')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .requiredOption('--decision-digest <digest>', 'Accepted or authorized Decision digest')
    .option('--expected-head <digest>', 'Expected current ref head')
    .option('--empty-head', 'Expect the target ref to be empty')
    .option('--json', 'Output as JSON')
    .action(async (transitionId: string, options) => {
      if (options.emptyHead && options.expectedHead !== undefined) {
        error('Use either --empty-head or --expected-head, not both');
        process.exit(1);
        return;
      }
      if (!options.emptyHead && !options.expectedHead) {
        error('Provide --expected-head <digest> or --empty-head');
        process.exit(1);
        return;
      }
      const spinner = options.json ? null : createSpinner('Committing Transition...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const result = await client.commitTransition(options.project, transitionId, {
          request_id: options.requestId,
          decision_digest: options.decisionDigest,
          expected_head: options.emptyHead ? null : options.expectedHead,
        });

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          success('Committed Transition');
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed to commit Transition: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
