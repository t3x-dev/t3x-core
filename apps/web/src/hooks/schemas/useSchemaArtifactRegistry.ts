'use client';

import { useEffect, useState } from 'react';
import { loadYSchemaArtifactRegistry } from '@/infrastructure/schemaComposition';
import type { SchemaArtifactPreview } from '@/types/schemaModules';

export function useSchemaArtifactRegistry(projectId?: string, enabled = true) {
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
    void loadYSchemaArtifactRegistry(projectId)
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
  }, [enabled, projectId]);

  return { artifacts, error, pending };
}

function artifactToPreview(manifest: Record<string, unknown>): SchemaArtifactPreview {
  const module = manifest.apiVersion === 't3x.dev/yschema-module/v1';
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
    version: String(manifest.version ?? ''),
    kind: module ? 'module' : 'core',
    title: String(manifest.title ?? manifest.canonicalName ?? 'YSchema Artifact'),
    description: String(manifest.description ?? ''),
    domain: module ? String(manifest.domain ?? 'General') : 'Core',
    source: source === 'team' || source === 'community' ? source : 'official',
    status:
      manifest.status === 'draft' || manifest.status === 'deprecated' ? manifest.status : 'active',
    provides: stringArray(manifest.provides),
    requires: module ? stringArray(manifest.requires) : [],
    placement: module
      ? String(recordValue(manifest.defaultPlacement).slot ?? 'technical-design')
      : 'core',
    nodePaths: Object.keys(nodes),
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
    icon: isIcon(icon) ? icon : module ? 'blocks' : 'file',
  };
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

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function isIcon(value: unknown): value is SchemaArtifactPreview['icon'] {
  return ['blocks', 'braces', 'cpu', 'database', 'file', 'monitor', 'server'].includes(
    String(value)
  );
}
