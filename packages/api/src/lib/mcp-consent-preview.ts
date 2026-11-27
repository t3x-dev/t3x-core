import {
  type AnyDB,
  findBranchByName,
  findCurrentBranch,
  findProjects,
  getRepositoryAddress,
  getRepositoryAddresses,
  readMcpPreselection,
  resolveRepositoryProject,
  selectAgentDelegations,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  AuthorizationError,
  type authorizationRequest,
  delegationModes,
  digest,
  scopeAllows,
  type WorkMode,
} from './mcp-authorization';
import { contentSchemaReadiness } from './open-workspace';
import { evaluateProjectAccess, getProjectListAuthority } from './project-access';
import { previewRepositoryAgentDelegation } from './repository-agent-delegation';

type OAuthRequest = ReturnType<typeof authorizationRequest>;
export const delegationDays = z.union([z.literal(1), z.literal(7), z.literal(30)]);

export async function canDelegate(db: AnyDB, userId: string, projectId: string) {
  const result = await evaluateProjectAccess(
    db,
    projectId,
    { userId, principalKind: 'human', projectId: null },
    'project:guests:manage'
  );
  if (!result.allowed) throw new AuthorizationError(404, 'Repository unavailable for delegation.');
  return result.project;
}

async function resolveSelection(
  db: AnyDB,
  userId: string,
  repository: string | null,
  projectId: string | null
) {
  if (repository !== null) {
    const parts = repository.split('/');
    if (parts.length !== 2 || parts.some((part) => !part.trim()))
      throw new AuthorizationError(400, 'Use a repository address in owner/name format.');
    const named = await resolveRepositoryProject(db, parts[0], parts[1]);
    if (!named || (projectId && projectId !== named.projectId))
      throw new AuthorizationError(404, 'Repository unavailable for delegation.');
    return canDelegate(db, userId, named.projectId);
  }
  return projectId ? canDelegate(db, userId, projectId) : null;
}

export async function repositoryChoices(c: Context, db: AnyDB) {
  const authority = getProjectListAuthority(c);
  if (!authority) return [];
  const repositories: { id: string; name: string }[] = [];
  let cursor: string | null = '';
  do {
    const page: { items: { projectId: string; name: string }[]; next_cursor: string | null } =
      await findProjects(db, {
        authority,
        required_action: 'project:guests:manage',
        cursor,
        limit: 100,
      });
    const addresses = await getRepositoryAddresses(
      db,
      page.items.map((p) => p.projectId)
    );
    repositories.push(
      ...page.items.map((p) => ({
        id: p.projectId,
        name: addresses.get(p.projectId)?.canonical_path?.slice(1) ?? p.name,
      }))
    );
    cursor = page.next_cursor;
  } while (cursor);
  return repositories;
}

export async function selectionForRequest(
  db: AnyDB,
  userId: string,
  request: OAuthRequest,
  params: URLSearchParams
) {
  const chosen = params.get('useSelection');
  if (request.preselection && chosen && request.preselection !== chosen) {
    throw new AuthorizationError(409, 'The saved selection does not match this request.');
  }
  const selectionId = request.preselection ?? chosen;
  const saved = selectionId === null ? null : await readMcpPreselection(db, selectionId, userId);
  const projectId = params.get('projectId');
  if (
    selectionId !== null &&
    (!saved ||
      saved.clientId !== request.client.client_id ||
      (request.branch !== null && request.branch !== saved.branch) ||
      (projectId !== null && projectId !== saved.projectId))
  ) {
    throw new AuthorizationError(404, 'Saved selection unavailable for this connection.');
  }
  const project = await resolveSelection(
    db,
    userId,
    request.repository,
    saved?.projectId ?? projectId
  );
  const branch =
    request.branch ??
    saved?.branch ??
    (project && (await findCurrentBranch(db, project.projectId))?.name) ??
    'main';
  if (project && !(await findBranchByName(db, project.projectId, branch)))
    throw new AuthorizationError(404, 'Branch not found.');
  return { project, branch, saved };
}
type Selection = Awaited<ReturnType<typeof selectionForRequest>>;

async function describeTarget(
  db: AnyDB,
  userId: string,
  project: NonNullable<Selection['project']>,
  branch: string,
  mode: WorkMode,
  deployment: WorkMode,
  options: { branchOnly: boolean; days: number }
) {
  const target = await findBranchByName(db, project.projectId, branch);
  if (!target) throw new AuthorizationError(404, 'Branch not found.');
  const effective = await previewRepositoryAgentDelegation(db, {
    projectId: project.projectId,
    options: { mode, branch, ...options },
  });
  const address = await getRepositoryAddress(db, project);
  let outcome: string;
  let detail: string;
  if (mode === 'read') {
    outcome = 'read_only';
    detail =
      deployment === 'read'
        ? 'This MCP connection can read repository content and history. Its editing tools are unavailable.'
        : 'The requested access covers reading content and history.';
  } else if (effective.outcome === 'missing-policy') {
    outcome = 'draft_only';
    detail =
      'The Agent can save a draft. A repository administrator must configure a branch acceptance policy before the Agent can prepare a fixed Review.';
  } else if (effective.outcome === 'commit' && mode === 'commit') {
    outcome = 'eligible';
    detail =
      'The Agent can prepare a fixed Review and commit its eligible changes after checks pass.';
  } else {
    outcome = 'protected';
    detail =
      mode === 'prepare'
        ? 'The Agent can prepare changes for your review. A person must decide before commit.'
        : 'This branch keeps its existing acceptance rules. The Agent can prepare a Review. An eligible reviewer must approve before commit.';
  }
  let readinessDetail: string | undefined;
  if (mode !== 'read') {
    const schema = await contentSchemaReadiness(
      db,
      project.projectId,
      { kind: 'human', id: userId },
      branch,
      target.headCommitHash
    );
    if (schema === 'unbound')
      readinessDetail =
        'The Agent can collect sources now. Choose a Schema before its first content commit.';
    if (schema === 'first-schema')
      readinessDetail =
        'This Workspace has a selected Schema. Its first Schema needs your approval.';
    if (schema === 'unresolved')
      readinessDetail = 'The Workspace Schema needs attention before content can be verified.';
  }
  return {
    id: project.projectId,
    name: address.canonical_path?.slice(1) ?? project.name,
    branch,
    outcome,
    detail,
    ...(readinessDetail && { readinessDetail }),
  };
}

export async function consentTerms(
  db: AnyDB,
  userId: string,
  request: OAuthRequest,
  params: URLSearchParams,
  deployment: WorkMode,
  selection: Selection
) {
  const scope = scopeAllows(deployment, request.mode) ? request.mode : deployment;
  const requested = z.enum(delegationModes).parse(params.get('requestedMode') ?? scope);
  const mode = scopeAllows(scope, requested) ? requested : scope;
  const days = delegationDays.parse(Number(params.get('days') ?? 7));
  const branchOnly =
    z.enum(['true', 'false']).parse(params.get('branchOnly') ?? 'false') === 'true';
  const { project, branch, saved } = selection;
  const selected = project
    ? await describeTarget(db, userId, project, branch, mode, deployment, { branchOnly, days })
    : null;
  const existing =
    project &&
    (await selectAgentDelegations(db, project.projectId, userId)).find(
      (grant) => grant.clientId === request.client.client_id && !grant.revokedAt
    );
  const priorGrant = existing ? { id: existing.id, clientName: existing.agentName } : null;
  const hash = digest(
    JSON.stringify([
      request.client.client_name,
      selected,
      scope,
      mode,
      days,
      branchOnly,
      saved?.id ?? null,
      priorGrant,
      existing?.revision ?? null,
    ])
  );
  return { selected, scope, mode, days, branchOnly, priorGrant, hash };
}
