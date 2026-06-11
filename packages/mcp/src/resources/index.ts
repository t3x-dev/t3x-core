import {
  findConversationById,
  findDraftById,
  findLeafById,
  findProjectById,
  getCommit,
  getMergeDraft,
} from '@t3x-dev/storage';
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
  | 'conversation'
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
    name: 'conversation',
    uriTemplate: 't3x://conversations/{conversation_id}',
    description: 'Read a conversation by conversation_id.',
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
    case 'conversations':
      return { kind: 'conversation', id };
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
    case 'conversation': {
      const conversation = await findConversationById(db, parsed.id);
      if (!conversation) {
        throw new Error(`Conversation not found: ${parsed.id}`);
      }
      return jsonTextContent(uri, toConversationReadModel(conversation));
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
