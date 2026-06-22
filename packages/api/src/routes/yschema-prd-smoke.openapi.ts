import {
  generatePromptContract,
  type ProvenanceIndex,
  t3xPrdP0Fixtures,
  validateTree,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import { type Context, Hono } from 'hono';
import yaml from 'js-yaml';

type CandidateTree = Parameters<typeof validateTree>[0]['tree'];

interface PrdSmokeRequest {
  candidate?: unknown;
  tree?: unknown;
  relations?: unknown;
  provenanceByPath?: ProvenanceIndex;
  provenance_by_path?: ProvenanceIndex;
}

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

function parseBody(raw: string, contentType: string): PrdSmokeRequest {
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
