import type {
  AssistantSchemaSettingsInput,
  TransitionProtocolValue,
  WorkspaceReconciliationResolution,
} from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { error, getClientWithAuth, success } from '../utils.js';

type GuardOptions = {
  project: string;
  requestId: string;
  expectedWorkspaceRevision: string;
  expectedRevision: string;
  expectedHead?: string;
  emptyHead?: boolean;
  json?: boolean;
};

type ReconciliationGuardOptions = Omit<GuardOptions, 'expectedRevision'>;

function integer(value: string, label: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum)
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  return parsed;
}

function json<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (cause) {
    throw new Error(
      `${label} must be valid JSON: ${cause instanceof Error ? cause.message : cause}`
    );
  }
}

function expectedHead(options: Pick<GuardOptions, 'expectedHead' | 'emptyHead'>): string | null {
  if (options.emptyHead === true && options.expectedHead !== undefined)
    throw new Error('Use either --expected-head or --empty-head, not both');
  if (options.emptyHead === true) return null;
  if (options.expectedHead && /^sha256:[a-f0-9]{64}$/.test(options.expectedHead))
    return options.expectedHead;
  throw new Error('Provide a valid --expected-head digest or --empty-head');
}

function guard(options: GuardOptions) {
  return {
    request_id: options.requestId,
    expected_workspace_revision: integer(
      options.expectedWorkspaceRevision,
      '--expected-workspace-revision',
      1
    ),
    expected_revision: integer(options.expectedRevision, '--expected-revision', 0),
    expected_ref_head: expectedHead(options),
  };
}

async function run(options: { json?: boolean }, label: string, command: () => Promise<unknown>) {
  try {
    const result = await command();
    if (!options.json) success(label);
    console.log(JSON.stringify(result, null, 2));
  } catch (cause) {
    error(`${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = 1;
  }
}

function addGuardOptions(command: Command): Command {
  return command
    .requiredOption('--request-id <id>', 'Durable idempotency key')
    .requiredOption('--expected-workspace-revision <revision>', 'Persisted Workspace revision')
    .requiredOption('--expected-revision <revision>', 'Draft composition revision')
    .option('--expected-head <digest>', 'Expected target ref Commit digest')
    .option('--empty-head', 'Expect an empty target ref');
}

function addReconciliationGuardOptions(command: Command): Command {
  return command
    .requiredOption('--request-id <id>', 'Durable idempotency key')
    .requiredOption('--expected-workspace-revision <revision>', 'Persisted Workspace revision')
    .option('--expected-head <digest>', 'Current target ref Commit digest')
    .option('--empty-head', 'Expect an empty target ref');
}

function reconciliationGuard(options: ReconciliationGuardOptions) {
  return {
    expected_workspace_revision: integer(
      options.expectedWorkspaceRevision,
      '--expected-workspace-revision',
      1
    ),
    expected_ref_head: expectedHead(options),
  };
}

export function registerWorkspaceCommands(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Inspect and edit one explicit Repository Workspace through the guarded API');

  workspace
    .command('inspect <workspace-id>')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('--json', 'Output JSON')
    .action((workspaceId: string, options: { project: string; json?: boolean }) =>
      run(options, 'Read Workspace Draft', () =>
        getClientWithAuth().workspaces.authoring.read(options.project, workspaceId)
      )
    );

  addGuardOptions(
    workspace
      .command('edit <workspace-id>')
      .description('Append one immutable YOps action to the current Draft')
      .requiredOption('-p, --project <id>', 'Project ID')
      .requiredOption('--operations-json <json>', 'Canonical YOps operation array')
      .option('--why <text>', 'Concise rationale')
      .option('--json', 'Output JSON')
  ).action(
    (workspaceId: string, options: GuardOptions & { operationsJson: string; why?: string }) =>
      run(options, 'Edit Workspace Draft', () => {
        const operations = json<TransitionProtocolValue[]>(
          options.operationsJson,
          '--operations-json'
        );
        if (!Array.isArray(operations)) throw new Error('--operations-json must be an array');
        return getClientWithAuth().workspaces.authoring.publish(options.project, workspaceId, {
          ...guard(options),
          operations,
          ...(options.why ? { reason: options.why } : {}),
        });
      })
  );

  addGuardOptions(
    workspace
      .command('schema <workspace-id>')
      .description('Apply one exact Schema action using the Workspace chat confirmation service')
      .requiredOption('-p, --project <id>', 'Project ID')
      .requiredOption('--settings-json <json>', 'One exact Schema action')
      .option('--discard-studio-candidate', 'Explicitly replace a conflicting Studio candidate')
      .option('--json', 'Output JSON')
  ).action(
    (
      workspaceId: string,
      options: GuardOptions & { settingsJson: string; discardStudioCandidate?: boolean }
    ) =>
      run(options, 'Edit Workspace Schema', () =>
        getClientWithAuth().workspaces.authoring.publishSchema(options.project, workspaceId, {
          ...guard(options),
          settings: json<AssistantSchemaSettingsInput>(options.settingsJson, '--settings-json'),
          ...(options.discardStudioCandidate ? { discard_studio_candidate: true } : {}),
        })
      )
  );

  const sync = workspace
    .command('sync')
    .description('Preview and explicitly reconcile a Workspace after its branch advances');

  addReconciliationGuardOptions(
    sync
      .command('preview <workspace-id>')
      .requiredOption('-p, --project <id>', 'Project ID')
      .option('--json', 'Output JSON')
  ).action((workspaceId: string, options: ReconciliationGuardOptions) =>
    run(options, 'Preview Workspace synchronization', () =>
      getClientWithAuth().workspaces.authoring.prepareReconciliation(
        options.project,
        workspaceId,
        reconciliationGuard(options)
      )
    )
  );

  for (const action of ['adopt', 'cancel', 'discard'] as const) {
    addReconciliationGuardOptions(
      sync
        .command(`${action} <workspace-id>`)
        .requiredOption('-p, --project <id>', 'Project ID')
        .requiredOption('--preparation-digest <digest>', 'Exact preview preparation digest')
        .option('--json', 'Output JSON')
    ).action(
      (workspaceId: string, options: ReconciliationGuardOptions & { preparationDigest: string }) =>
        run(options, `${action} Workspace synchronization`, () =>
          getClientWithAuth().workspaces.authoring.decideReconciliation(
            options.project,
            workspaceId,
            {
              request_id: options.requestId,
              ...reconciliationGuard(options),
              preparation_digest: options.preparationDigest,
              action,
            }
          )
        )
    );
  }

  addReconciliationGuardOptions(
    sync
      .command('resolve <workspace-id>')
      .requiredOption('-p, --project <id>', 'Project ID')
      .requiredOption('--preparation-digest <digest>', 'Exact preview preparation digest')
      .requiredOption(
        '--resolutions-json <json>',
        'One base, ours, theirs or custom choice for every conflict'
      )
      .option('--json', 'Output JSON')
  ).action(
    (
      workspaceId: string,
      options: ReconciliationGuardOptions & {
        preparationDigest: string;
        resolutionsJson: string;
      }
    ) =>
      run(options, 'Resolve Workspace synchronization conflicts', () => {
        const resolutions = json<WorkspaceReconciliationResolution[]>(
          options.resolutionsJson,
          '--resolutions-json'
        );
        if (!Array.isArray(resolutions)) throw new Error('--resolutions-json must be an array');
        return getClientWithAuth().workspaces.authoring.decideReconciliation(
          options.project,
          workspaceId,
          {
            request_id: options.requestId,
            ...reconciliationGuard(options),
            preparation_digest: options.preparationDigest,
            action: 'resolve',
            resolutions,
          }
        );
      })
  );
}
