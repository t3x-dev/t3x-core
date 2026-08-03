import { createHash } from 'node:crypto';
import {
  type SemanticContent,
  type SlotValue,
  type TreeNode,
  validatePromptPolicy,
  validateSkillPolicy,
} from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  createYSchemaValidationRun,
  findYSchemaCompositionSnapshot,
  getCommit,
  getLatestCommit,
  getYOpsForCommit,
  type YSchemaValidationRunOutput,
} from '@t3x-dev/storage';
import {
  normalizeYSchemaObject,
  type ProvenanceIndex,
  sha256CompositionValue,
  validateTree,
  type YSchema,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import { resolveBuiltInYSchema } from './yschema-registry';

export const YSCHEMA_VALIDATOR_VERSION = 'yschema-p0@0.1';

interface RunValidationInput {
  projectId: string;
  commitHash?: string;
  schemaName?: string;
  schemaVersion?: string;
}

export interface YSchemaValidationRunView extends Omit<YSchemaValidationRunOutput, 'result_json'> {
  result: Record<string, unknown>;
}

export class YSchemaValidationError extends Error {
  constructor(
    public readonly code: 'COMMIT_NOT_FOUND' | 'COMMIT_PROJECT_MISMATCH' | 'SCHEMA_NOT_SUPPORTED',
    message: string
  ) {
    super(message);
    this.name = 'YSchemaValidationError';
  }
}

export async function runYSchemaValidationForCommit(
  db: AnyDB,
  input: RunValidationInput
): Promise<YSchemaValidationRunView> {
  const commit = input.commitHash
    ? await getCommit(db, input.commitHash)
    : await getLatestCommit(db, input.projectId, 'main');
  if (!commit) {
    throw new YSchemaValidationError('COMMIT_NOT_FOUND', 'Commit not found');
  }
  if (commit.project_id !== input.projectId) {
    throw new YSchemaValidationError(
      'COMMIT_PROJECT_MISMATCH',
      `Commit ${commit.hash} does not belong to project ${input.projectId}`
    );
  }

  const commitSchemaRef = commit.provenance?.schema_ref;
  const schemaName = input.schemaName ?? commitSchemaRef?.name ?? 't3x/prd';
  const schemaVersion =
    input.schemaVersion ?? (input.schemaName === undefined ? commitSchemaRef?.version : undefined);
  const schema = await resolveValidationSchema(
    db,
    input.projectId,
    schemaName,
    schemaVersion,
    commitSchemaRef?.name === schemaName ? commitSchemaRef.hash : undefined
  );
  if (!schema) {
    throw new YSchemaValidationError(
      'SCHEMA_NOT_SUPPORTED',
      `YSchema ${schemaName}${schemaVersion ? `@${schemaVersion}` : ''} is not available in the local runtime registry`
    );
  }
  const candidate = semanticContentToCandidate(commit.content);
  const relations = semanticContentToYSchemaRelations(commit.content);
  const provenanceByPath = await buildCommitProvenance(db, commit, candidate);
  const structuralValidation = validateTree({
    schema,
    tree: candidate,
    relations,
    provenanceByPath,
  });
  const policyValidation =
    schema.name === 't3x/skill'
      ? validateSkillPolicy(candidate, relations)
      : schema.name === 't3x/prompt'
        ? validatePromptPolicy(candidate, relations)
        : { valid: true, ready: true, errors: [], gaps: [] };
  const validation = {
    valid: structuralValidation.valid && policyValidation.valid,
    ready: structuralValidation.ready && policyValidation.ready,
    errors: [...structuralValidation.errors, ...policyValidation.errors],
    gaps: [...structuralValidation.gaps, ...policyValidation.gaps],
    fixes: structuralValidation.fixes,
  };
  const status = validation.valid && validation.ready ? 'passed' : 'failed';
  const result = {
    schema,
    candidate,
    relations,
    provenance_by_path: provenanceByPath,
    structural_validation: structuralValidation,
    policy_validation: policyValidation,
    validation,
  };

  const run = await createYSchemaValidationRun(db, {
    project_id: input.projectId,
    commit_hash: commit.hash,
    schema_name: schemaName,
    schema_version: schemaVersion ?? schema.version,
    schema_hash: commitSchemaRef?.hash ?? stableHash(schema),
    validator_version: YSCHEMA_VALIDATOR_VERSION,
    status,
    valid: validation.valid,
    ready: validation.ready,
    error_count: validation.errors.length,
    gap_count: validation.gaps.length,
    fix_count: validation.fixes.length,
    result_json: result,
  });

  return toValidationRunView(run);
}

export async function resolveValidationSchema(
  db: AnyDB,
  projectId: string,
  schemaName: string,
  schemaVersion?: string,
  schemaHash?: string
): Promise<YSchema | null> {
  const builtIn = resolveBuiltInYSchema(schemaName, schemaVersion);
  if (builtIn) return builtIn;

  const revisionMatch = /^r([1-9]\d*)$/.exec(schemaVersion ?? '');
  if (!revisionMatch || !schemaHash) return null;
  const snapshot = await findYSchemaCompositionSnapshot(db, {
    project_id: projectId,
    composition_id: schemaName,
    composition_revision: Number(revisionMatch[1]),
    compiled_schema_hash: schemaHash,
  });
  if (!snapshot) return null;
  const schema = normalizeYSchemaObject(snapshot.schemaJson);
  return (await sha256CompositionValue(schema)) === schemaHash ? schema : null;
}

export function toValidationRunView(run: YSchemaValidationRunOutput): YSchemaValidationRunView {
  const { result_json, ...rest } = run;
  return { ...rest, result: result_json };
}

function semanticContentToCandidate(content: SemanticContent): Record<string, unknown> {
  return Object.fromEntries(content.trees.map((tree) => [tree.key, treeNodeToValue(tree)]));
}

function treeNodeToValue(tree: TreeNode): Record<string, SlotValue | unknown> {
  const childValues = Object.fromEntries(
    tree.children.map((child) => [child.key, treeNodeToValue(child)])
  );
  return { ...tree.slots, ...childValues };
}

function semanticContentToYSchemaRelations(content: SemanticContent): YSchemaRelation[] {
  return content.relations.map((relation) => ({
    from: relation.from,
    to: relation.to,
    type: relation.type,
  }));
}

async function buildCommitProvenance(
  db: AnyDB,
  commit: Awaited<ReturnType<typeof getCommit>> & {},
  candidate: Record<string, unknown>
): Promise<ProvenanceIndex> {
  const leafPaths = candidateEvidencePaths(candidate);
  const provenance: ProvenanceIndex = {};
  const logs = await getYOpsForCommit(db, commit.yops_log_ids ?? []);

  for (const log of logs) {
    if (!Array.isArray(log.yops)) continue;
    for (const operation of log.yops) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) continue;
      const record = operation as Record<string, unknown>;
      const operationPath = yopsOperationPath(record);
      if (!operationPath) continue;
      const matchingPaths = leafPaths.filter(
        (path) =>
          operationPath === path ||
          operationPath.endsWith(`/${path}`) ||
          path.startsWith(`${operationPath}/`) ||
          operationPath.endsWith(`/${path.split('/').slice(0, -1).join('/')}`)
      );
      const ref = provenanceRefFromYOp(record.source);
      if (!ref) continue;
      for (const path of matchingPaths) {
        provenance[path] = [...(provenance[path] ?? []), ref];
      }
    }
  }

  const sourceRefs = (commit.sources ?? []).map((source) => ({
    origin: 'user_evidence' as const,
    sourceId: `${source.type}:${source.id}`,
  }));
  if (sourceRefs.length > 0) {
    for (const path of leafPaths) {
      if (!provenance[path]?.length) provenance[path] = sourceRefs;
    }
  }

  return provenance;
}

function yopsOperationPath(operation: Record<string, unknown>): string | null {
  for (const value of Object.values(operation)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const path = (value as Record<string, unknown>).path;
    if (typeof path === 'string' && path.trim()) return path.trim().replace(/\./g, '/');
  }
  return null;
}

function provenanceRefFromYOp(source: unknown) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  if (record.type === 'llm') {
    const turnRef = record.turn_ref;
    if (!turnRef || typeof turnRef !== 'object' || Array.isArray(turnRef)) return null;
    const turn = turnRef as Record<string, unknown>;
    return {
      origin: 'user_evidence' as const,
      ...(typeof turn.turn_hash === 'string' ? { turnHash: turn.turn_hash } : {}),
      ...(typeof turn.quote === 'string' ? { quote: turn.quote } : {}),
    };
  }
  if (record.type === 'human') {
    return { origin: 'ai_paraphrase_approved' as const, approved: true };
  }
  return null;
}

function candidateEvidencePaths(candidate: unknown, prefix = ''): string[] {
  if (candidate === null || candidate === undefined) return [];
  if (Array.isArray(candidate) || typeof candidate !== 'object') return prefix ? [prefix] : [];

  const paths: string[] = [];
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}/${key}` : key;
    paths.push(...candidateEvidencePaths(value, nextPrefix));
  }
  return paths;
}

function stableHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
