export function parseJsonOrNull(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function toProjectReadModel(project: {
  projectId: string;
  name: string;
  ownerId: string | null;
  createdAt: Date;
  defaultProvider: string | null;
  defaultModel: string | null;
  metadataJson: string | null;
  extractionStyle: unknown;
}) {
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

export function toCommitReadModel(commit: {
  hash: string;
  project_id: string;
  branch: string;
  message: string | null;
  committed_at: string;
  parents: string[];
  author: unknown;
  provenance: unknown;
  sources?: unknown[] | null;
  content: { trees: unknown[]; relations: unknown[] };
}) {
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

export function toWorkbenchDraftReadModel(draft: {
  id: string;
  project_id: string;
  title: string;
  status: string;
  revision: number;
  target_branch?: string;
  extraction_mode?: string;
  nodes: unknown[];
  constraints: unknown[];
  created_at: string;
  updated_at: string;
}) {
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

export function toConversationReadModel(conversation: {
  conversationId: string;
  projectId: string;
  title: string | null;
  alias: string | null;
  parentCommitHash: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
  metadataJson: string | null;
  provider: string | null;
  model: string | null;
}) {
  return {
    kind: 'conversation' as const,
    conversation_id: conversation.conversationId,
    project_id: conversation.projectId,
    title: conversation.title,
    alias: conversation.alias,
    parent_commit_hash: conversation.parentCommitHash,
    position_x: conversation.positionX,
    position_y: conversation.positionY,
    created_at: conversation.createdAt.toISOString(),
    metadata: parseJsonOrNull(conversation.metadataJson),
    provider: conversation.provider,
    model: conversation.model,
  };
}

export function toLeafReadModel(leaf: {
  id: string;
  commit_hash: string;
  type: string;
  title?: string;
  constraints: unknown[];
  config: Record<string, unknown>;
  output?: string;
  generated_at?: string;
  assertions?: unknown[];
  runner_assertions?: unknown[];
  project_id: string;
  created_at: string;
  created_by?: string;
}) {
  return {
    kind: 'leaf' as const,
    leaf_id: leaf.id,
    project_id: leaf.project_id,
    commit_hash: leaf.commit_hash,
    type: leaf.type,
    title: leaf.title ?? null,
    config: leaf.config,
    constraint_count: leaf.constraints.length,
    assertion_count: leaf.assertions?.length ?? 0,
    runner_assertion_count: leaf.runner_assertions?.length ?? 0,
    has_output: Boolean(leaf.output),
    generated_at: leaf.generated_at ?? null,
    created_at: leaf.created_at,
    created_by: leaf.created_by ?? null,
    constraints: leaf.constraints,
    assertions: leaf.assertions ?? [],
    runner_assertions: leaf.runner_assertions ?? [],
  };
}

export function toMergeDraftReadModel(draft: {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch: string | null;
  targetBranch: string | null;
  preparedJson: string;
  status: string;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    kind: 'merge_draft' as const,
    draft_id: draft.draftId,
    project_id: draft.projectId,
    source_hash: draft.sourceHash,
    target_hash: draft.targetHash,
    source_branch: draft.sourceBranch,
    target_branch: draft.targetBranch,
    status: draft.status,
    message: draft.message,
    created_at: draft.createdAt.toISOString(),
    updated_at: draft.updatedAt.toISOString(),
    prepared: parseJsonOrNull(draft.preparedJson),
  };
}
