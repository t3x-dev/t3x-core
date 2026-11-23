import { T3xApiError } from '@t3x-dev/api-client';
import { getApiClient, isApiBackend } from '../backend.js';
import { fail, ok, type ToolDef, type ToolHandler } from './types.js';

const BRANCH_PAGE_SIZE = 100;

export const repositoryLocationDef: ToolDef = {
  name: 't3x_resolve_repository',
  description:
    'Resolve an owner/name repository address and an explicit branch to the canonical path, stable project ID, and exact observed branch head. An existing empty branch has a null head. Requires the API backend.',
  inputSchema: {
    type: 'object',
    properties: {
      repository: { type: 'string', description: 'Current or historical owner/name address.' },
      ref: { type: 'string', description: 'Exact branch name, for example main or feature/docs.' },
    },
    required: ['repository', 'ref'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

export const repositoryLocationHandler: ToolHandler = async ({ repository, ref }) => {
  if (!isApiBackend()) return fail('t3x_resolve_repository requires T3X_MCP_BACKEND=api.');

  const parts =
    typeof repository === 'string' ? repository.match(/^\/?([^/\s]+)\/([^/\s]+)$/) : null;
  if (!parts || parts.slice(1).some((part) => part === '.' || part === '..')) {
    return fail('repository must be an owner/name address.');
  }
  if (typeof ref !== 'string' || ref.length === 0) {
    return fail('ref must be an explicit branch name.');
  }
  const [, owner, name] = parts;
  const client = getApiClient();

  try {
    const address = await client.resolveRepository(owner, name);
    for (let offset = 0; ; offset += BRANCH_PAGE_SIZE) {
      const { branches } = await client.listBranches(address.project_id, {
        limit: BRANCH_PAGE_SIZE,
        offset,
      });
      const branch = branches.find((entry) => entry.name === ref);
      if (branch) {
        return ok({
          project_id: address.project_id,
          canonical_path: address.canonical_path,
          ref: branch.name,
          head_commit_hash: branch.head_commit_hash,
        });
      }
      if (branches.length < BRANCH_PAGE_SIZE) break;
    }
    return fail(
      JSON.stringify({
        error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.', status: 404 },
      })
    );
  } catch (error) {
    if (!(error instanceof T3xApiError)) throw error;
    return fail(
      JSON.stringify({
        error: { code: error.code, message: error.message, status: error.status },
      })
    );
  }
};
