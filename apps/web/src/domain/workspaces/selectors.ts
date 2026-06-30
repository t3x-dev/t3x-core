import type {
  SourceBundleItem,
  SourceBundleType,
  WorkspaceCandidate,
  WorkspaceSchemaBinding,
  WorkspaceSortKey,
  WorkspaceStatus,
  WorkspaceStatusCounts,
  WorkspaceStatusFilter,
} from '@/types/workspaces';

export type WorkspaceStatusBadgeTone = 'pending' | 'branch' | 'warning' | 'commit';

const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatus, string> = {
  draft: 'Draft',
  ready_for_yops: 'Ready for YOps',
  schema_review: 'Schema review',
  committed: 'Committed',
};

const WORKSPACE_STATUS_TONES: Record<WorkspaceStatus, WorkspaceStatusBadgeTone> = {
  draft: 'pending',
  ready_for_yops: 'branch',
  schema_review: 'warning',
  committed: 'commit',
};

const SOURCE_ORDER: SourceBundleType[] = ['chat', 'document', 'prompt_run', 'import'];

const SOURCE_LABELS: Record<SourceBundleType, { singular: string; plural: string }> = {
  chat: { singular: 'chat', plural: 'chats' },
  document: { singular: 'doc', plural: 'docs' },
  prompt_run: { singular: 'prompt run', plural: 'prompt runs' },
  import: { singular: 'import', plural: 'imports' },
};

const SCHEMA_BINDING_PRIORITY: Record<WorkspaceSchemaBinding['mode'], number> = {
  draft_override: 3,
  pinned: 2,
  project_default: 1,
};

const EMPTY_WORKSPACE_STATUS_COUNTS: WorkspaceStatusCounts = {
  all: 0,
  draft: 0,
  ready_for_yops: 0,
  schema_review: 0,
  committed: 0,
};

export function formatWorkspaceStatus(status: WorkspaceStatus): string {
  return WORKSPACE_STATUS_LABELS[status];
}

export function getWorkspaceStatusBadgeTone(status: WorkspaceStatus): WorkspaceStatusBadgeTone {
  return WORKSPACE_STATUS_TONES[status];
}

export function summarizeSourceBundle(sources: SourceBundleItem[]): string {
  if (sources.length === 0) return 'No sources';

  return SOURCE_ORDER.map((type) => {
    const count = sources.filter((source) => source.type === type).length;
    if (count === 0) return null;
    const label = count === 1 ? SOURCE_LABELS[type].singular : SOURCE_LABELS[type].plural;
    return `${count} ${label}`;
  })
    .filter((part): part is string => part !== null)
    .join(', ');
}

export function getPrimarySchemaBinding(
  bindings: WorkspaceSchemaBinding[]
): WorkspaceSchemaBinding | null {
  return (
    bindings
      .slice()
      .sort(
        (left, right) => SCHEMA_BINDING_PRIORITY[right.mode] - SCHEMA_BINDING_PRIORITY[left.mode]
      )
      .at(0) ?? null
  );
}

export function countWorkspaceStatuses(candidates: WorkspaceCandidate[]): WorkspaceStatusCounts {
  const counts: WorkspaceStatusCounts = { ...EMPTY_WORKSPACE_STATUS_COUNTS };

  for (const candidate of candidates) {
    counts.all += 1;
    counts[candidate.status] += 1;
  }

  return counts;
}

export function filterWorkspaceCandidates(
  candidates: WorkspaceCandidate[],
  filters: { query: string; status: WorkspaceStatusFilter }
): WorkspaceCandidate[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const queryParts = normalizedQuery ? normalizedQuery.split(/\s+/) : [];

  return candidates.filter((candidate) => {
    if (filters.status !== 'all' && candidate.status !== filters.status) return false;
    if (queryParts.length === 0) return true;

    const searchableText = [
      candidate.title,
      candidate.summary,
      formatWorkspaceStatus(candidate.status),
      ...candidate.sourceBundle.flatMap((source) => [
        source.title,
        source.conversationId ?? '',
        source.fileName ?? '',
        source.runId ?? '',
        source.format ?? '',
      ]),
      ...candidate.schemaBindings.flatMap((binding) => [
        binding.schemaName,
        binding.version,
        binding.mode,
      ]),
    ]
      .join(' ')
      .toLowerCase();

    return queryParts.every((queryPart) => searchableText.includes(queryPart));
  });
}

export function sortWorkspaceCandidates(
  candidates: WorkspaceCandidate[],
  sortKey: WorkspaceSortKey
): WorkspaceCandidate[] {
  return candidates.slice().sort((left, right) => {
    if (sortKey === 'title_asc') return left.title.localeCompare(right.title);

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function selectWorkspaceCandidate(
  candidates: WorkspaceCandidate[],
  selectedWorkspaceId: string | null
): WorkspaceCandidate | null {
  return (
    candidates.find((candidate) => candidate.id === selectedWorkspaceId) ?? candidates.at(0) ?? null
  );
}
