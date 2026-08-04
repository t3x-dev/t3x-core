import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import * as yaml from 'js-yaml';

export type StatePointStatus = 'changed' | 'created' | 'missing' | 'set' | 'unchanged';

export interface StatePointRow {
  depth: number;
  expandable: boolean;
  id: string;
  issueCount: number;
  key: string;
  path: string;
  sourceOp: string;
  status: StatePointStatus;
  statusLabel: string;
  type: string;
  value: string;
}

export interface StateOperationEntry {
  created_at: string;
  id: string;
  model?: string | null;
  source: string;
  turn_hash: string | null;
  yops: unknown;
}

export interface StateValidationGapLike {
  path?: string | null;
}

export interface StateWorkspaceDraftOperationLike {
  afterValue?: unknown;
  id?: string;
  op?: string;
  path?: string;
  reason?: string;
  sourceRefs?: string[];
  summary?: string;
}

export interface BuildStatePointRowsOptions {
  gaps?: StateValidationGapLike[];
  operations?: StateOperationEntry[];
}

interface OperationMark {
  label: string;
  status: StatePointStatus;
}

export interface PrdRenderRequirement {
  acceptance: string;
  description: string;
  key: string;
  owner: string;
  priority: string;
  title: string;
}

export interface PrdRenderSection {
  key: string;
  title: string;
  value: unknown;
}

export interface PrdRenderEvidence {
  fieldPaths: string[];
  id: string;
  label: string;
  sourceId: string;
  title: string;
}

export interface PrdRenderChange {
  evidenceId: string | null;
  id: string;
  kind: string;
  path: string;
  summary: string;
  title: string;
}

export interface PrdRenderModel {
  audience: string;
  audienceMissing: boolean;
  changes: PrdRenderChange[];
  documentId: string;
  evidence: PrdRenderEvidence[];
  lede: string;
  metadata: Record<string, unknown>;
  owner: string;
  outcome: string;
  problem: string;
  requirements: PrdRenderRequirement[];
  rootKey?: string;
  schemaVersion: string;
  sections: PrdRenderSection[];
  target: string;
  title: string;
}

export interface SkillRenderInstruction {
  approval: string;
  body: string;
  effect: string;
  freedom: string;
  key: string;
  kind: string;
  onFailure: string;
  resourceKeys: string[];
  sequence: number;
  successCriteria: string[];
  title: string;
}

export interface SkillRenderResource {
  contentHash: string;
  description: string;
  key: string;
  kind: string;
  loadPolicy: string;
  mediaType: string;
  path: string;
  revision: string;
  sourceUrl: string;
  useWhen: string;
}

export interface SkillRenderDependency {
  description: string;
  identifier: string;
  key: string;
  kind: string;
  permissions: string[];
  required: boolean;
  useWhen: string;
  versionConstraint: string;
}

export interface SkillRenderWorkflow {
  checkKeys: string[];
  dependencyKeys: string[];
  fallbackWorkflow: string;
  key: string;
  kind: string;
  onEmpty: string;
  onFailure: string;
  outputFormats: string[];
  persistence: string;
  resourceKeys: string[];
  stepKeys: string[];
  title: string;
  when: string;
}

export interface SkillRenderCheck {
  assertions: string[];
  blocking: boolean;
  commandResource: string;
  key: string;
  kind: string;
  runWhen: string;
  successCriteria: string[];
  workflowKeys: string[];
}

export interface SkillRenderEval {
  assertions: string[];
  expectedOutput: string;
  files: string[];
  key: string;
  kind: string;
  prompt: string;
}

export interface SkillRenderModel {
  checks: SkillRenderCheck[];
  defaultFreedom: string;
  dependencies: SkillRenderDependency[];
  evals: SkillRenderEval[];
  goal: string;
  implicit: boolean;
  inputs: string[];
  instructions: SkillRenderInstruction[];
  name: string;
  nonGoals: string[];
  outputs: string[];
  resources: SkillRenderResource[];
  shouldNotTrigger: string[];
  shouldTrigger: string[];
  summary: string;
  truthPolicy: string;
  workflows: SkillRenderWorkflow[];
}

export type StateReaderKind = 'generic' | 'prd' | 'prompt' | 'skill';

export interface PromptRenderIssue {
  code: string;
  label: string;
  message: string;
  path: string;
}

export interface PromptRenderSource {
  id: string;
  label: string;
  type: string;
}

export interface PromptRenderYOp {
  id: string;
  kind: string;
  label: string;
  path: string;
  source: string;
}

export interface PromptRenderMessage {
  contextKeys: string[];
  issues: PromptRenderIssue[];
  key: string;
  latestYOp: PromptRenderYOp | null;
  onMissingVariable: string;
  optional: boolean;
  purpose: string;
  resourceKeys: string[];
  role: string;
  sequence: number;
  sources: PromptRenderSource[];
  template: string;
  variableKeys: string[];
}

export interface PromptRenderVariable {
  defaultValue: unknown;
  description: string;
  enumValues: string[];
  issues: PromptRenderIssue[];
  key: string;
  onMissing: string;
  required: boolean;
  sensitive: boolean;
  source: string;
  usedByMessageKeys: string[];
  valuePattern: string;
  valueType: string;
}

export interface PromptRenderContext {
  key: string;
  kind: string;
  loadPolicy: string;
  maxTokens: number | null;
  onEmpty: string;
  placement: string;
  required: boolean;
  resourceKey: string;
  targetMessageKeys: string[];
}

export interface PromptRenderResource {
  contentHash: string;
  description: string;
  key: string;
  kind: string;
  loadPolicy: string;
  mediaType: string;
  modelContextEligible: boolean;
  path: string;
  usedByMessageKeys: string[];
}

export interface PromptRenderCheck {
  assertions: string[];
  blocking: boolean;
  fixtureResource: string;
  key: string;
  kind: string;
  runWhen: string;
  successCriteria: string[];
  verifiedMessageKeys: string[];
  verifiesOutput: boolean;
}

export interface PromptRenderEval {
  assertions: string[];
  evaluatedMessageKeys: string[];
  expectedOutput: string;
  fixtureResource: string;
  key: string;
  kind: string;
  minimumScore: number | null;
}

export interface PromptRenderModel {
  checks: PromptRenderCheck[];
  contexts: PromptRenderContext[];
  contract: {
    goal: string;
    inputs: string[];
    nonGoals: string[];
    outputs: string[];
    truthPolicy: string;
  };
  evals: PromptRenderEval[];
  issues: PromptRenderIssue[];
  messages: PromptRenderMessage[];
  name: string;
  output: {
    format: string;
    maxRetries: number | null;
    onParseFailure: string;
    schemaResource: string;
    strict: boolean;
  };
  resources: PromptRenderResource[];
  runtime: {
    maxOutputTokens: number | null;
    mode: string;
    responseFormat: string;
    streaming: boolean;
    toolPolicy: string;
  };
  sources: PromptRenderSource[];
  summary: string;
  variables: PromptRenderVariable[];
}

export interface PromptRenderModelOptions {
  issues?: Array<{
    code?: string;
    label?: string;
    message?: string;
    path?: string | null;
  }>;
  operations?: StateOperationEntry[];
  sources?: Array<{ id: string; title?: string; type: string }> | null;
}

function semanticContentToPlain(content: SemanticContent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tree of content.trees ?? []) {
    const [key, value] = treeNodeToPlain(tree);
    out[key] = value;
  }
  return out;
}

function treeNodeToPlain(node: TreeNode): [string, Record<string, unknown>] {
  const value: Record<string, unknown> = { ...(node.slots ?? {}) };
  for (const child of node.children ?? []) {
    const [childKey, childValue] = treeNodeToPlain(child);
    value[childKey] = childValue;
  }
  return [node.key, value];
}

export function buildStatePointRows(
  content: SemanticContent,
  options: BuildStatePointRowsOptions = {}
): StatePointRow[] {
  const plain = semanticContentToPlain(content);
  const rootKeys = Object.keys(plain);
  const gapPaths = buildGapPathSet(options.gaps ?? [], rootKeys);
  const operationIndex = buildOperationPathIndex(options.operations ?? []);
  const rows: StatePointRow[] = [];

  for (const [key, value] of Object.entries(plain)) {
    appendRows(rows, key, value, key, 0, gapPaths, operationIndex);
  }

  return rows;
}

export function buildCanonicalStateYaml(content: SemanticContent): string {
  return yaml
    .dump(semanticContentToPlain(content), {
      forceQuotes: false,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      sortKeys: false,
    })
    .trimEnd();
}

export function workspaceDraftOperationsToStateOperations(
  operations: StateWorkspaceDraftOperationLike[]
): StateOperationEntry[] {
  return operations.flatMap((operation, index) => {
    const yOp = workspaceDraftOperationToYOp(operation);
    if (!yOp) return [];
    return [
      {
        created_at: '',
        id: operation.id || 'workspace_draft_op_' + String(index + 1),
        model: null,
        source: operation.sourceRefs?.[0] || 'workspace_draft',
        turn_hash: null,
        yops: [yOp],
      },
    ];
  });
}

export function selectPrdRenderModel(
  content: SemanticContent,
  options: { gaps?: StateValidationGapLike[]; operations?: StateOperationEntry[] } = {}
): PrdRenderModel {
  const plain = semanticContentToPlain(content);
  const rootKey = Object.hasOwn(plain, 'prd') ? 'prd' : Object.keys(plain)[0];
  const root = toRecord(rootKey ? plain[rootKey] : null);
  const isPrdRoot = rootKey === 'prd';
  const summary = toRecord(root.summary);
  const metadata = toRecord(root.metadata);
  const gapPaths = buildGapPathSet(options.gaps ?? [], rootKey ? [rootKey] : []);
  const audience = valueToStringList(isPrdRoot ? summary.audience : root.audience).join(' · ');
  const { changes, evidence } = buildPrdRenderTrace(options.operations ?? []);
  const excludedSectionKeys = new Set([
    'description',
    'id',
    'lede',
    'metadata',
    'owner',
    'requirements',
    'schema',
    'summary',
    'target',
    'title',
  ]);
  if (!isPrdRoot) excludedSectionKeys.add('objective');

  return {
    audience,
    audienceMissing:
      audience.length === 0 || gapPaths.has(normalizePath(`${rootKey || 'prd'}/summary/audience`)),
    changes,
    documentId: scalarToString(root.id) || scalarToString(metadata.id),
    evidence,
    lede:
      firstScalar(
        root.lede,
        root.description,
        isPrdRoot ? undefined : root.objective,
        summary.description,
        summary.outcome,
        summary.problem
      ) || '',
    metadata,
    owner: scalarToString(root.owner) || scalarToString(metadata.owner),
    outcome: scalarToString(summary.outcome),
    problem: scalarToString(summary.problem),
    requirements: requirementsToRenderModel(root.requirements),
    rootKey,
    schemaVersion:
      firstScalar(root.schema, metadata.schema, metadata.schema_version, metadata.version) || '',
    sections: buildPrdSections(root, excludedSectionKeys),
    target: scalarToString(root.target) || scalarToString(metadata.target),
    title:
      scalarToString(root.title) ||
      (!isPrdRoot && rootKey ? humanizeKey(rootKey) : 'State document'),
  };
}

export function selectSkillRenderModel(content: SemanticContent): SkillRenderModel {
  const plain = semanticContentToPlain(content);
  const root = Object.hasOwn(plain, 'skill') ? toRecord(plain.skill) : plain;
  const manifest = toRecord(root.manifest);
  const activation = toRecord(root.activation);
  const contract = toRecord(root.contract);
  const relations = content.relations.map((relation) => ({
    from: normalizeSkillEndpoint(relation.from),
    to: normalizeSkillEndpoint(relation.to),
    type: relation.type,
  }));
  const relationTargets = (type: string, from: string) =>
    Array.from(
      new Set(
        relations
          .filter((relation) => relation.type === type && relation.from === from)
          .map((relation) => relation.to)
      )
    );
  const endpointKeys = (type: string, from: string, collection: string) =>
    relationTargets(type, from).flatMap((endpoint) => {
      const prefix = `${collection}/`;
      return endpoint.startsWith(prefix) ? [endpoint.slice(prefix.length)] : [];
    });
  const checks = repeatedRecordEntries(root.checks)
    .map(([key, check]) => ({
      assertions: stringList(check.assertions),
      blocking: check.blocking === true,
      commandResource: scalarToString(check.command_resource),
      key,
      kind: scalarToString(check.kind),
      runWhen: scalarToString(check.run_when),
      successCriteria: stringList(check.success_criteria),
      workflowKeys: endpointKeys('verifies', `checks/${key}`, 'workflows').sort(),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    checks,
    defaultFreedom: scalarToString(contract.default_freedom),
    dependencies: repeatedRecordEntries(root.dependencies).map(([key, dependency]) => ({
      description: scalarToString(dependency.description),
      identifier: scalarToString(dependency.identifier),
      key,
      kind: scalarToString(dependency.kind),
      permissions: stringList(dependency.permissions),
      required: dependency.required === true,
      useWhen: scalarToString(dependency.use_when),
      versionConstraint: scalarToString(dependency.version_constraint),
    })),
    evals: repeatedRecordEntries(root.evals).map(([key, evaluation]) => ({
      assertions: stringList(evaluation.assertions),
      expectedOutput: scalarToString(evaluation.expected_output),
      files: stringList(evaluation.files),
      key,
      kind: scalarToString(evaluation.kind),
      prompt: scalarToString(evaluation.prompt),
    })),
    goal: scalarToString(contract.goal),
    implicit: activation.implicit === true,
    inputs: stringList(contract.inputs),
    instructions: repeatedRecordEntries(root.instructions)
      .map(([key, instruction], index) => ({
        approval: scalarToString(instruction.approval) || 'none',
        body: scalarToString(instruction.body),
        effect: scalarToString(instruction.effect) || 'none',
        freedom:
          scalarToString(instruction.freedom) ||
          scalarToString(contract.default_freedom) ||
          'medium',
        key,
        kind: scalarToString(instruction.kind),
        onFailure: scalarToString(instruction.on_failure),
        resourceKeys: endpointKeys('instruction_uses_resource', `instructions/${key}`, 'resources'),
        sequence: typeof instruction.sequence === 'number' ? instruction.sequence : index + 1,
        successCriteria: stringList(instruction.success_criteria),
        title: scalarToString(instruction.title) || humanizeKey(key),
      }))
      .sort((left, right) => left.sequence - right.sequence || left.key.localeCompare(right.key)),
    name: scalarToString(manifest.name) || 'unnamed-skill',
    nonGoals: stringList(contract.non_goals),
    outputs: stringList(contract.outputs),
    resources: repeatedRecordEntries(root.resources).map(([key, resource]) => ({
      contentHash: scalarToString(resource.content_hash),
      description: scalarToString(resource.description),
      key,
      kind: scalarToString(resource.kind),
      loadPolicy: scalarToString(resource.load_policy),
      mediaType: scalarToString(resource.media_type),
      path: scalarToString(resource.path),
      revision: scalarToString(resource.revision),
      sourceUrl: scalarToString(resource.source_url),
      useWhen: scalarToString(resource.use_when),
    })),
    shouldNotTrigger: stringList(activation.should_not_trigger),
    shouldTrigger: stringList(activation.should_trigger),
    summary: scalarToString(manifest.summary),
    truthPolicy: scalarToString(contract.truth_policy),
    workflows: repeatedRecordEntries(root.workflows)
      .map(([key, workflow]) => ({
        checkKeys: checks
          .filter((check) => check.workflowKeys.includes(key))
          .map((check) => check.key),
        dependencyKeys: endpointKeys('requires', `workflows/${key}`, 'dependencies'),
        fallbackWorkflow: scalarToString(workflow.fallback_workflow),
        key,
        kind: scalarToString(workflow.kind),
        onEmpty: scalarToString(workflow.on_empty),
        onFailure: scalarToString(workflow.on_failure),
        outputFormats: stringList(workflow.output_formats),
        persistence: scalarToString(workflow.persistence),
        resourceKeys: endpointKeys('workflow_uses_resource', `workflows/${key}`, 'resources'),
        stepKeys: endpointKeys('has_step', `workflows/${key}`, 'instructions'),
        title: scalarToString(workflow.title) || humanizeKey(key),
        when: scalarToString(workflow.when),
      }))
      .sort((left, right) => {
        const order = ['primary', 'supporting', 'persistence', 'review'];
        const leftRank = order.indexOf(left.kind);
        const rightRank = order.indexOf(right.kind);
        return (
          (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank) ||
          left.key.localeCompare(right.key)
        );
      }),
  };
}

export function resolveStateReaderKind(schemaName: string): StateReaderKind {
  if (schemaName === 't3x/prd') return 'prd';
  if (schemaName === 't3x/skill') return 'skill';
  if (schemaName === 't3x/prompt') return 'prompt';
  return 'generic';
}

export function selectPromptRenderModel(
  content: SemanticContent,
  options: PromptRenderModelOptions = {}
): PromptRenderModel {
  const plain = semanticContentToPlain(content);
  const root = Object.hasOwn(plain, 'prompt') ? toRecord(plain.prompt) : plain;
  const manifest = toRecord(root.manifest);
  const contract = toRecord(root.contract);
  const runtime = toRecord(root.runtime);
  const output = toRecord(root.output);
  const relations = content.relations.map((relation) => ({
    from: normalizePromptEndpoint(relation.from),
    to: normalizePromptEndpoint(relation.to),
    type: relation.type,
  }));
  const relationTargets = (type: string, from: string) =>
    Array.from(
      new Set(
        relations
          .filter((relation) => relation.type === type && relation.from === from)
          .map((relation) => relation.to)
      )
    );
  const relationSources = (type: string, to: string) =>
    Array.from(
      new Set(
        relations
          .filter((relation) => relation.type === type && relation.to === to)
          .map((relation) => relation.from)
      )
    );
  const endpointKeys = (endpoints: string[], collection: string) =>
    endpoints.flatMap((endpoint) => {
      const prefix = `${collection}/`;
      return endpoint.startsWith(prefix) ? [endpoint.slice(prefix.length)] : [];
    });
  const sources = (options.sources ?? []).map((source) => ({
    id: source.id,
    label: source.title?.trim() || humanizeKey(source.type),
    type: source.type,
  }));
  const issues = (options.issues ?? []).flatMap((issue) => {
    const rawPath = typeof issue.path === 'string' ? issue.path.trim() : '';
    if (!rawPath) return [];
    return [
      {
        code: issue.code?.trim() || 'VALIDATION_ISSUE',
        label: issue.label?.trim() || 'Validation issue',
        message: issue.message?.trim() || `${rawPath} needs review.`,
        path: normalizePromptEndpoint(rawPath),
      },
    ];
  });
  const issuesForPath = (path: string) =>
    issues.filter((issue) => isSameOrDescendantPath(issue.path, path));
  const messages = repeatedRecordEntries(root.messages)
    .map(([key, message], index) => {
      const path = `messages/${key}`;
      const template = scalarToString(message.template);
      const relationVariableKeys = endpointKeys(
        relationTargets('uses_variable', path),
        'variables'
      );
      const placeholderVariableKeys = Array.from(
        template.matchAll(/{{\s*([a-zA-Z_][\w.-]*)\s*}}/g),
        (match) => match[1] ?? ''
      ).filter(Boolean);
      const trace = selectPromptRenderTrace(path, options.operations ?? [], sources);
      return {
        contextKeys: endpointKeys(relationSources('provides_context', path), 'contexts').sort(),
        issues: issuesForPath(path),
        key,
        latestYOp: trace.latestYOp,
        onMissingVariable: scalarToString(message.on_missing_variable),
        optional: message.optional === true,
        purpose: scalarToString(message.purpose),
        resourceKeys: endpointKeys(relationTargets('uses_resource', path), 'resources').sort(),
        role: scalarToString(message.role),
        sequence: typeof message.sequence === 'number' ? message.sequence : index + 1,
        sources: trace.sources,
        template,
        variableKeys: Array.from(
          new Set([...relationVariableKeys, ...placeholderVariableKeys])
        ).sort(),
      };
    })
    .sort((left, right) => left.sequence - right.sequence || left.key.localeCompare(right.key));
  const messageKeysForTarget = (type: string, collection: string, key: string) =>
    endpointKeys(relationSources(type, `${collection}/${key}`), 'messages').sort();

  return {
    checks: repeatedRecordEntries(root.checks)
      .map(([key, check]) => ({
        assertions: stringList(check.assertions),
        blocking: check.blocking === true,
        fixtureResource: scalarToString(check.fixture_resource),
        key,
        kind: scalarToString(check.kind),
        runWhen: scalarToString(check.run_when),
        successCriteria: stringList(check.success_criteria),
        verifiedMessageKeys: endpointKeys(
          relationTargets('verifies_message', `checks/${key}`),
          'messages'
        ).sort(),
        verifiesOutput: relationTargets('verifies_output', `checks/${key}`).includes('output'),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    contexts: repeatedRecordEntries(root.contexts)
      .map(([key, context]) => ({
        key,
        kind: scalarToString(context.kind),
        loadPolicy: scalarToString(context.load_policy),
        maxTokens: typeof context.max_tokens === 'number' ? context.max_tokens : null,
        onEmpty: scalarToString(context.on_empty),
        placement: scalarToString(context.placement),
        required: context.required === true,
        resourceKey: scalarToString(context.resource_key),
        targetMessageKeys: endpointKeys(
          relationTargets('provides_context', `contexts/${key}`),
          'messages'
        ).sort(),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    contract: {
      goal: scalarToString(contract.goal),
      inputs: stringList(contract.inputs),
      nonGoals: stringList(contract.non_goals),
      outputs: stringList(contract.outputs),
      truthPolicy: scalarToString(contract.truth_policy),
    },
    evals: repeatedRecordEntries(root.evals)
      .map(([key, evaluation]) => ({
        assertions: stringList(evaluation.assertions),
        evaluatedMessageKeys: endpointKeys(
          relationTargets('evaluates', `evals/${key}`),
          'messages'
        ).sort(),
        expectedOutput: scalarToString(evaluation.expected_output),
        fixtureResource: scalarToString(evaluation.fixture_resource),
        key,
        kind: scalarToString(evaluation.kind),
        minimumScore:
          typeof evaluation.minimum_score === 'number' ? evaluation.minimum_score : null,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    issues,
    messages,
    name: scalarToString(manifest.name) || 'unnamed-prompt',
    output: {
      format: scalarToString(output.format),
      maxRetries: typeof output.max_retries === 'number' ? output.max_retries : null,
      onParseFailure: scalarToString(output.on_parse_failure),
      schemaResource:
        scalarToString(output.schema_resource) ||
        endpointKeys(relationTargets('uses_output_schema', 'output'), 'resources')[0] ||
        '',
      strict: output.strict === true,
    },
    resources: repeatedRecordEntries(root.resources)
      .map(([key, resource]) => {
        const loadPolicy = scalarToString(resource.load_policy);
        return {
          contentHash: scalarToString(resource.content_hash),
          description: scalarToString(resource.description),
          key,
          kind: scalarToString(resource.kind),
          loadPolicy,
          mediaType: scalarToString(resource.media_type),
          modelContextEligible: loadPolicy === 'always' || loadPolicy === 'on_demand',
          path: scalarToString(resource.path),
          usedByMessageKeys: messageKeysForTarget('uses_resource', 'resources', key),
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key)),
    runtime: {
      maxOutputTokens:
        typeof runtime.max_output_tokens === 'number' ? runtime.max_output_tokens : null,
      mode: scalarToString(runtime.mode),
      responseFormat: scalarToString(runtime.response_format),
      streaming: runtime.streaming === true,
      toolPolicy: scalarToString(runtime.tool_policy),
    },
    sources,
    summary: scalarToString(manifest.summary),
    variables: repeatedRecordEntries(root.variables)
      .map(([key, variable]) => ({
        defaultValue: variable.default_value,
        description: scalarToString(variable.description),
        enumValues: stringList(variable.enum_values),
        issues: issuesForPath(`variables/${key}`),
        key,
        onMissing: scalarToString(variable.on_missing),
        required: variable.required === true,
        sensitive: variable.sensitive === true,
        source: scalarToString(variable.source),
        usedByMessageKeys: messages
          .filter((message) => message.variableKeys.includes(key))
          .map((message) => message.key),
        valuePattern: scalarToString(variable.value_pattern),
        valueType: scalarToString(variable.value_type),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function normalizePromptEndpoint(value: string): string {
  return normalizePath(value).replace(/^prompt\//, '');
}

function isSameOrDescendantPath(candidate: string, path: string): boolean {
  return candidate === path || candidate.startsWith(`${path}/`);
}

function selectPromptRenderTrace(
  path: string,
  operations: StateOperationEntry[],
  fallbackSources: PromptRenderSource[]
): { latestYOp: PromptRenderYOp | null; sources: PromptRenderSource[] } {
  const matchedSources = new Map<string, PromptRenderSource>();
  let latestYOp: PromptRenderYOp | null = null;
  let operationIndex = 0;

  for (const entry of operations) {
    for (const yOp of normalizeYOps(entry.yops)) {
      const kind = yOpName(yOp);
      if (!kind) continue;
      operationIndex += 1;
      const payload = toRecord(yOp[kind]);
      const rawPath = firstString(payload.path, payload.to, payload.from);
      if (!rawPath) continue;
      const operationPath = normalizePromptEndpoint(rawPath);
      if (
        !isSameOrDescendantPath(operationPath, path) &&
        !isSameOrDescendantPath(path, operationPath)
      ) {
        continue;
      }
      const sourceId = entry.turn_hash || entry.source || entry.id;
      matchedSources.set(sourceId, {
        id: sourceId,
        label: humanizeKey(entry.source || 'YOp source'),
        type: entry.turn_hash ? 'turn' : 'yop',
      });
      latestYOp = {
        id: entry.id,
        kind,
        label: `${paddedOperationIndex(operationIndex)} ${kind.toUpperCase()}`,
        path: operationPath,
        source: entry.source,
      };
    }
  }

  const sources = matchedSources.size > 0 ? Array.from(matchedSources.values()) : fallbackSources;
  return { latestYOp, sources };
}

function normalizeSkillEndpoint(value: string): string {
  return normalizePath(value).replace(/^skill\//, '');
}

function buildPrdSections(
  root: Record<string, unknown>,
  excludedSectionKeys: Set<string>
): PrdRenderSection[] {
  const contractFlags: Record<string, unknown> = {};
  const sections: PrdRenderSection[] = [];

  for (const [key, value] of Object.entries(root)) {
    if (excludedSectionKeys.has(key) || key === 'root_metadata') continue;
    if (typeof value === 'boolean') {
      contractFlags[key] = value;
      continue;
    }
    sections.push({ key, title: humanizeKey(key), value });
  }

  if (Object.keys(contractFlags).length > 0) {
    sections.unshift({ key: 'contract_flags', title: 'Contract flags', value: contractFlags });
  }

  return sections;
}

function buildPrdRenderTrace(operations: StateOperationEntry[]): {
  changes: PrdRenderChange[];
  evidence: PrdRenderEvidence[];
} {
  const evidence: PrdRenderEvidence[] = [];
  const evidenceByEntry = new Map<string, PrdRenderEvidence>();
  const changes: PrdRenderChange[] = [];
  let changeIndex = 0;

  operations.forEach((entry, entryIndex) => {
    const yOps = normalizeYOps(entry.yops);
    if (yOps.length === 0) return;

    const sourceKey = entry.turn_hash || entry.source || entry.id;
    let sourceEvidence = evidenceByEntry.get(sourceKey);
    if (!sourceEvidence) {
      sourceEvidence = {
        fieldPaths: [],
        id: `evidence-${String(evidence.length + 1)}`,
        label: `S${String(evidence.length + 1)}`,
        sourceId: entry.turn_hash || entry.source || entry.id,
        title: humanizeKey(entry.source || `source-${String(entryIndex + 1)}`),
      };
      evidenceByEntry.set(sourceKey, sourceEvidence);
      evidence.push(sourceEvidence);
    }

    yOps.forEach((yOp) => {
      const opName = yOpName(yOp);
      if (!opName) return;
      const payload = toRecord(yOp[opName]);
      const path = firstString(payload.path, payload.to, payload.from) ?? 'prd';
      const normalizedPath = normalizePath(path);
      changeIndex += 1;
      const title = humanizeKey(normalizedPath.split('/').filter(Boolean).at(-1) || opName);
      changes.push({
        evidenceId: sourceEvidence?.id ?? null,
        id: `${entry.id}:${String(changeIndex)}`,
        kind: opName.toUpperCase(),
        path: normalizedPath,
        summary: summarizeYOp(opName, payload, title),
        title,
      });
      if (sourceEvidence && !sourceEvidence.fieldPaths.includes(normalizedPath)) {
        sourceEvidence.fieldPaths.push(normalizedPath);
      }
    });
  });

  return { changes, evidence };
}

function summarizeYOp(opName: string, payload: Record<string, unknown>, title: string): string {
  if (opName === 'set' && !isEmptyScalar(payload.value)) {
    return `Set ${title} to ${shortValue(payload.value)}.`;
  }
  if (opName === 'populate') {
    const fieldCount = Object.keys(toRecord(payload.values)).length;
    return `Populated ${title} with ${String(fieldCount)} field${fieldCount === 1 ? '' : 's'}.`;
  }
  if (opName === 'append') return `Appended a materialized value to ${title}.`;
  return `${humanizeKey(opName)} operation materialized ${title}.`;
}

function shortValue(value: unknown): string {
  const text = scalarToString(value);
  if (!text) return 'the proposed value';
  return text.length > 72 ? `“${text.slice(0, 69)}…”` : `“${text}”`;
}

function appendRows(
  rows: StatePointRow[],
  key: string,
  value: unknown,
  path: string,
  depth: number,
  gapPaths: Set<string>,
  operationIndex: Map<string, OperationMark>
) {
  const normalizedPath = normalizePath(path);
  const expandable = isExpandable(value);
  const issueCount = countDescendants(gapPaths, normalizedPath, true);
  const operation = operationIndex.get(normalizedPath);
  const childOperationCount = countDescendants(operationIndex, normalizedPath, false);
  const exactIssue = gapPaths.has(normalizedPath);
  const status = deriveStatus({
    childOperationCount,
    exactIssue,
    expandable,
    operation,
  });
  rows.push({
    depth,
    expandable,
    id: normalizedPath,
    issueCount,
    key,
    path: normalizedPath,
    sourceOp: operation?.label ?? '-',
    status,
    statusLabel: deriveStatusLabel({
      childOperationCount,
      exactIssue,
      operation,
      status,
    }),
    type: valueType(value),
    value: valueSummary(value),
  });

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendRows(
        rows,
        String(index),
        item,
        normalizedPath + '/' + String(index),
        depth + 1,
        gapPaths,
        operationIndex
      );
    });
    return;
  }

  const record = toRecordOrNull(value);
  if (!record) return;

  for (const [childKey, childValue] of Object.entries(record)) {
    appendRows(
      rows,
      childKey,
      childValue,
      normalizedPath + '/' + childKey,
      depth + 1,
      gapPaths,
      operationIndex
    );
  }
}

function deriveStatus(input: {
  childOperationCount: number;
  exactIssue: boolean;
  expandable: boolean;
  operation: OperationMark | undefined;
}): StatePointStatus {
  if (input.exactIssue) return 'missing';
  if (input.operation) return input.operation.status;
  if (input.expandable && input.childOperationCount > 0) return 'changed';
  return 'unchanged';
}

function deriveStatusLabel(input: {
  childOperationCount: number;
  exactIssue: boolean;
  operation: OperationMark | undefined;
  status: StatePointStatus;
}): string {
  if (input.exactIssue) return 'missing';
  if (input.operation)
    return input.operation.status === 'created' ? 'create' : input.operation.status;
  if (input.status === 'changed' && input.childOperationCount > 0) {
    return String(input.childOperationCount) + ' changes';
  }
  return 'unchanged';
}

export function buildOperationPathIndex(
  operations: StateOperationEntry[]
): Map<string, OperationMark> {
  const marks = new Map<string, OperationMark>();
  let opIndex = 0;

  for (const entry of operations) {
    for (const yOp of normalizeYOps(entry.yops)) {
      const opName = yOpName(yOp);
      if (!opName) continue;
      opIndex += 1;
      const label = paddedOperationIndex(opIndex) + ' ' + opName.toUpperCase();
      for (const mark of operationMarks(yOp, opName, label)) {
        if (!marks.has(mark.path)) marks.set(mark.path, mark);
      }
    }
  }

  return marks;
}

function operationMarks(
  yOp: Record<string, unknown>,
  opName: string,
  label: string
): Array<OperationMark & { path: string }> {
  const payload = toRecord(yOp[opName]);
  const status = statusForOperation(opName);
  const paths: string[] = [];

  const path = firstString(payload.path, payload.to, payload.from);
  if (path) paths.push(normalizePath(path));

  if (opName === 'rename' && typeof payload.to === 'string') paths.push(normalizePath(payload.to));
  if ((opName === 'move' || opName === 'clone') && typeof payload.to === 'string') {
    paths.push(normalizePath(payload.to));
  }

  if (opName === 'populate' && typeof payload.path === 'string') {
    const basePath = normalizePath(payload.path);
    const values = toRecord(payload.values);
    for (const key of Object.keys(values)) {
      paths.push(basePath + '/' + key);
    }
  }

  return Array.from(new Set(paths.filter(Boolean))).map((pathValue) => ({
    label,
    path: pathValue,
    status,
  }));
}

function statusForOperation(opName: string): StatePointStatus {
  if (opName === 'set') return 'set';
  if (opName === 'append' || opName === 'define' || opName === 'populate') return 'created';
  return 'changed';
}

function normalizeYOps(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeYOps(item));
  const record = toRecordOrNull(value);
  if (!record) return [];
  if (Array.isArray(record.yops)) return normalizeYOps(record.yops);
  if (yOpName(record)) return [record];
  return [];
}

export function countStateYOps(operations: StateOperationEntry[]): number {
  return operations.reduce((count, entry) => count + normalizeYOps(entry.yops).length, 0);
}

function yOpName(yOp: Record<string, unknown>): string | null {
  const names = [
    'define',
    'drop',
    'rename',
    'set',
    'unset',
    'populate',
    'append',
    'move',
    'clone',
    'nest',
    'split',
    'fold',
    'merge',
    'sort',
    'unique',
    'pick',
    'omit',
    'assert',
    'relate',
    'unrelate',
  ];
  return names.find((name) => Object.hasOwn(yOp, name)) ?? null;
}

function workspaceDraftOperationToYOp(
  operation: StateWorkspaceDraftOperationLike
): Record<string, unknown> | null {
  const opName = typeof operation.op === 'string' ? operation.op.trim().toLowerCase() : '';
  const path = typeof operation.path === 'string' ? operation.path.trim() : '';
  if (!opName || !path) return null;

  if (opName === 'set') return { set: { path, value: operation.afterValue ?? '' } };
  if (opName === 'add' || opName === 'append') {
    return { append: { path: path.replace(/(?:\/|\.)-$/, ''), value: operation.afterValue ?? '' } };
  }
  if (opName === 'populate' && isPlainRecord(operation.afterValue)) {
    return { populate: { path, values: operation.afterValue } };
  }
  if (opName === 'create' || opName === 'define') return { define: { path } };
  if (opName === 'delete' || opName === 'drop') return { drop: { path } };
  if (opName === 'unset') return { unset: { path } };
  return null;
}

function buildGapPathSet(gaps: StateValidationGapLike[], rootKeys: string[]): Set<string> {
  const paths = new Set<string>();
  for (const gap of gaps) {
    const raw = typeof gap.path === 'string' ? gap.path.trim() : '';
    if (!raw) continue;
    const normalized = normalizePath(raw);
    paths.add(normalized);
    for (const rootKey of rootKeys) {
      const root = normalizePath(rootKey);
      if (normalized !== root && !normalized.startsWith(root + '/')) {
        paths.add(root + '/' + normalized);
      }
    }
  }
  return paths;
}

function countDescendants(
  collection: Set<string> | Map<string, unknown>,
  path: string,
  includeExact: boolean
): number {
  let count = 0;
  for (const key of collection.keys()) {
    if (key === path) {
      if (includeExact) count += 1;
      continue;
    }
    if (key.startsWith(path + '/')) count += 1;
  }
  return count;
}

function requirementsToRenderModel(value: unknown): PrdRenderRequirement[] {
  if (Array.isArray(value)) return value.flatMap((item) => requirementToRenderModel(item));
  const record = toRecordOrNull(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, item]) => requirementToRenderModel(item, key));
}

function requirementToRenderModel(value: unknown, fallbackTitle = ''): PrdRenderRequirement[] {
  const record = toRecordOrNull(value);
  if (!record) return [];
  return [
    {
      acceptance: valueToStringList(record.acceptance).join('\n'),
      description: firstScalar(record.description, record.summary, record.detail) || '',
      key: fallbackTitle,
      owner: scalarToString(record.owner),
      priority: scalarToString(record.priority),
      title: scalarToString(record.title) || fallbackTitle,
    },
  ];
}

function valueToStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(scalarToString).filter(Boolean);
  const record = toRecordOrNull(value);
  if (record) {
    return Object.entries(record)
      .sort(([left], [right]) => {
        if (/^\d+$/.test(left) && /^\d+$/.test(right)) return Number(left) - Number(right);
        return left.localeCompare(right);
      })
      .map(([, item]) => scalarToString(item))
      .filter(Boolean);
  }
  const scalar = scalarToString(value);
  return scalar ? [scalar] : [];
}

function valueType(value: unknown): string {
  if (Array.isArray(value) || isArrayLikeRecord(value)) return 'array';
  if (value === null) return 'null';
  return typeof value === 'object' ? 'object' : typeof value;
}

function valueSummary(value: unknown): string {
  if (Array.isArray(value)) return itemCount(value.length);
  if (isArrayLikeRecord(value)) return itemCount(Object.keys(toRecord(value)).length);
  if (value && typeof value === 'object') return '-';
  if (isEmptyScalar(value)) return 'empty';
  return String(value);
}

function itemCount(count: number): string {
  return String(count) + ' item' + (count === 1 ? '' : 's');
}

function isExpandable(value: unknown): boolean {
  return Array.isArray(value) || (value !== null && typeof value === 'object');
}

function isArrayLikeRecord(value: unknown): boolean {
  const record = toRecordOrNull(value);
  if (!record) return false;
  const keys = Object.keys(record);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

function isEmptyScalar(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function scalarToString(value: unknown): string {
  if (isEmptyScalar(value)) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function firstScalar(...values: unknown[]): string | null {
  for (const value of values) {
    const scalar = scalarToString(value);
    if (scalar) return scalar;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const scalar = scalarToString(item);
      return scalar ? [scalar] : [];
    });
  }

  const record = toRecordOrNull(value);
  if (!record) return [];
  return Object.entries(record)
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([, item]) => {
      const scalar = scalarToString(item);
      return scalar ? [scalar] : [];
    });
}

function repeatedRecordEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const record = toRecordOrNull(item);
      return record ? [[String(index), record] as [string, Record<string, unknown>]] : [];
    });
  }

  const record = toRecordOrNull(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, item]) => {
    const repeatedItem = toRecordOrNull(item);
    return repeatedItem ? [[key, repeatedItem] as [string, Record<string, unknown>]] : [];
  });
}

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizePath(path: string): string {
  return path
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\\/g, '/')
    .replace(/\./g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function paddedOperationIndex(index: number): string {
  return String(index).padStart(2, '0');
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return toRecordOrNull(value) ?? {};
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
