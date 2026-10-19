import { sha256CompositionValue } from '../composition/canonical';
import { normalizeYSchemaObject } from '../p0/normalize';
import type { NodeSchema, YSchema } from '../p0/types';
import type {
  CompiledYSchemaCompositionV2,
  CompileYSchemaCompositionV2Input,
  YSchemaCompositionIssueV2,
  YSchemaCompositionLocalOriginV2,
  YSchemaCompositionOriginV2,
  YSchemaCompositionPolicyV2,
  YSchemaCompositionSourceOriginV2,
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

function originLabel(origin: YSchemaCompositionOriginV2 | undefined): string {
  if (!origin) return 'an unknown source';
  if (origin.kind === 'module') return `${origin.artifact}@${origin.version}`;
  if (origin.kind === 'local') return `local:${origin.contributionId}@${origin.revision}`;
  return origin.sources.map(originLabel).join(' + ');
}

function sourceOrigins(origin: YSchemaCompositionOriginV2): YSchemaCompositionSourceOriginV2[] {
  return origin.kind === 'derived' ? origin.sources : [origin];
}

function originIncludesModule(
  origin: YSchemaCompositionOriginV2 | undefined,
  artifact: string
): boolean {
  return origin
    ? sourceOrigins(origin).some(
        (source) => source.kind === 'module' && source.artifact === artifact
      )
    : false;
}

function derivedOrigin(
  current: YSchemaCompositionOriginV2,
  added: YSchemaCompositionSourceOriginV2
): YSchemaCompositionOriginV2 {
  const unique = new Map<string, YSchemaCompositionSourceOriginV2>();
  for (const source of [...sourceOrigins(current), added]) {
    const key =
      source.kind === 'module'
        ? `module:${source.artifact}@${source.version}`
        : `local:${source.contributionId}@${source.revision}`;
    unique.set(key, source);
  }
  const sources = [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, source]) => source);
  return sources.length === 1 ? sources[0] : { kind: 'derived', sources };
}

const NODE_SCALAR_FIELDS = [
  'required',
  'contentKind',
  'repeated',
  'description',
  'contentGuidance',
] as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeLocalNode(input: {
  path: string;
  base: NodeSchema;
  local: NodeSchema;
  localOrigin: YSchemaCompositionLocalOriginV2;
  originsByPath: Record<string, YSchemaCompositionOriginV2>;
  issues: YSchemaCompositionIssueV2[];
}): NodeSchema {
  const { path, base, local, localOrigin, originsByPath, issues } = input;
  const merged = clone(base);
  let changed = false;
  const conflict = (conflictPath: string) =>
    issues.push({
      code: 'PATH_OWNERSHIP_CONFLICT',
      blocking: true,
      path: conflictPath,
      message: `${conflictPath} is already owned by ${originLabel(originsByPath[conflictPath] ?? originsByPath[path])}.`,
      details: { contributionId: localOrigin.contributionId },
    });

  for (const field of NODE_SCALAR_FIELDS) {
    if (local[field] === undefined) continue;
    if (base[field] !== undefined) {
      conflict(`${path}/${field}`);
      continue;
    }
    Object.assign(merged, { [field]: clone(local[field]) });
    changed = true;
  }

  if (local.slots) {
    const slots = { ...(merged.slots ?? {}) };
    for (const [slot, definition] of Object.entries(local.slots)) {
      const slotPath = `${path}/${slot}`;
      if (base.slots && Object.hasOwn(base.slots, slot)) {
        conflict(slotPath);
        continue;
      }
      slots[slot] = clone(definition);
      originsByPath[slotPath] = localOrigin;
      changed = true;
    }
    merged.slots = slots;
  }

  if (local.requiredSlots) {
    const next = [...new Set([...(base.requiredSlots ?? []), ...local.requiredSlots])].sort();
    if (JSON.stringify(next) !== JSON.stringify(base.requiredSlots ?? [])) changed = true;
    merged.requiredSlots = next;
  }

  if (local.children !== undefined) {
    if (base.children === 'any' || local.children === 'any') {
      if (base.children !== undefined) conflict(`${path}/children`);
      else {
        merged.children = clone(local.children);
        changed = true;
      }
    } else if (base.children === undefined) {
      merged.children = clone(local.children);
      recordNodeOrigins(local.children, localOrigin, originsByPath, path);
      changed = true;
    } else {
      const children = { ...base.children };
      for (const [child, definition] of Object.entries(local.children)) {
        const childPath = `${path}/${child}`;
        if (!base.children[child]) {
          children[child] = clone(definition);
          recordNodeOrigins({ [child]: definition }, localOrigin, originsByPath, path);
          changed = true;
          continue;
        }
        const mergedChild = mergeLocalNode({
          path: childPath,
          base: base.children[child],
          local: definition,
          localOrigin,
          originsByPath,
          issues,
        });
        children[child] = mergedChild;
        if (JSON.stringify(mergedChild) !== JSON.stringify(base.children[child])) {
          changed = true;
        }
      }
      merged.children = children;
    }
  }

  if (changed && originsByPath[path]) {
    originsByPath[path] = derivedOrigin(originsByPath[path], localOrigin);
  }
  return merged;
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
          message: `${path} is already owned by ${originLabel(originsByPath[path])}.`,
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

  const local = input.localContribution;
  if (local) {
    if (
      local.apiVersion !== 't3x.dev/yschema-local-contribution/v2' ||
      !local.id.trim() ||
      !Number.isInteger(local.revision) ||
      local.revision < 0
    ) {
      issues.push({
        code: 'INVALID_LOCAL_CONTRIBUTION',
        blocking: true,
        message:
          'Local Contribution requires its v2 apiVersion, a non-empty id, and a non-negative revision.',
      });
    } else {
      const localOrigin: YSchemaCompositionLocalOriginV2 = {
        kind: 'local',
        contributionId: local.id,
        revision: local.revision,
      };
      for (const [path, node] of Object.entries(local.contribution.nodes ?? {})) {
        if (!rawSchema.nodes[path]) {
          rawSchema.nodes[path] = clone(node);
          recordNodeOrigins({ [path]: node }, localOrigin, originsByPath);
          continue;
        }
        rawSchema.nodes[path] = mergeLocalNode({
          path,
          base: rawSchema.nodes[path],
          local: node,
          localOrigin,
          originsByPath,
          issues,
        });
      }
      for (const [type, relation] of Object.entries(local.contribution.relationTypes ?? {})) {
        if (rawSchema.relationTypes?.[type]) {
          issues.push({
            code: 'RELATION_TYPE_CONFLICT',
            blocking: true,
            path: `relationTypes/${type}`,
            message: `Relation type ${type} is already owned by ${originLabel(originsByRelationType[type])}.`,
            details: { contributionId: local.id },
          });
          continue;
        }
        rawSchema.relationTypes = { ...rawSchema.relationTypes, [type]: clone(relation) };
        originsByRelationType[type] = localOrigin;
      }
      for (const rule of local.contribution.rules ?? []) {
        if (originsByRule[rule.id]) {
          issues.push({
            code: 'RULE_ID_CONFLICT',
            blocking: true,
            path: `rules/${rule.id}`,
            message: `Rule ${rule.id} is already owned by ${originLabel(originsByRule[rule.id])}.`,
            details: { contributionId: local.id },
          });
          continue;
        }
        rawSchema.rules?.push(clone(rule));
        originsByRule[rule.id] = localOrigin;
      }
    }
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
      nodePaths: Object.keys(module.contribution.nodes ?? {}).filter((path) =>
        originIncludesModule(originsByPath[path], module.canonicalName)
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
