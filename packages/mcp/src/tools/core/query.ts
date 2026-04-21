/**
 * t3x_query — unified read tool for all T3X resources.
 *
 * Replaces 10+ individual list/show tools with a single
 * `target` parameter that selects the resource type.
 */

import {
  findDraftById,
  findAgentDraftById,
  findAgentDraftsByProject,
  findBranchesByProject,
  findConversationById,
  findConversationsByProject,
  findLeafById,
  findLeavesByProject,
  findPinById,
  findPinsByProject,
  findProjectById,
  findProjects,
  getCommit,
  listDraftsByProject,
  listCommits,
} from '@t3x-dev/storage';

import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Targets ──

const SINGULAR_TARGETS = [
  'project',
  'draft',
  'agent_draft',
  'commit',
  'leaf',
  'pin',
  'conversation',
] as const;
const PLURAL_TARGETS = [
  'projects',
  'drafts',
  'agent_drafts',
  'commits',
  'leaves',
  'pins',
  'branches',
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
    '  project, draft, agent_draft, commit, leaf, pin, conversation',
    '',
    'Plural targets (require `project_id`, except `projects`):',
    '  projects, drafts, agent_drafts, commits, leaves, pins, branches, conversations',
    '',
    'Notes:',
    '  draft / drafts = workbench drafts used by extract/edit/commit',
    '  agent_draft / agent_drafts = agent draft objects',
    '',
    'Examples:',
    '  { "target": "projects" }',
    '  { "target": "project", "id": "proj_abc" }',
    '  { "target": "commits", "project_id": "proj_abc", "limit": 10 }',
    '  { "target": "commit", "id": "sha256:..." }',
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
      branch: {
        type: 'string',
        description: 'Filter commits by branch name.',
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

  const db = await getDB();
  const id = args.id as string | undefined;
  const projectId = args.project_id as string | undefined;
  const limit = (args.limit as number | undefined) ?? 20;
  const offset = (args.offset as number | undefined) ?? 0;
  const branch = args.branch as string | undefined;

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
      case 'agent_draft': {
        const draft = await findAgentDraftById(db, id);
        return draft ? ok(draft) : fail(`Agent draft not found: ${id}`);
      }
      case 'commit': {
        const commit = await getCommit(db, id);
        return commit ? ok(commit) : fail(`Commit not found: ${id}`);
      }
      case 'leaf': {
        const leaf = await findLeafById(db, id);
        return leaf ? ok(leaf) : fail(`Leaf not found: ${id}`);
      }
      case 'pin': {
        const pin = await findPinById(db, id);
        return pin ? ok(pin) : fail(`Pin not found: ${id}`);
      }
      case 'conversation': {
        const conv = await findConversationById(db, id);
        return conv ? ok(conv) : fail(`Conversation not found: ${id}`);
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
    case 'agent_drafts': {
      const rows = await findAgentDraftsByProject(db, {
        projectId: projectId!,
        limit,
        offset,
      });
      return ok(rows);
    }
    case 'commits': {
      const rows = await listCommits(db, {
        projectId: projectId!,
        branch,
        limit,
        offset,
      });
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
