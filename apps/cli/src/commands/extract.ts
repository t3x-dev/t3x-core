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
    .option('--workspace <id>', 'Repository Workspace ID for Source-backed extraction')
    .option('--source-thread <id>', 'Immutable Source Thread ID')
    .option('--turn-hash <hash...>', 'Exact immutable Source turn hashes')
    .option('--if-revision <revision>', 'Expected Workspace revision')
    .option('--provider <provider>', 'Workspace extraction provider override')
    .option('--model <model>', 'Workspace extraction model override')
    .option('--stdin', 'Read text from stdin')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      let text = options.text;

      if (options.stdin) {
        text = await readStdin();
      }

      const workspaceMode = Boolean(
        options.workspace ||
          options.sourceThread ||
          options.turnHash ||
          options.ifRevision ||
          options.provider ||
          options.model
      );
      if (
        workspaceMode &&
        (!options.workspace || !options.sourceThread || !options.turnHash?.length)
      ) {
        error('Workspace extraction requires --workspace, --source-thread, and --turn-hash');
        process.exitCode = 1;
        return;
      }
      if (!workspaceMode && !text) {
        error(
          'Provide text via --text or --stdin, or select a Workspace and immutable Source turns'
        );
        process.exitCode = 1;
        return;
      }

      const spinner = options.json ? null : createSpinner('Extracting...');
      spinner?.start();

      try {
        const client = getClientWithAuth();
        if (workspaceMode) {
          const revision =
            options.ifRevision === undefined ? undefined : Number(options.ifRevision);
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
          return;
        }

        const result = await client.extract({
          project_id: options.project,
          text: text!,
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
