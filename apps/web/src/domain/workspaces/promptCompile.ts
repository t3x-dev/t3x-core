import type { PromptCompilePreviewRequest } from '@/types/promptCompile';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaBinding,
  WorkspaceSchemaCandidateField,
} from '@/types/workspaces';

export interface PromptWorkspaceCompileDescriptor {
  available: boolean;
  candidateStale: boolean;
  fingerprint: string;
  request: PromptCompilePreviewRequest;
}

export function isPromptWorkspace(candidate: WorkspaceCandidate | null | undefined): boolean {
  const binding = candidate?.schemaBindings[0];
  if (!binding) return false;
  return canonicalBindingName(binding) === 't3x/prompt';
}

export function describePromptWorkspaceCompile(
  workspace: WorkspaceCandidate
): PromptWorkspaceCompileDescriptor {
  const binding = workspace.schemaBindings[0];
  const schemaName = binding ? canonicalBindingName(binding) : '';
  const promptInputs = workspace.schemaCandidate.promptCompileInputs;
  const candidate = candidateFieldsToRecord(workspace.schemaCandidate.fields);
  const provenanceByPath = candidateProvenance(workspace.schemaCandidate.fields, workspace.id);
  const request: PromptCompilePreviewRequest = {
    schema_name: schemaName || 't3x/prompt',
    schema_version: binding?.version ?? 'v1',
    candidate,
    relations: promptInputs?.relations ?? [],
    provenance_by_path: provenanceByPath,
    ...(promptInputs?.variableValues ? { variable_values: promptInputs.variableValues } : {}),
    ...(promptInputs?.contextContents ? { context_contents: promptInputs.contextContents } : {}),
    ...(promptInputs?.resourceContents ? { resource_contents: promptInputs.resourceContents } : {}),
    input_source: {
      kind: workspace.schemaCandidate.proposalMode === 'fixture' ? 'fixture' : 'workspace',
      label: compileInputLabel(workspace),
      sourceCount: workspace.sourceBundle.length,
    },
  };

  return {
    available: schemaName === 't3x/prompt' && binding?.version === 'v1',
    candidateStale: isWorkspaceCandidateStale(workspace),
    fingerprint: JSON.stringify({
      binding,
      candidate,
      relations: request.relations,
      provenanceByPath,
      variableValues: request.variable_values,
      contextContents: request.context_contents,
      resourceContents: request.resource_contents,
      sources: workspace.sourceBundle.map((source) => ({
        contentHash: source.contentHash,
        id: source.id,
        previewText: source.previewText,
        previewTurns: source.previewTurns,
      })),
    }),
    request,
  };
}

function canonicalBindingName(binding: WorkspaceSchemaBinding): string {
  if (binding.canonicalName) return binding.canonicalName;
  if (/^prompt schema$/i.test(binding.schemaName.trim())) return 't3x/prompt';
  return binding.schemaName;
}

function compileInputLabel(workspace: WorkspaceCandidate): string {
  if (workspace.schemaCandidate.proposalMode === 'fixture') return 'Workspace fixture proposal';
  if (workspace.sourceBundle.length === 0) return 'Workspace candidate without source input';
  if (workspace.sourceBundle.length === 1) {
    return workspace.sourceBundle[0]?.title || '1 Workspace source';
  }
  return `${String(workspace.sourceBundle.length)} Workspace sources`;
}

function isWorkspaceCandidateStale(workspace: WorkspaceCandidate): boolean {
  if (workspace.schemaCandidate.fields.length > 0) return false;
  const text = [
    workspace.schemaCandidate.summary,
    workspace.schemaReview.summary,
    ...workspace.schemaReview.gaps,
  ]
    .join(' ')
    .toLowerCase();
  return /\bstale\b|regenerate|binding changed|different schema/.test(text);
}

function candidateFieldsToRecord(fields: WorkspaceSchemaCandidateField[]): Record<string, unknown> {
  const candidate: Record<string, unknown> = {};
  for (const field of fields) addCandidateField(candidate, field);
  return candidate;
}

function addCandidateField(
  candidate: Record<string, unknown>,
  field: WorkspaceSchemaCandidateField
) {
  if (field.children?.length) {
    for (const child of field.children) addCandidateField(candidate, child);
    return;
  }
  if (field.value === undefined || (field.value === '' && field.status === 'missing')) return;
  setRecordPath(candidate, field.path.split('.').filter(Boolean), coerceCandidateValue(field));
}

function setRecordPath(target: Record<string, unknown>, path: string[], value: unknown) {
  const leaf = path.at(-1);
  if (!leaf) return;
  let parent = target;
  for (const segment of path.slice(0, -1)) {
    const current = parent[segment];
    if (!isRecord(current)) parent[segment] = {};
    parent = parent[segment] as Record<string, unknown>;
  }
  parent[leaf] = value;
}

function coerceCandidateValue(field: WorkspaceSchemaCandidateField): unknown {
  const value = field.value ?? '';
  if (field.type === 'boolean') {
    if (value.trim().toLowerCase() === 'true') return true;
    if (value.trim().toLowerCase() === 'false') return false;
    return value;
  }
  if (field.type === 'number' || field.type === 'integer') {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (field.type === 'array' || field.type.endsWith('[]')) {
    const parsed = parseStructuredValue(value);
    return Array.isArray(parsed) ? parsed : value ? [value] : [];
  }
  if (field.type === 'object') {
    const parsed = parseStructuredValue(value);
    return isRecord(parsed) ? parsed : value;
  }
  return value;
}

function parseStructuredValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function candidateProvenance(
  fields: WorkspaceSchemaCandidateField[],
  workspaceId: string
): Record<string, unknown[]> {
  return Object.fromEntries(
    flattenCandidateFields(fields).flatMap((field) => {
      if (field.children?.length || field.value === undefined) return [];
      return [
        [
          field.path.replaceAll('.', '/'),
          [
            {
              origin: 'workspace_candidate',
              sourceId: `${workspaceId}:${field.id}`,
              ...(field.evidence ? { evidence: field.evidence } : {}),
            },
          ],
        ],
      ];
    })
  );
}

function flattenCandidateFields(
  fields: WorkspaceSchemaCandidateField[]
): WorkspaceSchemaCandidateField[] {
  return fields.flatMap((field) => [field, ...flattenCandidateFields(field.children ?? [])]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
