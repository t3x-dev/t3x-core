import { T3xApiError } from '@t3x-dev/api-client';
import { getApiClient, isApiBackend } from '../backend.js';
import { apiToolError, ok, type ToolDef, type ToolHandler, toolError } from './types.js';

export const contextDef: ToolDef = {
  name: 't3x_context',
  description:
    'Read the current authenticated actor and credential types, project or namespace binding, and granted Transition scopes. Each operation is authorized by the API.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

export const contextHandler: ToolHandler = async () => {
  if (!isApiBackend()) {
    return toolError('API_BACKEND_REQUIRED', 'Context requires the API backend.');
  }
  try {
    return ok(await getApiClient().getCredentialContext());
  } catch (error) {
    if (!(error instanceof T3xApiError)) throw error;
    return apiToolError(error);
  }
};
