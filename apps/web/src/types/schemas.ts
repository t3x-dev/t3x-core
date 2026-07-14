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

export interface SchemaContractPath {
  path: string;
  type: string;
  required: boolean;
  constraint: string;
  depth: 0 | 1 | 2;
}

export type SchemaContractChangeKind = 'ADD' | 'CHANGE' | 'KEEP' | 'REMOVE';

export interface SchemaContractChange {
  kind: SchemaContractChangeKind;
  path: string;
  summary: string;
}

/** Fixture-backed view model for the Schemas version browser. */
export interface SchemaReleasePreview extends SchemaRelease {
  canonicalName: string;
  schemaHash: string;
  updatedLabel: string;
  canonicalYaml: string;
  structure: SchemaContractPath[];
  changesBaseReleaseId: string;
  changes: SchemaContractChange[];
}

/** Fixture-backed registry payload with an explicit published-version pointer. */
export interface SchemaRegistryPreview {
  currentReleaseId: string;
  releases: SchemaReleasePreview[];
}

export interface SchemaReleaseFamily {
  name: string;
  releases: SchemaRelease[];
}
