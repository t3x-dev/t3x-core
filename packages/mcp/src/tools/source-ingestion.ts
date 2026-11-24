import { SourceIngestionInputSchema, T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

export const sourceIngestionDef: ToolDef = {
  name: 't3x_ingest_source',
  description:
    'Ingest machine-origin text or an attachment with a project-bound Agent credential. After a lost response, read the receipt before retrying the same request ID and input.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      request_id: {
        type: 'string',
        maxLength: 200,
        description: 'Stable project-and-Agent-scoped request ID.',
      },
      action: {
        type: 'string',
        enum: ['receipt', 'create_thread', 'append_turn', 'upload_material'],
      },
      title: { type: 'string', description: 'Thread title for create_thread.' },
      source_thread_id: { type: 'string', description: 'Exact target thread for append_turn.' },
      expected_parent_turn_hash: {
        type: ['string', 'null'],
        description: 'Current parent hash, or null for an empty thread.',
      },
      content: { type: 'string', description: 'Machine-ingested text for append_turn.' },
      filename: {
        type: 'string',
        description: 'Original attachment filename for upload_material.',
      },
      mime_type: {
        type: 'string',
        description: 'Optional attachment media type for upload_material.',
      },
      bytes_base64: {
        type: 'string',
        description: 'Canonical base64 attachment bytes, up to 5 MiB decoded.',
      },
    },
    required: ['action', 'project_id', 'request_id'],
  },
  annotations: { idempotentHint: true },
};

export const sourceIngestionHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { project_id: projectId, request_id: requestId, ...input } = args;
    if (
      !isSafeBusinessIdentifier(projectId) ||
      !isSafeBusinessIdentifier(requestId) ||
      requestId.length > 200
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide project_id and a safe request_id of up to 200 characters.',
        400
      );
    }
    if (input.action === 'receipt') {
      return client.getSourceIngestionReceipt(projectId, requestId);
    }
    const parsed = SourceIngestionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Source ingestion input does not match the selected action.',
        400
      );
    }
    return client.ingestSource(projectId, requestId, parsed.data);
  });
