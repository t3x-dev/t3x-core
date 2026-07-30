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
  constraintTags?: SchemaConstraintTag[];
  depth: 0 | 1 | 2;
}

export type SchemaConstraintTag = 'blocking' | 'enum' | 'executable' | 'pattern';

export type SchemaContractChangeKind = 'ADD' | 'CHANGE' | 'KEEP' | 'REMOVE';

export interface SchemaContractChange {
  kind: SchemaContractChangeKind;
  path: string;
  summary: string;
}

export interface SchemaRelationTypePreview {
  id: string;
  from: string;
  to: string;
  description: string;
  constraints: string[];
}

export type SchemaRuleKind = 'descriptive' | 'executable';

export interface SchemaRulePreview {
  id: string;
  kind: SchemaRuleKind;
  description: string;
  scope: string;
  blocking: boolean;
  signals: string[];
}

/** Fixture-backed view model for the Schemas version browser. */
export interface SchemaReleasePreview extends SchemaRelease {
  canonicalName: string;
  schemaHash: string;
  updatedLabel: string;
  canonicalYaml: string;
  structure: SchemaContractPath[];
  relationTypes: SchemaRelationTypePreview[];
  rules: SchemaRulePreview[];
  changesBaseReleaseId: string;
  changes: SchemaContractChange[];
}

/** One selectable Schema family with an explicit published-version pointer. */
export interface SchemaFamilyPreview {
  id: string;
  name: string;
  canonicalName: string;
  description: string;
  currentReleaseId: string;
  releases: SchemaReleasePreview[];
}

/** Fixture-backed registry payload grouped by portable Schema family. */
export interface SchemaRegistryPreview {
  defaultFamilyId: string;
  families: SchemaFamilyPreview[];
}

export interface SchemaReleaseFamily {
  name: string;
  releases: SchemaRelease[];
}
