import { SchemaJsonValueSchema, StudioSampleValueSchema, T3xApiError } from '@t3x-dev/api-client';
import {
  normalizeYSchemaObject,
  sha256CompositionValue,
  validateTree,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import { getApiClient, isApiBackend } from '../backend.js';
import { isSafeBusinessIdentifier } from '../business-capabilities.js';
import { fail, ok, type ToolDef, type ToolHandler } from './types.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const relationFields = {
  from: { type: 'string' },
  to: { type: 'string' },
  type: { type: 'string' },
};

export const schemaRegistryDef: ToolDef = {
  name: 't3x_schema_registry',
  description:
    'List authorized Schema releases, read one exact release, or run structural YSchema validation on supplied JSON Content. Read and validate require the canonical name, version and artifact hash returned by list. Validation makes no writes and creates no Run.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'read', 'validate'] },
      project_id: {
        type: 'string',
        description: 'Optional repository context for its authorized Schema catalog.',
      },
      source_project_id: {
        type: 'string',
        description: 'Release owner project ID from the catalog, when the release has an owner.',
      },
      canonical_name: {
        type: 'string',
        description: 'Exact canonical name, for example t3x/prd.',
      },
      version: { type: 'string', description: 'Exact release version for read or validate.' },
      artifact_hash: { type: 'string', pattern: DIGEST.source },
      schema_hash: {
        type: 'string',
        pattern: DIGEST.source,
        description: 'Optional expected definition digest, for example from a Commit binding.',
      },
      query: { type: 'string', description: 'Optional catalog search text for list.' },
      cursor: { type: 'string', description: 'The preceding catalog page’s next cursor.' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      content: {
        type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
        description:
          'JSON Content relative to the selected Schema root. Remove the repository binding key (such as prd) when it wraps the Schema root.',
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          properties: relationFields,
          required: Object.keys(relationFields),
        },
      },
    },
    required: ['action'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

function errorResult(code: string, message: string, status?: number) {
  return fail(JSON.stringify({ error: { code, message, status } }));
}

function isReleaseField(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isRelation(value: unknown): value is YSchemaRelation {
  return (
    value !== null &&
    typeof value === 'object' &&
    'from' in value &&
    typeof value.from === 'string' &&
    'to' in value &&
    typeof value.to === 'string' &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

export const schemaRegistryHandler: ToolHandler = async ({
  action,
  project_id: projectId,
  source_project_id: sourceProjectId,
  canonical_name: canonicalName,
  version,
  artifact_hash: expectedHash,
  schema_hash: expectedSchemaHash,
  query,
  cursor,
  limit,
  content,
  relations,
}) => {
  if (!isApiBackend()) {
    return errorResult('API_BACKEND_REQUIRED', 'Schema registry requires T3X_MCP_BACKEND=api.');
  }
  if (
    (projectId !== undefined && !isSafeBusinessIdentifier(projectId)) ||
    (sourceProjectId !== undefined && !isSafeBusinessIdentifier(sourceProjectId)) ||
    (canonicalName !== undefined && (!isReleaseField(canonicalName) || canonicalName.length > 200))
  ) {
    return errorResult('INVALID_ARGUMENT', 'Invalid repository identifier or canonical name.', 400);
  }

  try {
    const client = getApiClient();
    if (action === 'list') {
      if (
        (query !== undefined && typeof query !== 'string') ||
        (cursor !== undefined && typeof cursor !== 'string') ||
        (limit !== undefined &&
          (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100))
      ) {
        return errorResult('INVALID_ARGUMENT', 'Invalid catalog search or pagination input.', 400);
      }
      return ok(
        await client.listSchemaCatalog({
          projectId,
          canonical_name: canonicalName,
          q: query,
          cursor,
          limit,
        })
      );
    }
    if (
      (action !== 'read' && action !== 'validate') ||
      !isReleaseField(canonicalName) ||
      !isReleaseField(version) ||
      version.length > 80 ||
      version.toLowerCase() === 'latest' ||
      typeof expectedHash !== 'string' ||
      !DIGEST.test(expectedHash) ||
      (expectedSchemaHash !== undefined &&
        (typeof expectedSchemaHash !== 'string' || !DIGEST.test(expectedSchemaHash)))
    ) {
      return errorResult(
        'INVALID_ARGUMENT',
        'Use list, or provide read or validate with an exact canonical_name, version and artifact_hash.',
        400
      );
    }

    const release = await client.readSchemaRegistryRelease({
      projectId,
      sourceProjectId,
      canonicalName,
      version,
      expectedHash,
    });
    if (
      release.artifactHash !== expectedHash ||
      release.manifest.canonicalName !== canonicalName ||
      release.manifest.version !== version ||
      (await sha256CompositionValue(release.manifest)) !== expectedHash
    ) {
      return errorResult(
        'HASH_CONFLICT',
        'Schema release does not match the requested identity.',
        409
      );
    }
    const identity = {
      project_id: projectId ?? null,
      canonical_name: canonicalName,
      version,
      artifact_hash: expectedHash,
      ...(sourceProjectId !== undefined ? { source_project_id: sourceProjectId } : {}),
    };
    if (release.manifest.schema === undefined) {
      if (action === 'read' && expectedSchemaHash === undefined) {
        return ok({ ...identity, schema_hash: null, definition: null, manifest: release.manifest });
      }
      return errorResult(
        'SCHEMA_DEFINITION_UNAVAILABLE',
        'The selected release has no standalone definition to validate. Select a complete Schema release.',
        422
      );
    }
    let schema: ReturnType<typeof normalizeYSchemaObject>;
    try {
      schema = normalizeYSchemaObject(release.manifest.schema);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('INVALID_SCHEMA:')) throw error;
      return errorResult('INVALID_SCHEMA_DEFINITION', 'The selected definition is invalid.', 422);
    }
    const schemaHash = await sha256CompositionValue(schema);
    if (expectedSchemaHash !== undefined && schemaHash !== expectedSchemaHash) {
      return errorResult(
        'HASH_CONFLICT',
        'Definition does not match the expected Schema digest.',
        409
      );
    }
    if (action === 'read') {
      return ok({ ...identity, schema_hash: schemaHash, definition: release.manifest.schema });
    }

    if (
      !StudioSampleValueSchema.safeParse({ content, relations }).success ||
      (relations !== undefined && (!Array.isArray(relations) || !relations.every(isRelation)))
    ) {
      return errorResult(
        'INVALID_ARGUMENT',
        'Provide bounded JSON Content and valid relations.',
        400
      );
    }
    const tree = SchemaJsonValueSchema.safeParse(content);
    if (!tree.success) {
      return errorResult('INVALID_ARGUMENT', 'Provide the JSON Content to validate.', 400);
    }
    return ok({
      ...identity,
      schema_hash: schemaHash,
      validation: validateTree({ schema, tree: tree.data, relations }),
    });
  } catch (error) {
    if (error instanceof T3xApiError) {
      return errorResult(error.code, error.message, error.status);
    }
    throw error;
  }
};
