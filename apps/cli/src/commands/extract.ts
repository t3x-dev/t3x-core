/**
 * Extract Commands
 */

import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, success } from '../utils.js';

export function registerExtractCommands(program: Command): void {
  program
    .command('extract')
    .description('Create a repository Workspace proposal from immutable Source turns')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--workspace <id>', 'Repository Workspace ID')
    .requiredOption('--source-thread <id>', 'Immutable Source Thread ID')
    .requiredOption('--turn-hash <hash...>', 'Exact immutable Source turn hashes')
    .option('--if-revision <revision>', 'Expected Workspace revision')
    .option('--provider <provider>', 'Workspace extraction provider override')
    .option('--model <model>', 'Workspace extraction model override')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!options.turnHash?.length) {
        error('Workspace extraction requires at least one --turn-hash');
        process.exitCode = 1;
        return;
      }

      const spinner = options.json ? null : createSpinner('Extracting...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        const revision = options.ifRevision === undefined ? undefined : Number(options.ifRevision);
        if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
          throw new Error('--if-revision must be a positive integer');
        }
        const result = await client.workspaces.createExtractionProposal(
          options.project,
          options.workspace,
          {
            source: {
              type: 'conversation',
              id: options.sourceThread,
              turn_hashes: options.turnHash,
            },
            ...(revision === undefined ? {} : { if_revision: revision }),
            ...(options.provider ? { provider: options.provider } : {}),
            ...(options.model ? { model: options.model } : {}),
          }
        );

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        success('Persisted Workspace extraction proposal');
        console.log(`Candidate: ${result.candidate_id}`);
        console.log(`Workspace: ${options.workspace}`);
        if (result.workspace.revision !== undefined) {
          console.log(`Revision: ${result.workspace.revision}`);
        }
      } catch (err) {
        spinner?.stop();
        error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
