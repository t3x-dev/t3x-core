import { T3xApiError } from '@t3x-dev/api-client';
import { getApiClient, isApiBackend } from '../backend.js';
import { fail, ok, type ToolDef, type ToolHandler } from './types.js';

export const contextDef: ToolDef = {
  name: 't3x_context',
  description:
    'Read the current authenticated actor and credential types, project or namespace binding, and granted Transition scopes. Each operation is authorized by the API.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

export const contextHandler: ToolHandler = async () => {
  if (!isApiBackend()) {
    return fail(
      JSON.stringify({
        error: { code: 'API_BACKEND_REQUIRED', message: 'Context requires the API backend.' },
      })
    );
  }
  try {
    return ok(await getApiClient().getCredentialContext());
  } catch (error) {
    if (!(error instanceof T3xApiError)) throw error;
    return fail(
      JSON.stringify({ error: { code: error.code, message: error.message, status: error.status } })
    );
  }
};
