/**
 * t3x_query — unified read tool for all T3X resources.
 *
 * Replaces 10+ individual list/show tools with a single
 * `target` parameter that selects the resource type.
 */

import {
  findBranchesByProject,
  findConversationById,
  findConversationsByProject,
  findDraftById,
  findLeafById,
  findLeavesByProject,
  findPinById,
  findPinsByProject,
  findProjectById,
  findProjects,
  getVerifiedTransitionCommitGraph,
  listCommitHistory,
  listDraftsByProject,
} from '@t3x-dev/storage';

import { getApiClient, isApiBackend, unwrapListPayload } from '../../backend.js';
import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Targets ──

const SINGULAR_TARGETS = [
  'project',
  'draft',
  'commit',
  'leaf',
  'pin',
  'source_thread',
  'source_evidence',
  'workspace',
  'conversation',
] as const;
const PLURAL_TARGETS = [
  'projects',
  'drafts',
  'commits',
  'leaves',
  'pins',
  'branches',
  'source_threads',
  'workspaces',
  'conversations',
] as const;
const ALL_TARGETS = [...SINGULAR_TARGETS, ...PLURAL_TARGETS] as const;

type Target = (typeof ALL_TARGETS)[number];

// ── Tool definition ──

export const queryDef: ToolDef = {
  name: 't3x_query',
  description: [
    'Read any T3X resource.',
    '',
    'Singular targets (require `id`):',
    '  project, draft, commit, leaf, pin, source_thread, source_evidence, workspace',
    '',
    'Plural targets (require `project_id`, except `projects`):',
    '  projects, drafts, commits, leaves, pins, branches, source_threads, workspaces',
    '',
    'Notes:',
    '  draft / drafts = workbench drafts used by extract/edit/commit',
    '  source_evidence also requires `project_id` and is available through the API backend',
    '  workspace / workspaces require `project_id` and the authenticated API backend',
    '  conversation / conversations are compatibility aliases for source_thread / source_threads',
    '',
    'Examples:',
    '  { "target": "projects" }',
    '  { "target": "project", "id": "proj_abc" }',
    '  { "target": "commits", "project_id": "proj_abc", "limit": 10 }',
    '  { "target": "commit", "id": "sha256:...", "project_id": "proj_abc" }',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ALL_TARGETS as unknown as string[],
        description: 'Resource type to query.',
      },
      id: {
        type: 'string',
        description: 'Resource ID (for singular targets).',
      },
      project_id: {
        type: 'string',
        description: 'Project scope (required for plural targets except `projects`).',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20).',
      },
      offset: {
        type: 'number',
        description: 'Skip first N results (default 0).',
      },
    },
    required: ['target'],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
};

// ── Handler ──

export const queryHandler: ToolHandler = async (args) => {
  const target = args.target as Target | undefined;

  if (!target || !ALL_TARGETS.includes(target as Target)) {
    return fail(
      `Missing or invalid "target". Must be one of: ${ALL_TARGETS.join(', ')}.\nUse a singular target with "id" to fetch one resource, or a plural target with "project_id" to list many.`
    );
  }

  const id = args.id as string | undefined;
  const projectId = args.project_id as string | undefined;
  const limit = (args.limit as number | undefined) ?? 20;
  const offset = (args.offset as number | undefined) ?? 0;

  if (isApiBackend()) {
    const client = getApiClient();

    if ((SINGULAR_TARGETS as readonly string[]).includes(target)) {
      if (!id) {
        return fail(
          `"id" is required for target="${target}".\nProvide the resource ID, e.g. { "target": "${target}", "id": "..." }.`
        );
      }

      switch (target) {
        case 'project':
          return ok(await client.getProject(id));
        case 'draft':
          return ok((await client.getDraft(id)) as Record<string, unknown>);
        case 'commit':
          if (!projectId) {
            return fail('"project_id" is required for target="commit".');
          }
          return ok(await client.getCommit(projectId, id));
        case 'leaf':
          return ok(await client.getLeaf(id));
        case 'pin':
          return ok(await client.getPin(id));
        case 'source_thread':
        case 'conversation':
          return ok(await client.sourceThreads.get(id));
        case 'source_evidence':
          if (!projectId) {
            return fail(
              '"project_id" is required for target="source_evidence" so the API can enforce project-scoped access.'
            );
          }
          return ok(await client.sourceThreads.evidence(projectId, id, { limit, offset }));
        case 'workspace':
          if (!projectId) {
            return fail('"project_id" is required for target="workspace".');
          }
          return ok(await client.workspaces.get(projectId, id));
      }
    }

    const needsProject = target !== 'projects';
    if (needsProject && !projectId) {
      return fail(
        `"project_id" is required for target="${target}".\nProvide the project scope, e.g. { "target": "${target}", "project_id": "proj_..." }.`
      );
    }

    switch (target) {
      case 'projects':
        return ok(unwrapListPayload(await client.listProjects({ limit, offset }), 'projects'));
      case 'drafts':
        return ok(
          unwrapListPayload(await client.listDrafts(projectId!, { limit, offset }), 'drafts')
        );
      case 'commits':
        return ok(
          unwrapListPayload(await client.listCommits(projectId!, { limit, offset }), 'commits')
        );
      case 'leaves':
        return ok(unwrapListPayload(await client.listLeaves(projectId!), 'leaves'));
      case 'pins':
        return ok(unwrapListPayload(await client.listPins(projectId!), 'pins'));
      case 'branches':
        return ok(
          unwrapListPayload(await client.listBranches(projectId!, { limit, offset }), 'branches')
        );
      case 'source_threads':
      case 'conversations':
        return ok(
          unwrapListPayload(
            await client.sourceThreads.list(projectId!, { limit, offset }),
            'conversations'
          )
        );
      case 'workspaces':
        return ok((await client.workspaces.list(projectId!)).workspaces);
      default:
        return fail(`Unhandled target: ${target}`);
    }
  }

  if (target === 'source_evidence' || target === 'workspace' || target === 'workspaces') {
    return fail(
      `target="${target}" requires T3X_MCP_BACKEND=api so authorization stays at the Source/Workspace service boundary.`
    );
  }

  const db = await getDB();

  // ── Singular targets ──

  if ((SINGULAR_TARGETS as readonly string[]).includes(target)) {
    if (!id) {
      return fail(
        `"id" is required for target="${target}".\nProvide the resource ID, e.g. { "target": "${target}", "id": "..." }.`
      );
    }

    switch (target) {
      case 'project': {
        const project = await findProjectById(db, id);
        return project ? ok(project) : fail(`Project not found: ${id}`);
      }
      case 'draft': {
        const draft = await findDraftById(db, id);
        return draft ? ok(draft) : fail(`Draft not found: ${id}`);
      }
      case 'commit': {
        if (!projectId) {
          return fail('"project_id" is required for target="commit".');
        }
        const commit = await getVerifiedTransitionCommitGraph(db, projectId, id);
        return commit
          ? ok({ digest: id, recorded_at: commit.recordedAt, object: commit.commit })
          : fail(`Commit not found: ${id}`);
      }
      case 'leaf': {
        const leaf = await findLeafById(db, id);
        return leaf ? ok(leaf) : fail(`Leaf not found: ${id}`);
      }
      case 'pin': {
        const pin = await findPinById(db, id);
        return pin ? ok(pin) : fail(`Pin not found: ${id}`);
      }
      case 'source_thread':
      case 'conversation': {
        const conv = await findConversationById(db, id);
        return conv ? ok(conv) : fail(`Source thread not found: ${id}`);
      }
    }
  }

  // ── Plural targets ──

  const needsProject = target !== 'projects';
  if (needsProject && !projectId) {
    return fail(
      `"project_id" is required for target="${target}".\nProvide the project scope, e.g. { "target": "${target}", "project_id": "proj_..." }.`
    );
  }

  switch (target) {
    case 'projects': {
      const rows = await findProjects(db, { limit, offset });
      return ok(rows);
    }
    case 'drafts': {
      const rows = await listDraftsByProject(db, projectId!, {
        limit,
        offset,
      });
      return ok(rows);
    }
    case 'commits': {
      const rows = await listCommitHistory(db, projectId!, { limit, offset });
      return ok(rows);
    }
    case 'leaves': {
      const rows = await findLeavesByProject(db, projectId!, { limit, offset });
      return ok(rows);
    }
    case 'pins': {
      const rows = await findPinsByProject(db, projectId!, { limit, offset });
      return ok(rows);
    }
    case 'branches': {
      const rows = await findBranchesByProject(db, {
        projectId: projectId!,
        limit,
        offset,
      });
      return ok(rows);
    }
    case 'source_threads':
    case 'conversations': {
      const rows = await findConversationsByProject(db, {
        projectId: projectId!,
        limit,
        offset,
      });
      return ok(rows);
    }
    default:
      return fail(`Unhandled target: ${target}`);
  }
};
