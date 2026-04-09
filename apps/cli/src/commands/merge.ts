/**
 * Merge Commands
 *
 * Two-phase merge workflow via server-side merge drafts.
 *
 *   t3x merge prepare <source> <target> -p <project> [--auto] [-m "msg"]
 *   t3x merge execute <merge_id> -m "msg"
 *   t3x merge abort <merge_id>
 */

import type { T3xClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { formatMergeCommitResult, formatPrepareResult } from '../lib/merge-format.js';
import { createSpinner, error, getClientWithAuth, success } from '../utils.js';

function getWebUrl(): string {
  return process.env.T3X_WEB_URL || 'http://localhost:3000';
}

export function registerMergeCommands(program: Command): void {
  const merge = program.command('merge').description('Merge branches (two-phase)');

  // ── t3x merge prepare ──────────────────────────────────────
  merge
    .command('prepare <source> <target>')
    .description('Prepare a merge between two commits or branches')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-m, --message <msg>', 'Pre-set commit message')
    .option('--auto', 'Auto-execute if zero conflicts')
    .action(async (source: string, target: string, options) => {
      const spinner = createSpinner('Preparing merge...');
      spinner.start();

      try {
        const client = getClientWithAuth();

        // Resolve branch names to commit hashes
        const sourceHash = await resolveRef(client, source, options.project);
        const targetHash = await resolveRef(client, target, options.project);

        const draft = await client.createMergeDraft({
          project_id: options.project,
          source_hash: sourceHash,
          target_hash: targetHash,
        });

        spinner.stop();
        success(`Merge prepared (${draft.id})`);
        console.log();

        const prepared = draft.prepared;
        const conflicts = (prepared.conflicts || []).map((c) => ({
          path: c.path,
          sourceValue: c.slotConflicts?.[0]?.sourceValue,
          targetValue: c.slotConflicts?.[0]?.targetValue,
        }));

        console.log(
          formatPrepareResult({
            mergeId: draft.id,
            autoKept: prepared.autoKept?.length || 0,
            onlyInSource: prepared.onlyInSource?.length || 0,
            onlyInTarget: prepared.onlyInTarget?.length || 0,
            conflicts,
            projectId: options.project,
            webUrl: getWebUrl(),
          })
        );

        // Auto-merge path
        if (options.auto && conflicts.length === 0) {
          console.log();
          const autoSpinner = createSpinner('No conflicts — auto-merging...');
          autoSpinner.start();

          const message = options.message || `Merge ${source} into ${target}`;
          const commitResult = await client.commitMergeDraft(draft.id, {
            message,
            decisions: {
              conflictResolutions: {},
              keepFromSource: prepared.onlyInSource || [],
              keepFromTarget: prepared.onlyInTarget || [],
              keepRelationsFromSource: true,
              keepRelationsFromTarget: true,
            },
          });

          autoSpinner.stop();
          success(`Merged! Commit: ${commitResult.hash.slice(0, 12)}`);
          console.log();
          console.log(
            formatMergeCommitResult({
              hash: commitResult.hash,
              parents: commitResult.parents,
              branch: commitResult.branch,
              mergeSummary: commitResult.merge_summary,
            })
          );
        }
      } catch (err) {
        spinner.stop();
        error(`Failed to prepare merge: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ── t3x merge execute ──────────────────────────────────────
  merge
    .command('execute <merge_id>')
    .description('Execute a prepared merge (all conflicts must be resolved)')
    .requiredOption('-m, --message <msg>', 'Commit message')
    .option('-b, --branch <name>', 'Target branch')
    .action(async (mergeId: string, options) => {
      const spinner = createSpinner('Executing merge...');
      spinner.start();

      try {
        const client = getClientWithAuth();

        const commitResult = await client.commitMergeDraft(mergeId, {
          message: options.message,
          branch: options.branch,
        });

        spinner.stop();
        success(`Merged! Commit: ${commitResult.hash.slice(0, 12)}`);
        console.log();
        console.log(
          formatMergeCommitResult({
            hash: commitResult.hash,
            parents: commitResult.parents,
            branch: commitResult.branch,
            mergeSummary: commitResult.merge_summary,
          })
        );
      } catch (err) {
        spinner.stop();
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('unresolved') || message.includes('conflict')) {
          error(`Unresolved conflicts. Resolve in WebUI first.`);
        } else {
          error(`Failed to execute merge: ${message}`);
        }
        process.exit(1);
      }
    });

  // ── t3x merge abort ────────────────────────────────────────
  merge
    .command('abort <merge_id>')
    .description('Abort a pending merge and delete the draft')
    .action(async (mergeId: string) => {
      const spinner = createSpinner('Aborting merge...');
      spinner.start();

      try {
        const client = getClientWithAuth();
        await client.deleteMergeDraft(mergeId);

        spinner.stop();
        success(`Merge draft ${mergeId} aborted.`);
      } catch (err) {
        spinner.stop();
        error(`Failed to abort merge: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

/**
 * Resolve a ref (commit hash or branch name) to a commit hash.
 * Same logic as diff command — duplicated intentionally to keep
 * each command file self-contained.
 */
async function resolveRef(client: T3xClient, ref: string, projectId: string): Promise<string> {
  if (ref.startsWith('sha256:') || /^[0-9a-f]{8,64}$/.test(ref)) {
    return ref;
  }

  const result = await client.listCommits(projectId, ref, { limit: 1, offset: 0 });
  if (result.commits.length === 0) {
    throw new Error(`Branch not found or has no commits: ${ref}`);
  }
  return result.commits[0].commit_hash;
}
