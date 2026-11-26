import {
  type AnyDB,
  findWorkspaceDraft,
  getTransitionProposalMembership,
  readAgentDelegation,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { evaluateProjectAccess } from './project-access';
import { activeGrant, isRepositoryDelegationKey } from './repository-agent-delegation';

// A delegated credential represents ordinary repository work. In particular it cannot
// manage accounts, other credentials, branch protection, shared delivery or repository setup.
export async function allowsRepositoryDelegationRequest(c: Context, db: AnyDB, id: string) {
  const grant = await readAgentDelegation(db, id);
  if (grant === null && !isRepositoryDelegationKey(id)) return true;
  if (!activeGrant(grant) || !grant.projectId || !grant.userId) return false;
  c.set('managedRepositoryDelegation', true);
  const path = c.req.path.replace(/^\/(?:api\/)?v1\//, '');
  const method = c.req.method;
  const read = method === 'GET' || method === 'HEAD';
  const project = path.match(/^projects\/([^/]+)(?:\/(.*))?$/);
  const target = project?.[2] ?? '';
  const humanAccess = await evaluateProjectAccess(
    db,
    grant.projectId,
    { userId: grant.userId, projectId: null, principalKind: 'human' },
    read ? 'project:read' : 'project:edit'
  );
  if (!humanAccess.allowed) return false;
  if (
    read &&
    (path === 'auth/me/credential' ||
      path === 'projects' ||
      path === 'yschema/catalog' ||
      path === 'explore/schema-release' ||
      path === 'llm/models' ||
      /^repositories\/[^/]+\/[^/]+$/.test(path))
  )
    return true;
  if (
    read &&
    /^(branches(?:\/current)?|conversations|runs|commits(?:\/[^/]+(?:\/(?:export|history|operations))?)?)$/.test(
      path
    )
  )
    return c.req.query('project_id') === grant.projectId;
  if (read && /^(?:conversations\/[^/]+|turns(?:\/[^/]+(?:\/chain)?)?)$/.test(path)) return true;
  // These resource lookups perform their own exact project and Workspace owner checks.
  if (read && /^(?:runs|workspace-validation-runs|yschema-validation-runs)\/[^/]+$/.test(path))
    return true;
  if (!project || decodeURIComponent(project[1]!) !== grant.projectId) return false;
  if (read)
    return (
      target === '' ||
      target === 'yschema/catalog' ||
      /^(?:commits|workspaces|transitions|sources|source-ingestions|materials|runs|schema-studio|yschema-validation|state-overview|branches)(?:\/|$)/.test(
        target
      )
    );
  if (grant.mode === 'read') return false;
  if (method === 'POST' && /^schema-studio\/(?:preview|preparation\/[^/]+\/preview)$/.test(target))
    return true;
  const json = async () => {
    try {
      return (await c.req.raw.clone().json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const permittedRef = (ref: unknown) =>
    typeof ref === 'string' && ref.length > 0 && (!grant.branchOnly || grant.branch === ref);
  const workspace = async (ws: unknown) => {
    if (typeof ws !== 'string') return false;
    const draft = await findWorkspaceDraft(db, grant.projectId!, ws);
    return draft !== null && permittedRef(draft.target_branch ?? 'main');
  };
  if (method === 'POST' && target === 'workspaces') return permittedRef((await json()).ref);
  if (
    method === 'POST' &&
    /^(?:source-ingestions\/[^/]+|repository-runs|yschema-validation\/runs)$/.test(target)
  )
    return true;
  if (method === 'POST' && /^(?:transitions|proposal-generations)$/.test(target))
    return workspace((await json()).workspace_id);
  const transition = target.match(/^transitions\/([^/]+)\/(verify|decisions|commits)$/);
  if (method === 'POST' && transition) {
    if (transition[2] !== 'verify' && grant.mode !== 'commit') return false;
    const member = await getTransitionProposalMembership(
      db,
      grant.projectId,
      decodeURIComponent(transition[1]!)
    );
    return member !== null && permittedRef(member.refName);
  }
  const draft = target.match(
    /^workspaces\/([^/]+)\/(authoring(?:\/(?:actions|schema-actions|reviews|content-restores|candidates\/[^/]+\/publication|reconciliation(?:\/preparations)?))?|validation-runs|extraction-proposals|transition\/review)$/
  );
  if (method === 'POST' && draft) return workspace(decodeURIComponent(draft[1]!));
  const edit = target.match(/^schema-studio\/edit-candidates\/([^/]+)$/);
  if (method === 'PUT' && edit) return workspace(decodeURIComponent(edit[1]!));
  return false;
}
