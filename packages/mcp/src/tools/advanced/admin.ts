/**
 * t3x_admin -- manage projects, branches, leaves, and pins.
 *
 * Actions:
 *   create_project  -- create a new project
 *   create_branch   -- create a branch in a project
 *   create_leaf     -- create a leaf from an existing commit
 *   create_pin      -- pin an item (conversation or leaf)
 *   delete_pin      -- remove a pin
 */

import {
  ALL_LEAF_TYPES,
  type AnyLeafType,
  type Constraint,
  type LeafConfig,
  type PinType,
} from '@t3x-dev/core';
import {
  createLeaf,
  createPin,
  deletePin,
  getCommit,
  insertBranch,
  insertProject,
} from '@t3x-dev/storage';

import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// -- Tool definition --

const ACTIONS = [
  'create_project',
  'create_branch',
  'create_leaf',
  'create_pin',
  'delete_pin',
] as const;
type Action = (typeof ACTIONS)[number];

export const adminDef: ToolDef = {
  name: 't3x_admin',
  description: [
    'Manage projects, branches, leaves, and pins.',
    '',
    'Actions:',
    '  create_project  -- Create a new project.',
    '  create_branch   -- Create a branch in a project.',
    '  create_leaf     -- Create a leaf from an existing commit.',
    '  create_pin      -- Pin a conversation or leaf for context.',
    '  delete_pin      -- Remove a pin by ID.',
    '',
    'Examples:',
    '  { "action": "create_project", "name": "My Project" }',
    '  { "action": "create_branch", "project_id": "proj_abc", "name": "feature-x" }',
    '  { "action": "create_leaf", "project_id": "proj_abc", "commit_hash": "sha256:...", "leaf_type": "tweet" }',
    '  { "action": "create_pin", "project_id": "proj_abc", "type": "conversation", "ref_id": "conv_xyz" }',
    '  { "action": "delete_pin", "pin_id": "pin_abc" }',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ACTIONS as unknown as string[],
        description: 'Admin action to perform.',
      },
      name: {
        type: 'string',
        description: 'Name (for create_project or create_branch).',
      },
      project_id: {
        type: 'string',
        description: 'Project ID (for create_branch, create_pin).',
      },
      parent_branch: {
        type: 'string',
        description: 'Parent branch name (optional, for create_branch).',
      },
      description: {
        type: 'string',
        description: 'Description (optional, for create_branch).',
      },
      commit_hash: {
        type: 'string',
        description: 'Commit hash to attach the leaf to (for create_leaf).',
      },
      leaf_type: {
        type: 'string',
        enum: ALL_LEAF_TYPES as unknown as string[],
        description: 'Leaf type (for create_leaf).',
      },
      title: {
        type: 'string',
        description: 'Optional title for create_leaf.',
      },
      constraints: {
        type: 'array',
        description: 'Optional output constraints for create_leaf.',
      },
      config: {
        type: 'object',
        description: 'Optional leaf config for create_leaf.',
      },
      type: {
        type: 'string',
        enum: ['conversation', 'leaf'],
        description: 'Pin type (for create_pin).',
      },
      ref_id: {
        type: 'string',
        description: 'Reference ID of the item to pin (for create_pin).',
      },
      pin_id: {
        type: 'string',
        description: 'Pin ID (for delete_pin).',
      },
    },
    required: ['action'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
};

// -- Handler --

export const adminHandler: ToolHandler = async (args) => {
  const action = args.action as Action | undefined;

  if (!action || !ACTIONS.includes(action as Action)) {
    return fail(`Missing or invalid "action". Must be one of: ${ACTIONS.join(', ')}.`);
  }

  switch (action) {
    case 'create_project':
      return handleCreateProject(args);
    case 'create_branch':
      return handleCreateBranch(args);
    case 'create_leaf':
      return handleCreateLeaf(args);
    case 'create_pin':
      return handleCreatePin(args);
    case 'delete_pin':
      return handleDeletePin(args);
  }
};

// -- Action handlers --

async function handleCreateProject(args: Record<string, unknown>) {
  const name = args.name as string | undefined;

  if (!name) return fail('"name" is required for create_project.');

  const db = await getDB();
  const project = await insertProject(db, { name });

  return ok({
    project_id: project.projectId,
    name: project.name,
    created_at: project.createdAt,
  });
}

async function handleCreateBranch(args: Record<string, unknown>) {
  const projectId = args.project_id as string | undefined;
  const name = args.name as string | undefined;
  const parentBranch = args.parent_branch as string | undefined;
  const description = args.description as string | undefined;

  if (!projectId) return fail('"project_id" is required for create_branch.');
  if (!name) return fail('"name" is required for create_branch.');

  const db = await getDB();
  const branch = await insertBranch(db, {
    projectId,
    name,
    parentBranch,
    description,
  });

  return ok({
    branch_id: branch.branchId,
    name: branch.name,
    project_id: branch.projectId,
    parent_branch: branch.parentBranch,
    created_at: branch.createdAt,
  });
}

async function handleCreateLeaf(args: Record<string, unknown>) {
  const projectId = args.project_id as string | undefined;
  const commitHash = args.commit_hash as string | undefined;
  const leafType = args.leaf_type as string | undefined;
  const title = args.title as string | undefined;
  const constraints = args.constraints as Constraint[] | undefined;
  const config = args.config as LeafConfig | undefined;

  if (!projectId) return fail('"project_id" is required for create_leaf.');
  if (!commitHash) return fail('"commit_hash" is required for create_leaf.');
  if (!leafType) return fail('"leaf_type" is required for create_leaf.');

  if (!(ALL_LEAF_TYPES as readonly string[]).includes(leafType)) {
    return fail(`Invalid leaf type "${leafType}". Must be one of: ${ALL_LEAF_TYPES.join(', ')}.`);
  }

  if (title !== undefined && typeof title !== 'string') {
    return fail('"title" must be a string for create_leaf.');
  }
  if (constraints !== undefined && !Array.isArray(constraints)) {
    return fail('"constraints" must be an array for create_leaf.');
  }
  if (
    config !== undefined &&
    (typeof config !== 'object' || config === null || Array.isArray(config))
  ) {
    return fail('"config" must be an object for create_leaf.');
  }

  const db = await getDB();
  const commit = await getCommit(db, commitHash);
  if (!commit) {
    return fail(`Commit not found: ${commitHash}`);
  }
  if (commit.project_id && commit.project_id !== projectId) {
    return fail(`Commit ${commitHash} does not belong to project ${projectId}.`);
  }

  const leaf = await createLeaf(db, {
    commit_hash: commitHash,
    type: leafType as AnyLeafType,
    title,
    constraints: constraints ?? [],
    config: config ?? {},
    project_id: projectId,
  });

  return ok({
    leaf_id: leaf.id,
    commit_hash: leaf.commit_hash,
    type: leaf.type,
    title: leaf.title ?? null,
    constraints: leaf.constraints ?? [],
    config: leaf.config ?? {},
    output: leaf.output ?? null,
    assertions: leaf.assertions ?? [],
    project_id: leaf.project_id,
    created_at: leaf.created_at,
    next_steps: [
      `Use t3x_query { "target": "leaf", "id": "${leaf.id}" } to inspect the leaf.`,
      `Use t3x_generate { "leaf_id": "${leaf.id}" } to generate output.`,
    ],
  });
}

async function handleCreatePin(args: Record<string, unknown>) {
  const projectId = args.project_id as string | undefined;
  const type = args.type as string | undefined;
  const refId = args.ref_id as string | undefined;

  if (!projectId) return fail('"project_id" is required for create_pin.');
  if (!type) return fail('"type" is required for create_pin. Use "conversation" or "leaf".');
  if (!refId) return fail('"ref_id" is required for create_pin.');

  const validTypes = ['conversation', 'leaf'];
  if (!validTypes.includes(type)) {
    return fail(`Invalid pin type "${type}". Must be one of: ${validTypes.join(', ')}.`);
  }

  const db = await getDB();
  const pin = await createPin(db, {
    project_id: projectId,
    type: type as PinType,
    ref_id: refId,
  });

  return ok({
    pin_id: pin.id,
    project_id: pin.project_id,
    type: pin.type,
    ref_id: pin.ref_id,
    pinned_at: pin.pinned_at,
  });
}

async function handleDeletePin(args: Record<string, unknown>) {
  const pinId = args.pin_id as string | undefined;

  if (!pinId) return fail('"pin_id" is required for delete_pin.');

  const db = await getDB();
  const deleted = await deletePin(db, pinId);

  if (!deleted) {
    return fail(`Pin not found or already deleted: ${pinId}`);
  }

  return ok({
    pin_id: pinId,
    deleted: true,
  });
}
