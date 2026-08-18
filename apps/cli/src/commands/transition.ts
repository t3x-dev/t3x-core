/**
 * Transition control-plane commands.
 */

import type {
  ProposeTransitionInput,
  T3xClient,
  TransitionProtocolValue,
  TransitionReplaceScalarOperation,
  TransitionReviewPrecondition,
  TransitionSourceArtifactSelector,
  TransitionSourceMaterialSelector,
} from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { createSpinner, error, getClientWithAuth, success } from '../utils.js';

type JsonOption = { json?: boolean };
type TransitionProposalKind = ProposeTransitionInput['kind'];

const TRANSITION_PROPOSAL_KINDS: TransitionProposalKind[] = [
  'structured_yops',
  'exact_source_import',
  'exact_source_edit',
  'exact_source_revert',
];

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

function parseReplaceOperations(value: string): TransitionReplaceScalarOperation[] {
  const parsed = parseJson(value, 'operations');
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('operations must be a non-empty JSON array');
  }
  for (const [index, operation] of parsed.entries()) {
    if (
      operation === null ||
      typeof operation !== 'object' ||
      Array.isArray(operation) ||
      (operation as { op?: unknown }).op !== 'replace_scalar' ||
      !Array.isArray((operation as { path?: unknown }).path) ||
      typeof (operation as { expect?: unknown }).expect !== 'string' ||
      typeof (operation as { value?: unknown }).value !== 'string'
    ) {
      throw new Error(
        `operations[${index}] must be a replace_scalar object with path, expect, and value`
      );
    }
  }
  return parsed as TransitionReplaceScalarOperation[];
}

function parseJsonObject<T>(value: string, label: string): T {
  const parsed = parseJson(value, label);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as T;
}

function parsePrecondition(value: string): TransitionReviewPrecondition {
  const parsed = parseJson(value, 'precondition');
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('precondition must be a JSON object');
  }
  return parsed as TransitionReviewPrecondition;
}

function parseSubjectRoles(value: string): Array<'effect' | 'result' | 'proposal'> {
  const roles = value
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  if (roles.length === 0) {
    throw new Error('subjects must include at least one of: effect, result, proposal');
  }
  for (const role of roles) {
    if (!['effect', 'result', 'proposal'].includes(role)) {
      throw new Error('subjects must contain only: effect, result, proposal');
    }
  }
  return roles as Array<'effect' | 'result' | 'proposal'>;
}

function parseRevision(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('if-revision must be a positive integer');
  }
  return parsed;
}

function parseProposalKind(value: string | undefined): TransitionProposalKind {
  const kind = value ?? 'structured_yops';
  if (!TRANSITION_PROPOSAL_KINDS.includes(kind as TransitionProposalKind)) {
    throw new Error(`kind must be one of: ${TRANSITION_PROPOSAL_KINDS.join(', ')}`);
  }
  return kind as TransitionProposalKind;
}

function rejectOptionsForKind(
  kind: TransitionProposalKind,
  options: Record<string, unknown>,
  optionNames: string[]
): void {
  const provided = optionNames.filter((name) => options[name] !== undefined);
  if (provided.length > 0) {
    throw new Error(`${kind} does not accept: ${provided.join(', ')}`);
  }
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
    .description('Prepare a closed-kind Transition Proposal')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .option(
      '--kind <kind>',
      'Proposal kind: structured_yops, exact_source_import, exact_source_edit, or exact_source_revert',
      'structured_yops'
    )
    .option('--operations-json <json>', 'Non-empty JSON array of YOps operations')
    .option('--extraction-candidate-id <id>', 'Server-owned extraction candidate')
    .option('--artifact-json <json>', 'Exact-source artifact selector JSON')
    .option('--root-json <json>', 'Exact-source root material selector JSON')
    .option('--commit-id <id>', 'CommitV2 identifier for exact-source revert')
    .option('--why <text>', 'Concise rationale')
    .option('--if-revision <revision>', 'Workspace revision precondition')
    .option('--json', 'Output as JSON')
    .action(
      async (
        workspaceId: string,
        options: JsonOption & {
          project: string;
          requestId: string;
          kind?: string;
          operationsJson?: string;
          extractionCandidateId?: string;
          artifactJson?: string;
          rootJson?: string;
          commitId?: string;
          why?: string;
          ifRevision?: string;
        }
      ) => {
        await runTransitionCommand('Propose Transition', options, (client) => {
          const kind = parseProposalKind(options.kind);
          const ifRevision = parseRevision(options.ifRevision);
          const common = {
            request_id: options.requestId,
            workspace_id: workspaceId,
            ...(options.why === undefined ? {} : { why: options.why }),
            ...(ifRevision === undefined ? {} : { if_revision: ifRevision }),
          };

          let input: ProposeTransitionInput;
          if (kind === 'structured_yops') {
            rejectOptionsForKind(kind, options, ['artifactJson', 'rootJson', 'commitId']);
            if (
              (options.operationsJson === undefined) ===
              (options.extractionCandidateId === undefined)
            ) {
              throw new Error(
                'structured_yops propose requires exactly one of --operations-json or --extraction-candidate-id'
              );
            }
            input =
              options.extractionCandidateId === undefined
                ? {
                    ...common,
                    kind,
                    operations: parseOperations(options.operationsJson!),
                  }
                : {
                    ...common,
                    kind,
                    extraction_candidate_id: options.extractionCandidateId,
                  };
          } else if (kind === 'exact_source_import') {
            rejectOptionsForKind(kind, options, [
              'operationsJson',
              'extractionCandidateId',
              'commitId',
            ]);
            if (options.artifactJson === undefined || options.rootJson === undefined) {
              throw new Error('exact_source_import requires --artifact-json and --root-json');
            }
            input = {
              ...common,
              kind,
              artifact: parseJsonObject<TransitionSourceArtifactSelector>(
                options.artifactJson,
                'artifact'
              ),
              root: parseJsonObject<TransitionSourceMaterialSelector>(options.rootJson, 'root'),
            };
          } else if (kind === 'exact_source_edit') {
            rejectOptionsForKind(kind, options, ['extractionCandidateId', 'rootJson', 'commitId']);
            if (options.artifactJson === undefined || options.operationsJson === undefined) {
              throw new Error('exact_source_edit requires --artifact-json and --operations-json');
            }
            input = {
              ...common,
              kind,
              artifact: parseJsonObject<TransitionSourceArtifactSelector>(
                options.artifactJson,
                'artifact'
              ),
              operations: parseReplaceOperations(options.operationsJson),
            };
          } else {
            rejectOptionsForKind(kind, options, [
              'operationsJson',
              'extractionCandidateId',
              'artifactJson',
              'rootJson',
            ]);
            if (options.commitId === undefined) {
              throw new Error('exact_source_revert requires --commit-id');
            }
            input = {
              ...common,
              kind,
              commit_id: options.commitId,
            };
          }

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
    .command('attach-statement <transition-id>')
    .description('Attach an external verification Statement through the API authority boundary')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('--request-id <id>', 'Idempotency key')
    .requiredOption('--predicate-type <type>', 'Configured external predicate type')
    .requiredOption('--predicate-json <json>', 'External predicate payload as JSON')
    .requiredOption('--subjects <roles>', 'Comma-separated graph roles: effect,result,proposal')
    .option('--json', 'Output as JSON')
    .action(
      async (
        transitionId: string,
        options: JsonOption & {
          project: string;
          requestId: string;
          predicateType: string;
          predicateJson: string;
          subjects: string;
        }
      ) => {
        await runTransitionCommand('Attach Transition Statement', options, (client) =>
          client.attachTransitionStatement(options.project, transitionId, {
            request_id: options.requestId,
            predicate_type: options.predicateType,
            predicate: parseJson(options.predicateJson, 'predicate') as TransitionProtocolValue,
            subjects: parseSubjectRoles(options.subjects),
          })
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
          const rationale = options.rationale === undefined ? undefined : options.rationale.trim();
          if (options.outcome === 'overridden' && !rationale) {
            throw new Error('overridden Decisions require --rationale');
          }
          if (options.outcome !== 'overridden' && options.rationale !== undefined) {
            throw new Error('Only overridden Decisions accept --rationale');
          }
          return client.decideTransition(options.project, transitionId, {
            request_id: options.requestId,
            outcome: options.outcome as 'accepted' | 'rejected' | 'overridden',
            precondition: parsePrecondition(options.preconditionJson),
            ...(rationale === undefined ? {} : { rationale }),
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
