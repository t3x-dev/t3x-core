export interface SkillPolicyIssue {
  code: string;
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SkillPolicyResult {
  valid: boolean;
  ready: boolean;
  errors: SkillPolicyIssue[];
  gaps: SkillPolicyIssue[];
}

export interface SkillBundleFile {
  path: string;
  mediaType: string;
  content: string;
  sha256: string;
}

export interface SkillPolicyRelation {
  type: string;
  from: string;
  to: string;
}

export interface SkillCheckPlan {
  key: string;
  kind: string;
  runWhen: string;
  blocking: boolean;
  commandResource?: string;
  assertions: string[];
  successCriteria: string[];
  workflowKeys: string[];
}

export interface SkillBundle {
  rendererVersion: string;
  generatedDescription: string;
  files: SkillBundleFile[];
  missingResources: string[];
  bundleHash: string;
  checks: SkillCheckPlan[];
}

export interface CompileSkillBundleInput {
  tree: Record<string, unknown>;
  relations?: readonly SkillPolicyRelation[];
  resourceContents?: Record<string, string>;
}
