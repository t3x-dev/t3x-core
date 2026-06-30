export type SchemaReleaseStatus = 'draft' | 'active' | 'deprecated';

export type SchemaBreakingChangeLevel = 'none' | 'minor' | 'breaking';

export interface SchemaRelease {
  id: string;
  projectId: string;
  name: string;
  version: string;
  status: SchemaReleaseStatus;
  releasedAt?: string;
  releasedBy?: string;
  usedByCommitCount: number;
  usedByWorkspaceCount: number;
  breakingChangeLevel: SchemaBreakingChangeLevel;
}

export interface SchemaReleaseFamily {
  name: string;
  releases: SchemaRelease[];
}
