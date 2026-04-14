/**
 * t3x_admin -- manage projects, branches, and pins.
 *
 * Actions:
 *   create_project  -- create a new project
 *   create_branch   -- create a branch in a project
 *   create_pin      -- pin an item (conversation or leaf)
 *   delete_pin      -- remove a pin
 */

import type { PinType } from '@t3x-dev/core';
import { createPin, deletePin, insertBranch, insertProject } from '@t3x-dev/storage';

import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// -- Tool definition --

const ACTIONS = ['create_project', 'create_branch', 'create_pin', 'delete_pin'] as const;
type Action = (typeof ACTIONS)[number];

export const adminDef: ToolDef = {
  name: 't3x_admin',
  description: [
    'Manage projects, branches, and pins.',
    '',
    'Actions:',
    '  create_project  -- Create a new project.',
    '  create_branch   -- Create a branch in a project.',
    '  create_pin      -- Pin a conversation or leaf for context.',
    '  delete_pin      -- Remove a pin by ID.',
    '',
    'Examples:',
    '  { "action": "create_project", "name": "My Project" }',
    '  { "action": "create_branch", "project_id": "proj_abc", "name": "feature-x" }',
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
