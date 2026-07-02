import { createHash } from 'node:crypto';
import type { SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  createYSchemaValidationRun,
  getCommit,
  getLatestCommit,
  type YSchemaValidationRunOutput,
} from '@t3x-dev/storage';
import {
  type ProvenanceIndex,
  t3xPrdP0Fixtures,
  validateTree,
  type YSchemaRelation,
} from '@t3x-dev/yschema';

export const YSCHEMA_VALIDATOR_VERSION = 'yschema-p0@0.1';

interface RunValidationInput {
  projectId: string;
  commitHash?: string;
  schemaName?: string;
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
  const schemaName = input.schemaName ?? 't3x/prd';
  if (schemaName !== 't3x/prd') {
    throw new YSchemaValidationError(
      'SCHEMA_NOT_SUPPORTED',
      `YSchema ${schemaName} is not supported by the local validator yet`
    );
  }

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

  const schema = t3xPrdP0Fixtures.normalizedYSchema;
  const candidate = semanticContentToCandidate(commit.content);
  const relations = semanticContentToYSchemaRelations(commit.content);
  const provenanceByPath = acceptedEvidence(candidateEvidencePaths(candidate));
  const validation = validateTree({
    schema,
    tree: candidate,
    relations,
    provenanceByPath,
  });
  const status = validation.valid && validation.ready ? 'passed' : 'failed';
  const result = {
    schema,
    candidate,
    relations,
    provenance_by_path: provenanceByPath,
    validation,
  };

  const run = await createYSchemaValidationRun(db, {
    project_id: input.projectId,
    commit_hash: commit.hash,
    schema_name: schema.name,
    schema_version: schema.version,
    schema_hash: stableHash(schema),
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

function acceptedEvidence(paths: string[]): ProvenanceIndex {
  return Object.fromEntries(
    paths.map((path) => [
      path,
      [
        {
          origin: 'user_evidence',
          sourceId: `commit:${path}`,
        },
      ],
    ])
  );
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
