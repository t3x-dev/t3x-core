import { sha256CompositionValue } from '../composition/canonical';
import { normalizeYSchemaObject } from '../p0/normalize';
import type { NodeSchema, YSchema } from '../p0/types';
import type {
  CompiledYSchemaCompositionV2,
  CompileYSchemaCompositionV2Input,
  YSchemaCompositionIssueV2,
  YSchemaCompositionOriginV2,
  YSchemaCompositionPolicyV2,
  YSchemaModuleArtifactV2,
} from './types';

function moduleKey(module: Pick<YSchemaModuleArtifactV2, 'canonicalName' | 'version'>): string {
  return `${module.canonicalName}@${module.version}`;
}

function capabilityKey(capability: string, version: number): string {
  return `${capability}@${version}`;
}

function recordNodeOrigins(
  nodes: Record<string, NodeSchema>,
  origin: YSchemaCompositionOriginV2,
  target: Record<string, YSchemaCompositionOriginV2>,
  prefix = ''
): void {
  for (const [key, node] of Object.entries(nodes)) {
    const path = prefix ? `${prefix}/${key}` : key;
    target[path] = origin;
    for (const slot of Object.keys(node.slots ?? {})) target[`${path}/${slot}`] = origin;
    if (node.children && node.children !== 'any') {
      recordNodeOrigins(node.children, origin, target, path);
    }
  }
}

function matchesNamespace(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('.*') ? value.startsWith(pattern.slice(0, -1)) : value === pattern
  );
}

function collectPolicyIssues(
  policies: Array<{ module: YSchemaModuleArtifactV2; policy: YSchemaCompositionPolicyV2 }>,
  selected: YSchemaModuleArtifactV2[],
  capabilities: Set<string>,
  ruleIds: Set<string>
): YSchemaCompositionIssueV2[] {
  const issues: YSchemaCompositionIssueV2[] = [];
  const required = new Map<string, string[]>();
  const forbidden = new Map<string, string[]>();
  for (const { module, policy } of policies) {
    for (const capability of policy.requireCapabilities ?? []) {
      required.set(capability, [...(required.get(capability) ?? []), policy.id]);
      if (![...capabilities].some((item) => item.startsWith(`${capability}@`))) {
        issues.push({
          code: 'POLICY_REQUIRED_CAPABILITY_MISSING',
          blocking: true,
          module: moduleKey(module),
          policy: policy.id,
          capability,
          message: `Policy ${policy.id} requires unavailable capability ${capability}.`,
        });
      }
    }
    for (const capability of policy.forbidCapabilities ?? []) {
      forbidden.set(capability, [...(forbidden.get(capability) ?? []), policy.id]);
      if ([...capabilities].some((item) => item.startsWith(`${capability}@`))) {
        issues.push({
          code: 'POLICY_FORBIDDEN_CAPABILITY',
          blocking: true,
          module: moduleKey(module),
          policy: policy.id,
          capability,
          message: `Policy ${policy.id} forbids capability ${capability}.`,
        });
      }
    }
    for (const requiredRule of policy.requiredRuleIds ?? []) {
      if (!ruleIds.has(requiredRule)) {
        issues.push({
          code: 'POLICY_RULE_MISSING',
          blocking: true,
          module: moduleKey(module),
          policy: policy.id,
          path: `rules/${requiredRule}`,
          message: `Policy ${policy.id} requires rule ${requiredRule}.`,
        });
      }
    }
    for (const candidate of selected) {
      if (candidate === module) continue;
      if (policy.allowedSources && !policy.allowedSources.includes(candidate.source)) {
        issues.push({
          code: 'POLICY_SOURCE_NOT_ALLOWED',
          blocking: true,
          module: moduleKey(candidate),
          policy: policy.id,
          message: `Policy ${policy.id} does not allow ${candidate.source} Modules.`,
        });
      }
      if (
        policy.allowedNamespaces &&
        !matchesNamespace(candidate.canonicalName, policy.allowedNamespaces)
      ) {
        issues.push({
          code: 'POLICY_NAMESPACE_NOT_ALLOWED',
          blocking: true,
          module: moduleKey(candidate),
          policy: policy.id,
          message: `Policy ${policy.id} does not allow namespace ${candidate.canonicalName}.`,
        });
      }
      if (policy.forbidDeprecatedArtifacts && candidate.status === 'deprecated') {
        issues.push({
          code: 'POLICY_DEPRECATED_ARTIFACT',
          blocking: true,
          module: moduleKey(candidate),
          policy: policy.id,
          message: `Policy ${policy.id} forbids deprecated Modules.`,
        });
      }
    }
  }
  for (const [capability, requiringPolicies] of required) {
    const forbiddingPolicies = forbidden.get(capability);
    if (!forbiddingPolicies) continue;
    issues.push({
      code: 'POLICY_CONTRADICTION',
      blocking: true,
      capability,
      message: `Capability ${capability} is both required and forbidden by the selected policies.`,
      details: { requiringPolicies, forbiddingPolicies },
    });
  }
  return issues;
}

export async function compileYSchemaCompositionV2(
  input: CompileYSchemaCompositionV2Input
): Promise<CompiledYSchemaCompositionV2> {
  const issues: YSchemaCompositionIssueV2[] = [];
  const available = new Map(input.modules.map((module) => [moduleKey(module), module]));
  const selected: Array<{ module: YSchemaModuleArtifactV2; presentationOrder: number }> = [];
  const seenModules = new Set<string>();
  const seenOrders = new Set<number>();

  for (const reference of input.composition.modules) {
    const key = moduleKey(reference);
    if (seenModules.has(key)) {
      issues.push({
        code: 'DUPLICATE_MODULE',
        blocking: true,
        module: key,
        message: `Module ${key} is selected more than once.`,
      });
      continue;
    }
    seenModules.add(key);
    if (!Number.isInteger(reference.presentationOrder) || reference.presentationOrder < 0) {
      issues.push({
        code: 'INVALID_PRESENTATION_ORDER',
        blocking: true,
        module: key,
        message: `Module ${key} must use a non-negative integer presentation order.`,
      });
    }
    if (seenOrders.has(reference.presentationOrder)) {
      issues.push({
        code: 'DUPLICATE_PRESENTATION_ORDER',
        blocking: true,
        module: key,
        message: `Presentation order ${reference.presentationOrder} is assigned more than once.`,
      });
    }
    seenOrders.add(reference.presentationOrder);
    const module = available.get(key);
    if (!module) {
      issues.push({
        code: 'MODULE_NOT_FOUND',
        blocking: true,
        module: key,
        message: `Module ${key} is not available.`,
      });
      continue;
    }
    if (!module.compatibility.yschema.includes('0.1')) {
      issues.push({
        code: 'UNSUPPORTED_YSCHEMA_VERSION',
        blocking: true,
        module: key,
        message: `Module ${key} does not support YSchema 0.1.`,
      });
    }
    if (reference.hash) {
      const actualHash = await sha256CompositionValue(module);
      if (reference.hash !== actualHash) {
        issues.push({
          code: 'ARTIFACT_HASH_MISMATCH',
          blocking: true,
          module: key,
          message: `Module ${key} does not match its pinned Artifact hash.`,
          details: { expected: reference.hash, actual: actualHash },
        });
      }
    }
    selected.push({ module, presentationOrder: reference.presentationOrder });
  }

  const semanticOrder = selected
    .map((item) => item.module)
    .sort((left, right) => moduleKey(left).localeCompare(moduleKey(right)));
  const providerOrigins: Record<string, YSchemaCompositionOriginV2[]> = {};
  const capabilities = new Set<string>();
  for (const module of semanticOrder) {
    const origin = {
      artifact: module.canonicalName,
      version: module.version,
      kind: 'module' as const,
    };
    for (const provided of module.provides) {
      const key = capabilityKey(provided.capability, provided.version);
      capabilities.add(key);
      providerOrigins[key] = [...(providerOrigins[key] ?? []), origin];
    }
  }
  for (const module of semanticOrder) {
    for (const imported of module.imports) {
      const providers = providerOrigins[capabilityKey(imported.capability, imported.version)] ?? [];
      if (
        imported.mode === 'required' &&
        (providers.length === 0 ||
          (imported.provider &&
            !providers.some((provider) => provider.artifact === imported.provider)))
      ) {
        issues.push({
          code: 'REQUIRED_IMPORT_MISSING',
          blocking: true,
          module: moduleKey(module),
          capability: imported.capability,
          message: `Module ${moduleKey(module)} requires ${capabilityKey(imported.capability, imported.version)}${imported.provider ? ` from ${imported.provider}` : ''}.`,
        });
      }
    }
  }

  const rawSchema: YSchema = {
    yschema: '0.1',
    name: input.composition.id,
    nodes: {},
    relationTypes: {},
    rules: [],
  };
  const originsByPath: Record<string, YSchemaCompositionOriginV2> = {};
  const originsByRule: Record<string, YSchemaCompositionOriginV2> = {};
  const originsByRelationType: Record<string, YSchemaCompositionOriginV2> = {};
  const policies: Array<{ module: YSchemaModuleArtifactV2; policy: YSchemaCompositionPolicyV2 }> =
    [];

  for (const module of semanticOrder) {
    const key = moduleKey(module);
    const origin = {
      artifact: module.canonicalName,
      version: module.version,
      kind: 'module' as const,
    };
    for (const [path, node] of Object.entries(module.contribution.nodes ?? {})) {
      if (rawSchema.nodes[path]) {
        issues.push({
          code: 'PATH_OWNERSHIP_CONFLICT',
          blocking: true,
          module: key,
          path,
          message: `${path} is already owned by ${originsByPath[path]?.artifact}.`,
        });
        continue;
      }
      rawSchema.nodes[path] = node;
      recordNodeOrigins({ [path]: node }, origin, originsByPath);
    }
    for (const [type, relation] of Object.entries(module.contribution.relationTypes ?? {})) {
      if (rawSchema.relationTypes?.[type]) {
        issues.push({
          code: 'RELATION_TYPE_CONFLICT',
          blocking: true,
          module: key,
          path: `relationTypes/${type}`,
          message: `Relation type ${type} is already declared.`,
        });
        continue;
      }
      rawSchema.relationTypes = { ...rawSchema.relationTypes, [type]: relation };
      originsByRelationType[type] = origin;
    }
    for (const rule of module.contribution.rules ?? []) {
      if (originsByRule[rule.id]) {
        issues.push({
          code: 'RULE_ID_CONFLICT',
          blocking: true,
          module: key,
          path: `rules/${rule.id}`,
          message: `Rule ${rule.id} is already declared.`,
        });
        continue;
      }
      rawSchema.rules?.push(rule);
      originsByRule[rule.id] = origin;
    }
    for (const policy of module.contribution.policies ?? []) policies.push({ module, policy });
  }

  issues.push(
    ...collectPolicyIssues(
      policies,
      semanticOrder,
      capabilities,
      new Set(Object.keys(originsByRule))
    )
  );

  let schema = rawSchema;
  try {
    schema = normalizeYSchemaObject(rawSchema);
  } catch (error) {
    issues.push({
      code: 'INVALID_COMPILED_SCHEMA',
      blocking: true,
      message: error instanceof Error ? error.message : 'Compiled Schema is invalid.',
    });
  }

  const renderPlan = selected
    .sort(
      (left, right) =>
        left.presentationOrder - right.presentationOrder ||
        moduleKey(left.module).localeCompare(moduleKey(right.module))
    )
    .map(({ module, presentationOrder }) => ({
      artifact: module.canonicalName,
      version: module.version,
      order: presentationOrder,
      slot: 'module' as const,
      nodePaths: Object.keys(module.contribution.nodes ?? {}).filter(
        (path) => originsByPath[path]?.artifact === module.canonicalName
      ),
    }));
  const report = {
    valid: !issues.some((issue) => issue.blocking),
    mode: policies.length > 0 ? ('governed' as const) : ('open' as const),
    issues,
  };
  const [compiledSchemaHash, compositionHash, reportHash] = await Promise.all([
    sha256CompositionValue(schema),
    sha256CompositionValue(input.composition),
    sha256CompositionValue(report),
  ]);
  return {
    schema,
    report,
    originsByPath,
    originsByRule,
    originsByRelationType,
    capabilityProviders: providerOrigins,
    renderPlan,
    compiledSchemaHash,
    compositionHash,
    reportHash,
  };
}
