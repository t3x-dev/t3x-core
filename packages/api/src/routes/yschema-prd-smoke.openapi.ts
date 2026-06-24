import { diffCommits, type SemanticContent, type TreeDiff, yamlToTree } from '@t3x-dev/core';
import {
  diffValidationResults,
  generatePromptContract,
  type ProvenanceIndex,
  renderYSchemaMarkdown,
  t3xPrdP0Fixtures,
  validateTree,
  type YSchemaRelation,
  type YSchemaValidationDelta,
} from '@t3x-dev/yschema';
import { type Context, Hono } from 'hono';
import yaml from 'js-yaml';

type CandidateTree = Parameters<typeof validateTree>[0]['tree'];
type SmokeValidationResult = ReturnType<typeof validateTree>;

interface PrdSmokeSnapshot {
  candidate: CandidateTree;
  relations: YSchemaRelation[];
  provenanceByPath: ProvenanceIndex;
  assumedProvenance: boolean;
}

type SmokeContentChange =
  | {
      kind: 'added' | 'removed';
      path: string;
      value: unknown;
    }
  | {
      kind: 'changed';
      path: string;
      before: unknown;
      after: unknown;
    }
  | { kind: 'added_node' | 'removed_node'; path: string }
  | {
      kind: 'added_relation' | 'removed_relation';
      from: string;
      to: string;
      relation_type: string;
    };

type SmokeValidationIssueSummary = {
  code: string;
  path: string;
  message: string;
};

const schema = t3xPrdP0Fixtures.normalizedYSchema;
const promptContract = generatePromptContract(schema);

function acceptedEvidence(paths: string[]): ProvenanceIndex {
  return Object.fromEntries(
    paths.map((path) => [
      path,
      [
        {
          origin: 'user_evidence',
          sourceId: `dev-smoke:${path}`,
        },
      ],
    ])
  );
}

function candidateEvidencePaths(candidate: CandidateTree): string[] {
  const paths: string[] = [];

  if (!isRecord(candidate)) return paths;

  if (isRecord(candidate.summary)) {
    for (const slot of ['problem', 'audience', 'outcome']) {
      if (candidate.summary[slot] !== undefined) paths.push(`summary/${slot}`);
    }
  }

  if (isRecord(candidate.requirements)) {
    for (const [key, requirement] of Object.entries(candidate.requirements)) {
      if (!isRecord(requirement)) continue;
      if (requirement.title !== undefined) paths.push(`requirements/${key}/title`);
      if (requirement.acceptance !== undefined) paths.push(`requirements/${key}/acceptance`);
    }
  }

  if (isRecord(candidate.milestones)) {
    for (const [key, milestone] of Object.entries(candidate.milestones)) {
      if (!isRecord(milestone)) continue;
      if (milestone.title !== undefined) paths.push(`milestones/${key}/title`);
    }
  }

  return paths;
}

function wantsYaml(c: Context): boolean {
  const format = c.req.query('format');
  const accept = c.req.header('accept') ?? '';
  return (
    format === 'yaml' ||
    accept.includes('text/yaml') ||
    accept.includes('application/yaml') ||
    accept.includes('application/x-yaml')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseBody(raw: string, contentType: string): Record<string, unknown> {
  const parsed = contentType.includes('application/json') ? JSON.parse(raw) : yaml.load(raw);
  if (!isRecord(parsed)) {
    throw new Error('Request body must be a YAML or JSON mapping.');
  }
  return parsed;
}

function normalizeRelations(value: unknown): YSchemaRelation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('relations must be an array.');

  return value.map((relation, index) => {
    if (!isRecord(relation)) throw new Error(`relations[${index}] must be a mapping.`);
    const { from, to, type } = relation;
    if (typeof from !== 'string' || typeof to !== 'string' || typeof type !== 'string') {
      throw new Error(`relations[${index}] must include string from, to, and type.`);
    }
    return { from, to, type };
  });
}

function normalizeSnapshot(value: unknown, label: string): PrdSmokeSnapshot {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a mapping.`);
  }

  const candidate = value.candidate ?? value.tree;
  if (candidate === undefined) {
    throw new Error(`${label} must include candidate or tree.`);
  }

  const provenanceByPathInput = value.provenanceByPath ?? value.provenance_by_path;
  const assumedProvenance = provenanceByPathInput === undefined;
  const candidateTree = candidate as CandidateTree;
  const provenanceByPath =
    (provenanceByPathInput as ProvenanceIndex | undefined) ??
    acceptedEvidence(candidateEvidencePaths(candidateTree));

  return {
    candidate: candidateTree,
    relations: normalizeRelations(value.relations),
    provenanceByPath,
    assumedProvenance,
  };
}

function normalizeRenderMarkdown(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') {
    throw new Error('renderMarkdown must be a boolean when provided.');
  }
  return value;
}

function candidateToSemanticContent(
  candidate: CandidateTree,
  relations: YSchemaRelation[],
  label: string
): SemanticContent {
  if (!isRecord(candidate)) {
    throw new Error(`${label}.candidate must be a mapping.`);
  }

  return {
    trees: Object.entries(candidate).map(([key, value]) => yamlToTree(key, value)),
    relations: relations.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function buildSmokeData(input?: {
  candidate?: CandidateTree;
  relations?: YSchemaRelation[];
  provenanceByPath?: ProvenanceIndex;
}) {
  const candidate = input?.candidate ?? t3xPrdP0Fixtures.candidateWithRelations.tree;
  const relations = input?.relations ?? [...t3xPrdP0Fixtures.candidateWithRelations.relations];
  const assumedProvenance = input?.provenanceByPath === undefined;
  const provenanceByPath =
    input?.provenanceByPath ?? acceptedEvidence(candidateEvidencePaths(candidate));
  const validation = validateTree({
    schema,
    tree: candidate,
    relations,
    provenanceByPath,
  });

  return {
    schema_name: schema.name,
    schema,
    prompt_contract: promptContract,
    candidate,
    relations,
    provenance_by_path: provenanceByPath,
    assumed_provenance: assumedProvenance,
    validation,
  };
}

function toSmokeValidationDelta(delta: YSchemaValidationDelta) {
  return {
    fixed_errors: delta.fixedErrors,
    new_errors: delta.newErrors,
    unchanged_errors: delta.unchangedErrors,
    fixed_gaps: delta.fixedGaps,
    new_gaps: delta.newGaps,
    unchanged_gaps: delta.unchangedGaps,
    ready_changed: delta.readyChanged,
    valid_changed: delta.validChanged,
  };
}

function toContentChanges(treeDiff: TreeDiff): SmokeContentChange[] {
  const changes: SmokeContentChange[] = [];

  for (const modified of treeDiff.modified) {
    for (const slotDiff of modified.slotDiffs) {
      const path = `${modified.path}/${slotDiff.key}`;
      if (slotDiff.type === 'added') {
        changes.push({
          kind: 'added',
          path,
          value: slotDiff.newValue,
        });
      } else if (slotDiff.type === 'removed') {
        changes.push({
          kind: 'removed',
          path,
          value: slotDiff.oldValue,
        });
      } else {
        changes.push({
          kind: 'changed',
          path,
          before: slotDiff.oldValue,
          after: slotDiff.newValue,
        });
      }
    }
  }

  for (const path of treeDiff.onlyInTarget) {
    changes.push({ kind: 'added_node', path });
  }

  for (const path of treeDiff.onlyInSource) {
    changes.push({ kind: 'removed_node', path });
  }

  for (const relation of treeDiff.relationsAdded) {
    changes.push({
      kind: 'added_relation',
      from: relation.from,
      to: relation.to,
      relation_type: relation.type,
    });
  }

  for (const relation of treeDiff.relationsRemoved) {
    changes.push({
      kind: 'removed_relation',
      from: relation.from,
      to: relation.to,
      relation_type: relation.type,
    });
  }

  return changes;
}

function toValidationIssueSummaries(
  issues: Array<{ code: string; path: string; message: string }>
): SmokeValidationIssueSummary[] {
  return issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    message: issue.message,
  }));
}

function buildValidationImpact(input: {
  beforeValidation: SmokeValidationResult;
  afterValidation: SmokeValidationResult;
  validationDelta: YSchemaValidationDelta;
}) {
  return {
    ready: {
      before: input.beforeValidation.ready,
      after: input.afterValidation.ready,
      changed: input.validationDelta.readyChanged,
    },
    valid: {
      before: input.beforeValidation.valid,
      after: input.afterValidation.valid,
      changed: input.validationDelta.validChanged,
    },
    fixed_errors: toValidationIssueSummaries(input.validationDelta.fixedErrors),
    new_errors: toValidationIssueSummaries(input.validationDelta.newErrors),
    fixed_gaps: toValidationIssueSummaries(input.validationDelta.fixedGaps),
    new_gaps: toValidationIssueSummaries(input.validationDelta.newGaps),
  };
}

function buildDiffSummary(input: {
  beforeValidation: SmokeValidationResult;
  afterValidation: SmokeValidationResult;
  treeDiff: TreeDiff;
  validationDelta: YSchemaValidationDelta;
}) {
  const contentChanges = toContentChanges(input.treeDiff);
  const validationImpact = buildValidationImpact(input);

  return {
    content_changes: contentChanges,
    validation_impact: validationImpact,
    counts: {
      content_changes: contentChanges.length,
      nodes_added: input.treeDiff.onlyInTarget.length,
      nodes_removed: input.treeDiff.onlyInSource.length,
      modified_nodes: input.treeDiff.modified.length,
      relations_added: input.treeDiff.relationsAdded.length,
      relations_removed: input.treeDiff.relationsRemoved.length,
      fixed_errors: input.validationDelta.fixedErrors.length,
      new_errors: input.validationDelta.newErrors.length,
      fixed_gaps: input.validationDelta.fixedGaps.length,
      new_gaps: input.validationDelta.newGaps.length,
    },
  };
}

function buildSmokeDiffData(input: {
  before: PrdSmokeSnapshot;
  after: PrdSmokeSnapshot;
  renderMarkdown: boolean;
}) {
  const beforeValidation = validateTree({
    schema,
    tree: input.before.candidate,
    relations: input.before.relations,
    provenanceByPath: input.before.provenanceByPath,
  });
  const afterValidation = validateTree({
    schema,
    tree: input.after.candidate,
    relations: input.after.relations,
    provenanceByPath: input.after.provenanceByPath,
  });
  const treeDiff = diffCommits(
    candidateToSemanticContent(input.before.candidate, input.before.relations, 'before'),
    candidateToSemanticContent(input.after.candidate, input.after.relations, 'after')
  );
  const validationDelta = diffValidationResults({
    before: beforeValidation,
    after: afterValidation,
  });
  const diffSummary = buildDiffSummary({
    beforeValidation,
    afterValidation,
    treeDiff,
    validationDelta,
  });

  return {
    schema_name: schema.name,
    diff_summary: diffSummary,
    assumed_provenance: {
      before: input.before.assumedProvenance,
      after: input.after.assumedProvenance,
    },
    before_validation: beforeValidation,
    after_validation: afterValidation,
    tree_diff: treeDiff,
    validation_delta: toSmokeValidationDelta(validationDelta),
    ...(input.renderMarkdown
      ? {
          markdown: {
            before: renderYSchemaMarkdown({
              schema,
              tree: input.before.candidate,
              relations: input.before.relations,
              validation: beforeValidation,
            }),
            after: renderYSchemaMarkdown({
              schema,
              tree: input.after.candidate,
              relations: input.after.relations,
              validation: afterValidation,
            }),
          },
        }
      : {}),
  };
}

function yamlResponse(data: unknown) {
  return yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

function respond(c: Context, data: unknown) {
  if (wantsYaml(c)) {
    return c.text(yamlResponse(data), 200, {
      'Content-Type': 'text/yaml; charset=utf-8',
    });
  }
  return c.json({ success: true, data });
}

function errorResponse(c: Context, message: string) {
  const data = {
    success: false,
    error: {
      code: 'INVALID_YSCHEMA_PRD_SMOKE_REQUEST',
      message,
    },
  };
  if (wantsYaml(c)) {
    return c.text(yamlResponse(data), 400, {
      'Content-Type': 'text/yaml; charset=utf-8',
    });
  }
  return c.json(data, 400);
}

export const yschemaPrdSmokeRoutes = new Hono();

yschemaPrdSmokeRoutes.get('/v1/dev/yschema/prd-smoke', (c) => {
  return respond(c, buildSmokeData());
});

yschemaPrdSmokeRoutes.post('/v1/dev/yschema/prd-smoke/validate', async (c) => {
  try {
    const raw = await c.req.text();
    const body = parseBody(raw, c.req.header('content-type') ?? '');
    const candidate = body.candidate ?? body.tree;
    if (candidate === undefined) {
      return errorResponse(c, 'Request body must include candidate or tree.');
    }

    return respond(
      c,
      buildSmokeData({
        candidate: candidate as CandidateTree,
        relations: normalizeRelations(body.relations),
        provenanceByPath: body.provenanceByPath ?? body.provenance_by_path,
      })
    );
  } catch (error) {
    return errorResponse(c, error instanceof Error ? error.message : String(error));
  }
});

yschemaPrdSmokeRoutes.post('/v1/dev/yschema/prd-smoke/diff', async (c) => {
  try {
    const raw = await c.req.text();
    const body = parseBody(raw, c.req.header('content-type') ?? '');
    const before = normalizeSnapshot(body.before, 'before');
    const after = normalizeSnapshot(body.after, 'after');
    const renderMarkdown = normalizeRenderMarkdown(body.renderMarkdown ?? body.render_markdown);

    return respond(
      c,
      buildSmokeDiffData({
        before,
        after,
        renderMarkdown,
      })
    );
  } catch (error) {
    return errorResponse(c, error instanceof Error ? error.message : String(error));
  }
});
