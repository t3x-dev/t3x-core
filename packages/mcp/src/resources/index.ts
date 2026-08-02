import {
  findConversationById,
  findDraftById,
  findLeafById,
  findProjectById,
  getCommit,
  getMergeDraft,
} from '@t3x-dev/storage';
import { getApiClient, isApiBackend } from '../backend.js';
import { getDB } from '../db.js';
import {
  toCommitReadModel,
  toConversationReadModel,
  toLeafReadModel,
  toMergeDraftReadModel,
  toProjectReadModel,
  toWorkbenchDraftReadModel,
} from '../read-models/index.js';

type ResourceKind =
  | 'project'
  | 'commit'
  | 'workbench_draft'
  | 'source_thread'
  | 'leaf'
  | 'merge_draft';

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
    description: 'Read a structured-state commit by hash.',
    mimeType: 'application/json',
  },
  {
    name: 'workbench_draft',
    uriTemplate: 't3x://workbench-drafts/{draft_id}',
    description: 'Read a workbench draft used by extract/edit/commit.',
    mimeType: 'application/json',
  },
  {
    name: 'source_thread',
    uriTemplate: 't3x://source-threads/{source_thread_id}',
    description: 'Read durable source-thread metadata by source_thread_id.',
    mimeType: 'application/json',
  },
  {
    name: 'conversation_compatibility',
    uriTemplate: 't3x://conversations/{conversation_id}',
    description: 'Compatibility alias for a source-thread resource.',
    mimeType: 'application/json',
  },
  {
    name: 'leaf',
    uriTemplate: 't3x://leaves/{leaf_id}',
    description: 'Read a leaf by leaf_id.',
    mimeType: 'application/json',
  },
  {
    name: 'merge_draft',
    uriTemplate: 't3x://merge-drafts/{draft_id}',
    description: 'Read a merge draft by draft_id.',
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
    case 'source-threads':
    case 'conversations':
      return { kind: 'source_thread', id };
    case 'leaves':
      return { kind: 'leaf', id };
    case 'merge-drafts':
      return { kind: 'merge_draft', id };
    default:
      throw new Error(`Unsupported resource URI: ${uri}`);
  }
}

function jsonTextContent(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export async function readResource(uri: string) {
  const parsed = parseResourceUri(uri);

  if (isApiBackend()) {
    const client = getApiClient();
    switch (parsed.kind) {
      case 'project':
        return jsonTextContent(uri, {
          kind: 'project',
          ...(await client.getProject(parsed.id)),
        });
      case 'commit':
        return jsonTextContent(uri, {
          kind: 'commit',
          ...(await client.getCommit(parsed.id)),
        });
      case 'workbench_draft':
        return jsonTextContent(uri, {
          kind: 'workbench_draft',
          ...(await client.getDraft(parsed.id)),
        });
      case 'source_thread':
        return jsonTextContent(uri, {
          kind: 'source_thread',
          ...(await client.sourceThreads.get(parsed.id)),
        });
      case 'leaf':
        return jsonTextContent(uri, {
          kind: 'leaf',
          ...(await client.getLeaf(parsed.id)),
        });
      case 'merge_draft':
        return jsonTextContent(uri, {
          kind: 'merge_draft',
          ...(await client.getMergeDraft(parsed.id)),
        });
      default: {
        const exhaustiveCheck: never = parsed.kind;
        throw new Error(`Unhandled resource kind: ${String(exhaustiveCheck)}`);
      }
    }
  }

  const db = await getDB();

  switch (parsed.kind) {
    case 'project': {
      const project = await findProjectById(db, parsed.id);
      if (!project) {
        throw new Error(`Project not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, toProjectReadModel(project));
    }
    case 'commit': {
      const commit = await getCommit(db, parsed.id);
      if (!commit) {
        throw new Error(`Commit not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, toCommitReadModel(commit));
    }
    case 'workbench_draft': {
      const draft = await findDraftById(db, parsed.id);
      if (!draft) {
        throw new Error(`Workbench draft not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, toWorkbenchDraftReadModel(draft));
    }
    case 'source_thread': {
      const conversation = await findConversationById(db, parsed.id);
      if (!conversation) {
        throw new Error(`Source thread not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, {
        ...toConversationReadModel(conversation),
        kind: 'source_thread',
      });
    }
    case 'leaf': {
      const leaf = await findLeafById(db, parsed.id);
      if (!leaf) {
        throw new Error(`Leaf not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, toLeafReadModel(leaf));
    }
    case 'merge_draft': {
      const draft = await getMergeDraft(db, parsed.id);
      if (!draft) {
        throw new Error(`Merge draft not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, toMergeDraftReadModel(draft));
    }
    default: {
      const exhaustiveCheck: never = parsed.kind;
      throw new Error(`Unhandled resource kind: ${String(exhaustiveCheck)}`);
    }
  }
}
