import {
  findDraftById,
  findProjectById,
  getCommit,
  type Project,
} from '@t3x-dev/storage';
import type { Commit, Draft } from '@t3x-dev/core';
import { getDB } from '../db.js';

type ResourceKind = 'project' | 'commit' | 'workbench_draft';

interface ParsedResourceUri {
  kind: ResourceKind;
  id: string;
}

export const RESOURCE_TEMPLATES = [
  {
    name: 'project',
    uriTemplate: 't3x://projects/{project_id}',
    description: 'Read a project by project_id.',
    mimeType: 'application/json',
  },
  {
    name: 'commit',
    uriTemplate: 't3x://commits/{commit_hash}',
    description: 'Read a semantic commit by hash.',
    mimeType: 'application/json',
  },
  {
    name: 'workbench_draft',
    uriTemplate: 't3x://workbench-drafts/{draft_id}',
    description: 'Read a workbench draft used by extract/edit/commit.',
    mimeType: 'application/json',
  },
] as const;

function parseResourceUri(uri: string): ParsedResourceUri {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  if (parsed.protocol !== 't3x:') {
    throw new Error(`Unsupported resource scheme: ${parsed.protocol}`);
  }

  const resourceType = parsed.hostname;
  const id = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!id) {
    throw new Error(`Resource URI is missing an identifier: ${uri}`);
  }

  switch (resourceType) {
    case 'projects':
      return { kind: 'project', id };
    case 'commits':
      return { kind: 'commit', id };
    case 'workbench-drafts':
      return { kind: 'workbench_draft', id };
    default:
      throw new Error(`Unsupported resource URI: ${uri}`);
  }
}

function parseJsonOrNull(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toProjectReadModel(project: Project) {
  return {
    kind: 'project' as const,
    project_id: project.projectId,
    name: project.name,
    owner_id: project.ownerId ?? null,
    created_at: project.createdAt.toISOString(),
    default_provider: project.defaultProvider ?? null,
    default_model: project.defaultModel ?? null,
    metadata: parseJsonOrNull(project.metadataJson ?? null),
    extraction_style: project.extractionStyle ?? null,
  };
}

function toCommitReadModel(commit: Commit) {
  return {
    kind: 'commit' as const,
    hash: commit.hash,
    project_id: commit.project_id,
    branch: commit.branch,
    message: commit.message,
    committed_at: commit.committed_at,
    parents: commit.parents,
    author: commit.author,
    provenance: commit.provenance,
    sources: commit.sources ?? null,
    tree_count: commit.content.trees.length,
    relation_count: commit.content.relations.length,
    content: commit.content,
  };
}

function toWorkbenchDraftReadModel(draft: Draft) {
  return {
    kind: 'workbench_draft' as const,
    draft_id: draft.id,
    project_id: draft.project_id,
    title: draft.title,
    status: draft.status,
    revision: draft.revision,
    target_branch: draft.target_branch ?? null,
    extraction_mode: draft.extraction_mode ?? null,
    node_count: draft.nodes.length,
    constraint_count: draft.constraints.length,
    nodes: draft.nodes,
    constraints: draft.constraints,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}

export async function readResource(uri: string) {
  const parsed = parseResourceUri(uri);
  const db = await getDB();

  switch (parsed.kind) {
    case 'project': {
      const project = await findProjectById(db, parsed.id);
      if (!project) {
        throw new Error(`Project not found: ${parsed.id}`);
      }
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(toProjectReadModel(project), null, 2) }],
      };
    }
    case 'commit': {
      const commit = await getCommit(db, parsed.id);
      if (!commit) {
        throw new Error(`Commit not found: ${parsed.id}`);
      }
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(toCommitReadModel(commit), null, 2) }],
      };
    }
    case 'workbench_draft': {
      const draft = await findDraftById(db, parsed.id);
      if (!draft) {
        throw new Error(`Workbench draft not found: ${parsed.id}`);
      }
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(toWorkbenchDraftReadModel(draft), null, 2) }],
      };
    }
  }
}
