/**
 * Transition control-plane commands.
 */

import type {
  ProposeTransitionInput,
  T3xClient,
  TransitionProtocolValue,
  TransitionReviewPrecondition,
} from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, success } from '../utils.js';

type JsonOption = { json?: boolean };

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`${label} must be valid JSON: ${message}`);
  }
}

function parseOperations(value: string): TransitionProtocolValue[] {
  const parsed = parseJson(value, 'operations');
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('operations must be a non-empty JSON array');
  }
  return parsed as TransitionProtocolValue[];
}

function parsePrecondition(value: string): TransitionReviewPrecondition {
  const parsed = parseJson(value, 'precondition');
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('precondition must be a JSON object');
  }
  return parsed as TransitionReviewPrecondition;
}

function parseRevision(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('if-revision must be a positive integer');
  }
  return parsed;
}

function resolveExpectedHead(options: {
  expectedHead?: string;
  emptyHead?: boolean;
}): string | null {
  if (options.emptyHead && options.expectedHead !== undefined) {
    throw new Error('Use either --empty-head or --expected-head, not both');
  }
  if (options.emptyHead) return null;
  if (options.expectedHead !== undefined && options.expectedHead.trim().length > 0) {
    return options.expectedHead;
  }
  throw new Error('Provide --expected-head <digest> or --empty-head');
}

async function runTransitionCommand<T>(
  label: string,
  options: JsonOption,
  task: (client: T3xClient) => Promise<T>
): Promise<void> {
  const spinner = options.json ? null : createSpinner(`${label}...`);
  spinner?.start();
  try {
    const result = await task(getClientWithAuth());
    spinner?.stop();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    success(label);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    spinner?.stop();
    error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export function registerTransitionCommands(program: Command): void {
  const transition = program
    .command('transition')
    .description('Run canonical Transition control-plane actions through the API boundary');

  transition
    .command('propose <workspace-id>')
    .description('Prepare a structured-yops Transition Proposal')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .option('--operations-json <json>', 'Non-empty JSON array of YOps operations')
    .option('--extraction-candidate-id <id>', 'Server-owned extraction candidate')
    .option('--why <text>', 'Concise rationale')
    .option('--if-revision <revision>', 'Workspace revision precondition')
    .option('--json', 'Output as JSON')
    .action(
      async (
        workspaceId: string,
        options: JsonOption & {
          project: string;
          requestId: string;
          operationsJson?: string;
          extractionCandidateId?: string;
          why?: string;
          ifRevision?: string;
        }
      ) => {
        await runTransitionCommand('Propose Transition', options, (client) => {
          if (
            (options.operationsJson === undefined) ===
            (options.extractionCandidateId === undefined)
          ) {
            throw new Error(
              'structured_yops propose requires exactly one of --operations-json or --extraction-candidate-id'
            );
          }
          const common = {
            request_id: options.requestId,
            workspace_id: workspaceId,
            ...(options.why === undefined ? {} : { why: options.why }),
            ...(parseRevision(options.ifRevision) === undefined
              ? {}
              : { if_revision: parseRevision(options.ifRevision) }),
          };
          const input: ProposeTransitionInput =
            options.extractionCandidateId === undefined
              ? {
                  ...common,
                  kind: 'structured_yops',
                  operations: parseOperations(options.operationsJson!),
                }
              : {
                  ...common,
                  kind: 'structured_yops',
                  extraction_candidate_id: options.extractionCandidateId,
                };
          return client.proposeTransition(options.project, input);
        });
      }
    );

  transition
    .command('inspect <transition-id>')
    .description('Inspect a project-scoped Transition view')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--json', 'Output as JSON')
    .action(async (transitionId: string, options: JsonOption & { project: string }) => {
      await runTransitionCommand('Inspect Transition', options, (client) =>
        client.inspectTransition(options.project, transitionId)
      );
    });

  transition
    .command('verify <transition-id>')
    .description('Run replay verification and configured server checks')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .option('--json', 'Output as JSON')
    .action(
      async (
        transitionId: string,
        options: JsonOption & { project: string; requestId: string }
      ) => {
        await runTransitionCommand('Verify Transition', options, (client) =>
          client.verifyTransition(options.project, transitionId, { request_id: options.requestId })
        );
      }
    );

  transition
    .command('decide <transition-id>')
    .description('Record a Decision from an immutable review precondition')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .requiredOption('--outcome <outcome>', 'accepted, rejected, or overridden')
    .requiredOption('--precondition-json <json>', 'Review precondition JSON from inspect/verify')
    .option('--rationale <text>', 'Required for overridden Decisions')
    .option('--json', 'Output as JSON')
    .action(
      async (
        transitionId: string,
        options: JsonOption & {
          project: string;
          requestId: string;
          outcome: string;
          preconditionJson: string;
          rationale?: string;
        }
      ) => {
        await runTransitionCommand('Decide Transition', options, (client) => {
          if (!['accepted', 'rejected', 'overridden'].includes(options.outcome)) {
            throw new Error('outcome must be accepted, rejected, or overridden');
          }
          return client.decideTransition(options.project, transitionId, {
            request_id: options.requestId,
            outcome: options.outcome as 'accepted' | 'rejected' | 'overridden',
            precondition: parsePrecondition(options.preconditionJson),
            ...(options.rationale === undefined ? {} : { rationale: options.rationale }),
          });
        });
      }
    );

  transition
    .command('commit <transition-id>')
    .description('Create CommitV2 and advance the ref by exact expected-head CAS')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .requiredOption('--decision-digest <digest>', 'Accepted or authorized Decision digest')
    .option('--expected-head <digest>', 'Expected current ref head')
    .option('--empty-head', 'Expect the target ref to be empty')
    .option('--json', 'Output as JSON')
    .action(
      async (
        transitionId: string,
        options: JsonOption & {
          project: string;
          requestId: string;
          decisionDigest: string;
          expectedHead?: string;
          emptyHead?: boolean;
        }
      ) => {
        await runTransitionCommand('Commit Transition', options, (client) =>
          client.commitTransition(options.project, transitionId, {
            request_id: options.requestId,
            decision_digest: options.decisionDigest,
            expected_head: resolveExpectedHead(options),
          })
        );
      }
    );
}
