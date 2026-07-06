export type SchemaReleaseStatus = 'draft' | 'active' | 'deprecated';

export type SchemaBreakingChangeLevel = 'none' | 'minor' | 'breaking';

export interface SchemaRelease {
  id: string;
  projectId: string;
  name: string;
  version: string;
  description: string;
  status: SchemaReleaseStatus;
  releasedAt?: string;
  releasedBy?: string;
  usedByCommitCount: number;
  usedByWorkspaceCount: number;
  breakingChangeLevel: SchemaBreakingChangeLevel;
  source: 'official' | 'team' | 'community';
  category: string;
  rootKey: string;
  requiredFields: string[];
  compatibleWith: string[];
  migrationSummary: string;
}

export interface SchemaReleaseFamily {
  name: string;
  releases: SchemaRelease[];
}
