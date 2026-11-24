import { createHash } from 'node:crypto';
import { T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const defaultExcerptLength = 1200;
const maxExcerptLength = 4000;

export const sourceContextDef: ToolDef = {
  name: 't3x_source_context',
  description:
    'List project materials, quote an exact fragment of one material or original user turn, or list generation models reported available by the server.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['materials', 'material_excerpt', 'turn_excerpt', 'models'] },
      project_id: { type: 'string', description: 'Required for material and turn actions.' },
      material_id: { type: 'string', description: 'Exact material ID for material_excerpt.' },
      source_thread_id: { type: 'string', description: 'Exact Source Thread ID for turn_excerpt.' },
      turn_hash: { type: 'string', description: 'Exact original user turn hash for turn_excerpt.' },
      start: {
        type: 'integer',
        minimum: 0,
        description: 'Inclusive UTF-16 offset. Defaults to 0.',
      },
      end: {
        type: 'integer',
        minimum: 1,
        description: 'Exclusive UTF-16 offset. At most 4000 code units from start.',
      },
      expected_digest: {
        type: 'string',
        description: 'Optional sha256 digest of the exact text returned in resource.digest.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Page size for materials. Defaults to 25.',
      },
      offset: { type: 'integer', minimum: 0, description: 'Page offset for materials.' },
    },
    required: ['action'],
  },
  annotations: { readOnlyHint: true },
};

function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function startsLowSurrogate(content: string, index: number): boolean {
  const code = content.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff;
}

function textExcerpt(
  content: string,
  uri: string,
  mediaType: string,
  start: number,
  end: number | undefined,
  expected: unknown
) {
  const digest = `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
  if (expected !== undefined && digest !== expected) {
    throw new T3xApiError('HASH_CONFLICT', 'Source text does not match the expected digest.', 409);
  }
  let stop = end ?? Math.min(start + defaultExcerptLength, content.length);
  if (end === undefined && startsLowSurrogate(content, stop)) stop -= 1;
  if (
    start > content.length ||
    stop > content.length ||
    startsLowSurrogate(content, start) ||
    startsLowSurrogate(content, stop)
  ) {
    throw new T3xApiError(
      'INVALID_ARGUMENT',
      'The excerpt range must fit the source text and preserve Unicode characters.',
      400
    );
  }
  return {
    resource: { uri, mediaType, digest },
    char_start: start,
    char_end: stop,
    quote: content.slice(start, stop),
    next_start: stop < content.length ? stop : null,
  };
}

export const sourceContextHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const {
      action,
      project_id: projectId,
      material_id: materialId,
      source_thread_id: threadId,
      turn_hash: turnHash,
    } = args;
    if (action === 'models') {
      const catalog = await client.listGenerationModels();
      const providers = catalog.providers.filter(
        (provider) => provider.available && provider.models.length > 0
      );
      const available = new Set(providers.map(({ name }) => name));
      return {
        providers,
        generation_provider_order: catalog.generation_provider_order.filter((name) =>
          available.has(name)
        ),
        default_provider:
          catalog.default_provider && available.has(catalog.default_provider)
            ? catalog.default_provider
            : null,
      };
    }
    if (!isSafeBusinessIdentifier(projectId)) {
      throw new T3xApiError('INVALID_ARGUMENT', 'Provide project_id.', 400);
    }
    if (action === 'materials') {
      const { limit = 25, offset = 0 } = args;
      if (!integer(limit, 1) || limit > 100 || !integer(offset, 0)) {
        throw new T3xApiError(
          'INVALID_ARGUMENT',
          'Use a nonnegative offset and a limit from 1 to 100.',
          400
        );
      }
      const materials = (await client.listProjectSourceMaterials(projectId)).filter(
        (material) =>
          material.project_id === projectId &&
          !material.archived_at &&
          material.source_type !== 'image'
      );
      return {
        items: materials
          .slice(offset, offset + limit)
          .map(({ id, source_type, title, content_hash, content_excerpt }) => ({
            material_id: id,
            source_type,
            title,
            content_hash,
            content_excerpt,
          })),
        next_offset: offset + limit < materials.length ? offset + limit : null,
      };
    }
    const { start = 0, end, expected_digest: expected } = args;
    if (
      !integer(start, 0) ||
      (end !== undefined && (!integer(end, 1) || end <= start || end - start > maxExcerptLength)) ||
      (expected !== undefined &&
        (typeof expected !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(expected)))
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide a valid text range and optional SHA-256 digest.',
        400
      );
    }
    const projectUri = `t3x://projects/${encodeURIComponent(projectId)}`;
    if (action === 'material_excerpt' && isSafeBusinessIdentifier(materialId)) {
      const material = await client.getProjectSourceMaterial(projectId, materialId);
      if (
        material.id !== materialId ||
        material.project_id !== projectId ||
        material.archived_at ||
        material.source_type === 'image'
      ) {
        throw new T3xApiError('NOT_FOUND', 'Text material unavailable in this project.', 404);
      }
      return {
        material_id: materialId,
        content_hash: material.content_hash,
        ...textExcerpt(
          material.content_text,
          `${projectUri}/materials/${encodeURIComponent(materialId)}`,
          material.mime_type ?? 'text/plain;charset=utf-8',
          start,
          end,
          expected
        ),
      };
    }
    if (
      action === 'turn_excerpt' &&
      isSafeBusinessIdentifier(threadId) &&
      isSafeBusinessIdentifier(turnHash)
    ) {
      const thread = await client.sourceThreads.get(threadId);
      if (thread.conversation_id !== threadId || thread.project_id !== projectId) {
        throw new T3xApiError('NOT_FOUND', 'Source Thread unavailable in this project.', 404);
      }
      const turn = await client.sourceThreads.getTurn(turnHash);
      if (
        turn.turn_hash !== turnHash ||
        turn.project_id !== projectId ||
        turn.conversation_id !== threadId ||
        turn.role !== 'user'
      ) {
        throw new T3xApiError(
          'NOT_FOUND',
          'Original user turn unavailable in this Source Thread.',
          404
        );
      }
      return {
        turn_hash: turnHash,
        parent_turn_hash: turn.parent_turn_hash,
        ...textExcerpt(
          turn.content,
          `${projectUri}/conversations/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turnHash)}`,
          'text/plain;charset=utf-8',
          start,
          end,
          expected
        ),
      };
    }
    throw new T3xApiError(
      'INVALID_ARGUMENT',
      'Provide a valid action and its exact material or turn identifiers.',
      400
    );
  });
