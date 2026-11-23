import type { ResourceKind } from './resources/index.js';
import type { ToolDef } from './tools/types.js';

type OperationGate = {
  parameter: 'action' | 'mode' | 'outcome' | 'target';
  values: readonly string[];
  defaultValue?: string;
};

type ExposureRule = {
  tools?: readonly string[];
  operations?: Readonly<Record<string, OperationGate>>;
  resources?: readonly ResourceKind[];
};

const GROUPS = {
  context: { tools: ['t3x_context'] },
  repositories: {
    tools: ['t3x_resolve_repository'],
    operations: { t3x_query: { parameter: 'target', values: ['project', 'projects', 'branches'] } },
    resources: ['project'],
  },
  'repositories:write': {
    operations: { t3x_admin: { parameter: 'action', values: ['create_project', 'create_branch'] } },
  },
  'repositories:create': {
    operations: { t3x_admin: { parameter: 'action', values: ['create_project'] } },
  },
  'branches:create': {
    operations: { t3x_admin: { parameter: 'action', values: ['create_branch'] } },
  },
  state: {
    tools: ['t3x_committed_state', 't3x_diff'],
    operations: { t3x_query: { parameter: 'target', values: ['commit', 'commits'] } },
    resources: ['commit'],
  },
  workspace: {
    operations: {
      t3x_query: { parameter: 'target', values: ['workspace', 'workspaces', 'workspace_activity'] },
    },
    resources: ['workspace'],
  },
  'workspace:write': {
    tools: ['t3x_open_workspace'],
    operations: {
      t3x_edit: {
        parameter: 'mode',
        values: [
          'draft',
          'initialize_draft',
          'sync_preview',
          'sync_adopt',
          'sync_cancel',
          'sync_discard',
          'sync_resolve',
        ],
      },
    },
  },
  'workspace:candidates:write': { tools: ['t3x_publish_candidate'] },
  schemas: {
    tools: ['t3x_schema_registry', 't3x_schema_preparation'],
    operations: { t3x_schema_candidate: { parameter: 'action', values: ['read', 'preview'] } },
  },
  'schemas:candidates:write': {
    operations: { t3x_schema_candidate: { parameter: 'action', values: ['save'] } },
  },
  'schemas:write': {
    operations: { t3x_edit: { parameter: 'mode', values: ['schema'] } },
  },
  sources: {
    tools: ['t3x_source_context', 't3x_source_artifact'],
    operations: {
      t3x_query: {
        parameter: 'target',
        values: [
          'source_thread',
          'source_threads',
          'source_evidence',
          'conversation',
          'conversations',
          'pin',
          'pins',
        ],
      },
    },
    resources: ['source_thread'],
  },
  'sources:write': {
    tools: ['t3x_extract'],
    operations: { t3x_admin: { parameter: 'action', values: ['create_pin', 'delete_pin'] } },
  },
  'sources:ingest': { tools: ['t3x_ingest_source'] },
  'sources:generate': { tools: ['t3x_generate_proposal'] },
  runs: { operations: { t3x_commit_validation: { parameter: 'action', values: ['read'] } } },
  'runs:trigger': {
    operations: { t3x_commit_validation: { parameter: 'action', values: ['run'] } },
  },
  'runs:workspace': {
    operations: { t3x_workspace_validation: { parameter: 'action', values: ['read'] } },
  },
  'runs:workspace:trigger': {
    operations: { t3x_workspace_validation: { parameter: 'action', values: ['run'] } },
  },
  'runs:repository:trigger': { tools: ['t3x_trigger_repository_run'] },
  delivery: { operations: { t3x_workspace_delivery: { parameter: 'action', values: ['list'] } } },
  'delivery:deploy': {
    operations: { t3x_workspace_delivery: { parameter: 'action', values: ['deploy'] } },
  },
  'delivery:rollback': {
    operations: { t3x_workspace_delivery: { parameter: 'action', values: ['rollback'] } },
  },
  'state:restore': { tools: ['t3x_restore_content'] },
  'delivery:prepare': {
    operations: { t3x_workspace_delivery: { parameter: 'action', values: ['prepare'] } },
  },
  'runs:repository': { tools: ['t3x_repository_runs'] },
  transitions: {
    tools: ['inspect_transition', 't3x_commit_result'],
    operations: { t3x_draft_review: { parameter: 'action', values: ['read'] } },
    resources: ['transition'],
  },
  'transitions:prepare': {
    tools: ['propose_transition'],
    operations: {
      t3x_draft_review: { parameter: 'action', values: ['prepare'] },
      t3x_edit: { parameter: 'mode', values: ['proposal'], defaultValue: 'proposal' },
    },
  },
  'transitions:verify': { tools: ['verify_transition'] },
  'transitions:attach': { tools: ['attach_statement'] },
  'decision:accept': {
    operations: { decide_transition: { parameter: 'outcome', values: ['accepted'] } },
  },
  'decision:reject': {
    operations: { decide_transition: { parameter: 'outcome', values: ['rejected'] } },
  },
  'decision:override': {
    operations: { decide_transition: { parameter: 'outcome', values: ['overridden'] } },
  },
  commit: { tools: ['commit_transition', 't3x_commit'] },
} as const satisfies Record<string, ExposureRule>;

export type McpCapability = keyof typeof GROUPS | 'read-only';

export function parseMcpCapabilities(value: string): McpCapability[] {
  const entries = value.split(',').map((entry) => entry.trim());
  return entries.map((entry) => {
    if (entry === 'read-only' || Object.hasOwn(GROUPS, entry)) return entry as McpCapability;
    throw new Error(`Unsupported T3X_MCP_CAPABILITIES value: ${entry || '(empty)'}.`);
  });
}

export function getBusinessExposure(capabilities: readonly McpCapability[]) {
  const enabled = new Set(
    capabilities.flatMap((capability) =>
      capability === 'read-only' ? (['context', 'repositories', 'state'] as const) : [capability]
    )
  );
  const rules: ExposureRule[] = [...enabled].map((name) => GROUPS[name]);
  const tools = new Set(rules.flatMap((rule) => rule.tools ?? []));
  const resources = new Set(rules.flatMap((rule) => rule.resources ?? []));
  const operations = new Map<string, OperationGate>();
  for (const rule of rules) {
    for (const [name, gate] of Object.entries(rule.operations ?? {})) {
      const current = operations.get(name);
      operations.set(name, {
        parameter: gate.parameter,
        values: [...new Set([...(current?.values ?? []), ...gate.values])],
        defaultValue: current?.defaultValue ?? gate.defaultValue,
      });
    }
  }

  return {
    resources,
    definition(def: ToolDef): ToolDef | undefined {
      if (tools.has(def.name)) return def;
      const gate = operations.get(def.name);
      if (!gate) return undefined;
      return {
        ...def,
        description: `Enabled ${gate.parameter} values: ${gate.values.join(', ')}.`,
        inputSchema: {
          ...def.inputSchema,
          properties: {
            ...def.inputSchema.properties,
            [gate.parameter]: { type: 'string', enum: [...gate.values] },
          },
          required:
            gate.defaultValue === undefined
              ? [...new Set([...(def.inputSchema.required ?? []), gate.parameter])]
              : def.inputSchema.required,
        },
        ...(def.name === 't3x_draft_review' && gate.values.length === 1 && gate.values[0] === 'read'
          ? { annotations: { readOnlyHint: true } }
          : {}),
      };
    },
    allows(name: string, args: Record<string, unknown>): boolean {
      if (tools.has(name)) return true;
      const gate = operations.get(name);
      if (!gate) return false;
      const value = args[gate.parameter] === undefined ? gate.defaultValue : args[gate.parameter];
      return typeof value === 'string' && gate.values.includes(value);
    },
  };
}

export function isSafeBusinessIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value !== '' &&
    value !== '.' &&
    value !== '..' &&
    !/[\s\p{Cc}/\\?#%]/u.test(value)
  );
}

export function isSafeWorkspaceIdentifier(value: unknown): value is string {
  if (isSafeBusinessIdentifier(value)) return true;
  const prefix = 'workspace_branch:';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return false;
  const branch = value.slice(prefix.length);
  try {
    return branch.length > 0 && encodeURIComponent(decodeURIComponent(branch)) === branch;
  } catch {
    return false;
  }
}
