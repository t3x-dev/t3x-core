import { normalizeYSchemaObject } from '../p0/normalize';
import type { NodeSchema, YSchema } from '../p0/types';
import { sha256CompositionValue } from './canonical';
import type {
  CompiledYSchemaComposition,
  CompileYSchemaCompositionInput,
  YSchemaCompositionIssue,
  YSchemaCompositionPathOrigin,
  YSchemaCompositionRenderEntry,
  YSchemaModuleManifest,
} from './types';

function moduleKey(module: Pick<YSchemaModuleManifest, 'canonicalName' | 'version'>): string {
  return `${module.canonicalName}@${module.version}`;
}

function recordNodeOrigins(
  nodes: Record<string, NodeSchema>,
  origin: YSchemaCompositionPathOrigin,
  target: Record<string, YSchemaCompositionPathOrigin>,
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

function detectCapabilityCycles(modules: YSchemaModuleManifest[]): string[][] {
  const providerByCapability = new Map<string, string[]>();
  for (const module of modules) {
    for (const capability of module.provides) {
      const providers = providerByCapability.get(capability) ?? [];
      providers.push(moduleKey(module));
      providerByCapability.set(capability, providers);
    }
  }

  const edges = new Map<string, Set<string>>();
  for (const module of modules) {
    const consumer = moduleKey(module);
    const providers = new Set<string>();
    for (const requirement of module.requires) {
      for (const provider of providerByCapability.get(requirement) ?? []) {
        if (provider !== consumer) providers.add(provider);
      }
    }
    edges.set(consumer, providers);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (key: string): void => {
    if (visiting.has(key)) {
      const start = stack.indexOf(key);
      cycles.push([...stack.slice(start), key]);
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    stack.push(key);
    for (const dependency of edges.get(key) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(key);
    visited.add(key);
  };

  for (const key of edges.keys()) visit(key);
  return cycles;
}

export async function compileYSchemaComposition(
  input: CompileYSchemaCompositionInput
): Promise<CompiledYSchemaComposition> {
  const { composition, core } = input;
  const issues: YSchemaCompositionIssue[] = [];
  const originsByPath: Record<string, YSchemaCompositionPathOrigin> = {};
  const renderPlan: YSchemaCompositionRenderEntry[] = [];
  const availableModules = new Map(input.modules.map((module) => [moduleKey(module), module]));
  const selected: Array<{
    manifest: YSchemaModuleManifest;
    order: number;
    slot: string;
  }> = [];

  if (
    composition.core.canonicalName !== core.canonicalName ||
    composition.core.version !== core.version ||
    composition.family !== core.family
  ) {
    issues.push({
      code: 'CORE_INCOMPATIBLE',
      blocking: true,
      message: `Composition core ${composition.core.canonicalName}@${composition.core.version} does not match ${core.canonicalName}@${core.version}.`,
    });
  }

  const seenOrders = new Set<number>();
  const seenModules = new Set<string>();
  for (const reference of composition.modules) {
    const key = moduleKey(reference);
    if (!Number.isInteger(reference.order) || reference.order < 1) {
      issues.push({
        code: 'INVALID_ORDER',
        blocking: true,
        module: key,
        message: `Module ${key} must use a positive integer order.`,
      });
    }
    if (seenOrders.has(reference.order)) {
      issues.push({
        code: 'DUPLICATE_ORDER',
        blocking: true,
        module: key,
        message: `Order ${reference.order} is assigned more than once.`,
      });
    }
    seenOrders.add(reference.order);
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

    const manifest = availableModules.get(key);
    if (!manifest) {
      issues.push({
        code: 'MODULE_NOT_FOUND',
        blocking: true,
        module: key,
        message: `Module ${key} is not available.`,
      });
      continue;
    }
    if (
      manifest.family !== composition.family ||
      manifest.compatibility.core !== core.canonicalName ||
      !manifest.compatibility.versions.includes(core.version)
    ) {
      issues.push({
        code: 'CORE_INCOMPATIBLE',
        blocking: true,
        module: key,
        message: `Module ${key} is not compatible with ${core.canonicalName}@${core.version}.`,
      });
    }

    const slot = reference.slot ?? manifest.defaultPlacement.slot;
    if (!core.extensionSlots.includes(slot)) {
      issues.push({
        code: 'SLOT_NOT_FOUND',
        blocking: true,
        module: key,
        message: `Extension slot ${slot} is not declared by ${core.canonicalName}.`,
      });
    }
    selected.push({ manifest, order: reference.order, slot });
  }
  selected.sort(
    (left, right) =>
      left.order - right.order || moduleKey(left.manifest).localeCompare(moduleKey(right.manifest))
  );

  const capabilityOrder = new Map<string, number>();
  for (const capability of core.provides) capabilityOrder.set(capability, 0);
  for (const item of selected) {
    for (const requirement of item.manifest.requires) {
      const providerOrder = capabilityOrder.get(requirement);
      if (providerOrder === undefined) {
        const laterProvider = selected.find(
          (candidate) =>
            candidate.order > item.order && candidate.manifest.provides.includes(requirement)
        );
        issues.push({
          code: laterProvider ? 'PROVIDER_AFTER_CONSUMER' : 'MISSING_CAPABILITY',
          blocking: true,
          module: moduleKey(item.manifest),
          message: laterProvider
            ? `${moduleKey(item.manifest)} requires ${requirement}, but its provider appears later.`
            : `${moduleKey(item.manifest)} requires unavailable capability ${requirement}.`,
          details: laterProvider ? { provider: moduleKey(laterProvider.manifest) } : undefined,
        });
      }
    }
    for (const capability of item.manifest.provides) {
      if (!capabilityOrder.has(capability)) capabilityOrder.set(capability, item.order);
    }
  }

  for (const cycle of detectCapabilityCycles(selected.map((item) => item.manifest))) {
    issues.push({
      code: 'DEPENDENCY_CYCLE',
      blocking: true,
      message: `Module capability dependency cycle: ${cycle.join(' -> ')}.`,
      details: { cycle },
    });
  }

  const rawSchema: YSchema = {
    ...core.schema,
    nodes: { ...core.schema.nodes },
    relationTypes: { ...core.schema.relationTypes },
    rules: [...(core.schema.rules ?? [])],
  };
  const coreOrigin: YSchemaCompositionPathOrigin = {
    artifact: core.canonicalName,
    version: core.version,
    kind: 'core',
  };
  recordNodeOrigins(core.schema.nodes, coreOrigin, originsByPath);
  renderPlan.push({
    artifact: core.canonicalName,
    version: core.version,
    order: 0,
    slot: 'core',
    nodePaths: Object.keys(core.schema.nodes),
  });

  const ruleIds = new Set((rawSchema.rules ?? []).map((rule) => rule.id));
  for (const item of selected) {
    const key = moduleKey(item.manifest);
    const origin: YSchemaCompositionPathOrigin = {
      artifact: item.manifest.canonicalName,
      version: item.manifest.version,
      kind: 'module',
    };
    const acceptedNodePaths: string[] = [];
    for (const [path, node] of Object.entries(item.manifest.contribution.nodes ?? {})) {
      if (rawSchema.nodes[path]) {
        issues.push({
          code: 'PATH_OWNERSHIP_CONFLICT',
          blocking: true,
          module: key,
          path,
          message: `${path} is already owned by ${originsByPath[path]?.artifact ?? core.canonicalName}.`,
        });
        continue;
      }
      rawSchema.nodes[path] = node;
      acceptedNodePaths.push(path);
      recordNodeOrigins({ [path]: node }, origin, originsByPath);
    }
    for (const [type, relation] of Object.entries(item.manifest.contribution.relationTypes ?? {})) {
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
    }
    for (const rule of item.manifest.contribution.rules ?? []) {
      if (ruleIds.has(rule.id)) {
        issues.push({
          code: 'RULE_ID_CONFLICT',
          blocking: true,
          module: key,
          path: `rules/${rule.id}`,
          message: `Rule ${rule.id} is already declared.`,
        });
        continue;
      }
      ruleIds.add(rule.id);
      rawSchema.rules?.push(rule);
    }
    renderPlan.push({
      artifact: item.manifest.canonicalName,
      version: item.manifest.version,
      order: item.order,
      slot: item.slot,
      nodePaths: acceptedNodePaths,
    });
  }

  let schema: YSchema;
  try {
    schema = normalizeYSchemaObject(rawSchema);
  } catch (error) {
    issues.push({
      code: 'INVALID_COMPILED_SCHEMA',
      blocking: true,
      message: error instanceof Error ? error.message : 'Compiled schema is invalid.',
    });
    schema = rawSchema;
  }

  const [compiledSchemaHash, compositionHash] = await Promise.all([
    sha256CompositionValue(schema),
    sha256CompositionValue(composition),
  ]);
  return {
    schema,
    renderPlan,
    originsByPath,
    report: { valid: !issues.some((issue) => issue.blocking), issues },
    compiledSchemaHash,
    compositionHash,
  };
}
