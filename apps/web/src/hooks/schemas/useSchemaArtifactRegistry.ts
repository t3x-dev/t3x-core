'use client';

import { useEffect, useState } from 'react';
import { loadYSchemaArtifactRegistry } from '@/infrastructure/schemaComposition';
import type { SchemaArtifactPreview, YSchemaArtifactFamily } from '@/types/schemaModules';

export function useSchemaArtifactRegistry(
  projectId?: string,
  family?: YSchemaArtifactFamily,
  enabled = true
) {
  const [artifacts, setArtifacts] = useState<SchemaArtifactPreview[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setPending(false);
      return;
    }
    let active = true;
    setPending(true);
    setError(undefined);
    void loadYSchemaArtifactRegistry(projectId, family)
      .then((page) => {
        if (active) setArtifacts(page.items.map(artifactToPreview));
      })
      .catch((cause) => {
        if (active) {
          setArtifacts([]);
          setError(cause instanceof Error ? cause.message : 'YSchema Registry failed to load.');
        }
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, family, projectId]);

  return { artifacts, error, pending };
}

function artifactToPreview(manifest: Record<string, unknown>): SchemaArtifactPreview {
  const module =
    manifest.apiVersion === 't3x.dev/yschema-module/v1' ||
    manifest.apiVersion === 't3x.dev/yschema-module/v2';
  const openModule = manifest.apiVersion === 't3x.dev/yschema-module/v2';
  const contribution = recordValue(manifest.contribution);
  const schema = recordValue(manifest.schema);
  const nodes = recordValue(module ? contribution.nodes : schema.nodes);
  const registry = recordValue(manifest.registry);
  const rawRules = module ? contribution.rules : schema.rules;
  const declaredRules = Array.isArray(rawRules)
    ? rawRules.flatMap((rule) => {
        const record = recordValue(rule);
        return typeof record.id === 'string'
          ? [
              {
                id: record.id,
                description:
                  typeof record.description === 'string' ? record.description : record.id,
                blocking: record.blocking !== false,
              },
            ]
          : [];
      })
    : [];
  const source = manifest.source;
  const icon = registry.icon;
  const canonicalName = String(manifest.canonicalName ?? '');
  const declaredTags = stringArray(manifest.tags);
  const family = schemaFamily(manifest.family ?? tagValue(declaredTags, 'type'));
  const render = recordValue(manifest.render);
  const rules = module
    ? mergeRules(declaredRules, [
        {
          id: `${canonicalName.split('/').at(-1)}.dependencies`,
          description: `Requires ${stringArray(manifest.requires).join(', ') || 'no additional capabilities'}.`,
          blocking: true,
        },
        {
          id: `${canonicalName.split('/').at(-1)}.path_ownership`,
          description: `Owns ${Object.keys(nodes).join(', ') || 'no additional paths'} without replacing Core paths.`,
          blocking: true,
        },
      ])
    : declaredRules;
  const manifestVersions = Array.isArray(manifest.versions)
    ? manifest.versions.flatMap((value) => {
        const version = recordValue(value);
        return typeof version.version === 'string'
          ? [
              {
                version: version.version,
                status:
                  version.version === manifest.version && version.status === 'active'
                    ? 'current'
                    : String(version.status ?? 'historical'),
                updatedAt: String(version.updatedAt ?? ''),
              },
            ]
          : [];
      })
    : [];
  return {
    canonicalName,
    family,
    version: String(manifest.version ?? ''),
    kind: module ? 'module' : 'core',
    title: String(manifest.title ?? manifest.canonicalName ?? 'YSchema Artifact'),
    description: String(manifest.description ?? ''),
    domain: module ? String(manifest.domain ?? 'General') : 'Core',
    source: source === 'team' || source === 'community' ? source : 'official',
    status:
      manifest.status === 'draft' || manifest.status === 'deprecated' ? manifest.status : 'active',
    provides: capabilityArray(manifest.provides),
    requires: module
      ? openModule
        ? requiredImports(manifest.imports)
        : stringArray(manifest.requires)
      : [],
    placement: module
      ? String(recordValue(manifest.defaultPlacement).slot ?? 'technical-design')
      : 'core',
    nodePaths: Object.keys(nodes),
    renderers:
      stringArray(render.availableRenderers).length > 0
        ? stringArray(render.availableRenderers)
        : defaultRenderers(family),
    rules,
    versions:
      manifestVersions.length > 0
        ? manifestVersions
        : [
            {
              version: String(manifest.version ?? ''),
              status: String(manifest.status ?? 'active'),
              updatedAt: String(registry.updatedAt ?? ''),
            },
          ],
    updatedAt: String(registry.updatedAt ?? ''),
    usageCount: numberValue(registry.usageCount),
    starCount: numberValue(registry.starCount),
    sortOrder: numberValue(registry.sortOrder) || recommendedSortOrder(canonicalName),
    icon: isIcon(icon) ? icon : module ? 'blocks' : 'file',
    recommended: registry.recommended === true,
    tags: effectiveTags(manifest, module, family, String(manifest.domain ?? 'General')),
  };
}

function effectiveTags(
  manifest: Record<string, unknown>,
  module: boolean,
  family: YSchemaArtifactFamily,
  domain: string
): string[] {
  const declared = stringArray(manifest.tags);
  const derived = [
    ...(module ? [] : ['role:core']),
    `type:${family}`,
    `domain:${domain.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    `version:${String(manifest.version ?? '')}`,
    `source:${manifest.source === 'team' || manifest.source === 'community' ? manifest.source : 'official'}`,
    `status:${manifest.status === 'draft' || manifest.status === 'deprecated' ? manifest.status : 'active'}`,
    module ? 'contribution:structure' : 'contribution:foundation',
  ];
  return Array.from(new Set([...declared, ...derived])).sort();
}

function schemaFamily(value: unknown): YSchemaArtifactFamily {
  return value === 'skill' || value === 'prompt' || value === 'esphome-device' ? value : 'prd';
}

function defaultRenderers(family: YSchemaArtifactFamily): string[] {
  if (family === 'skill') return ['skill-package', 'markdown', 'yaml'];
  if (family === 'prompt') return ['prompt-text', 'markdown', 'yaml'];
  if (family === 'esphome-device') return ['esphome-yaml', 'markdown'];
  return ['markdown', 'yaml'];
}

const RECOMMENDED_MODULE_ORDER: Record<string, number> = {
  't3x/prd-system-architecture': 10,
  't3x/prd-technology-stack': 20,
  't3x/prd-frontend-design': 30,
  't3x/prd-backend-design': 40,
  't3x/prd-database-design': 50,
  't3x/prd-api-contract': 60,
  't3x/prd-security-privacy': 70,
  't3x/prd-quality-strategy': 80,
  't3x/prd-rollout-operations': 90,
  't3x/skill-tool-policy': 10,
  't3x/skill-safety-gates': 20,
  't3x/skill-delivery-targets': 30,
  't3x/skill-runtime-environment': 40,
  't3x/skill-evaluation-suite': 50,
  't3x/prompt-few-shot-examples': 10,
  't3x/prompt-guardrails': 20,
  't3x/prompt-observability': 30,
  't3x/prompt-context-policy': 40,
  't3x/prompt-evaluation-suite': 50,
  't3x/esphome-sensors': 10,
  't3x/esphome-actuators': 20,
  't3x/esphome-automations': 30,
  't3x/esphome-hardware-buses': 40,
  't3x/esphome-network-services': 50,
  't3x/esphome-power-management': 60,
};

function recommendedSortOrder(canonicalName: string): number {
  return RECOMMENDED_MODULE_ORDER[canonicalName] ?? 1000;
}

function mergeRules(
  declared: SchemaArtifactPreview['rules'],
  derived: SchemaArtifactPreview['rules']
): SchemaArtifactPreview['rules'] {
  const ids = new Set(declared.map((rule) => rule.id));
  return [...declared, ...derived.filter((rule) => !ids.has(rule.id))];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function capabilityArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item === 'string') return [item];
        const capability = recordValue(item).capability;
        return typeof capability === 'string' ? [capability] : [];
      })
    : [];
}

function requiredImports(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = recordValue(item);
        return record.required === true && typeof record.capability === 'string'
          ? [record.capability]
          : [];
      })
    : [];
}

function tagValue(tags: string[], namespace: string): string | undefined {
  const prefix = `${namespace}:`;
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function isIcon(value: unknown): value is SchemaArtifactPreview['icon'] {
  return ['blocks', 'braces', 'cpu', 'database', 'file', 'monitor', 'server'].includes(
    String(value)
  );
}
