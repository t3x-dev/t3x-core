import { dump } from 'js-yaml';
import type { PublishedSchemaVersionManifest } from '@/types/schemaModules';
import type {
  SchemaContractPath,
  SchemaRegistryPreview,
  SchemaRelationTypePreview,
  SchemaReleasePreview,
  SchemaRulePreview,
} from '@/types/schemas';

export function mergePublishedSchemaVersions(
  registry: SchemaRegistryPreview,
  manifests: PublishedSchemaVersionManifest[],
  projectId: string
): SchemaRegistryPreview {
  if (manifests.length === 0) return registry;
  const published = manifests.map((manifest) => ({
    family: manifest.family,
    release: publishedManifestToRelease(manifest, projectId),
  }));
  return {
    ...registry,
    families: registry.families.map((family) => {
      const familyPublished = published
        .filter((item) => item.family === family.id)
        .map((item) => item.release);
      return familyPublished.length > 0
        ? { ...family, releases: [...familyPublished, ...family.releases] }
        : family;
    }),
  };
}

export function publishedSchemaReleaseId(canonicalName: string, version: string): string {
  return `published:${canonicalName}@${version}`;
}

export function publishedManifestToRelease(
  manifest: PublishedSchemaVersionManifest,
  projectId: string
): SchemaReleasePreview {
  const schema = recordValue(manifest.schema);
  const nodes = recordValue(schema.nodes);
  const registry = recordValue(manifest.registry);
  const structure = flattenNodes(nodes);
  const requiredFields = structure.filter((path) => path.required).map((path) => path.path);
  const updatedAt = stringValue(registry.updatedAt) || stringValue(manifest.updatedAt);
  const releaseNotes = stringValue(registry.releaseNotes);
  return {
    id: publishedSchemaReleaseId(manifest.canonicalName, manifest.version),
    projectId,
    name: manifest.title,
    version: manifest.version,
    description: manifest.description,
    status: manifest.status,
    runtimeAvailable: manifest.status !== 'draft',
    releasedAt: updatedAt || undefined,
    releasedBy: 'Project team',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'none',
    source: manifest.source,
    category: `Composed ${familyLabel(manifest.family)}`,
    rootKey: Object.keys(nodes)[0] ?? 'document',
    requiredFields,
    compatibleWith: compatibleSurfaces(manifest.family),
    migrationSummary: releaseNotes || 'Published from a verified Core + Module Composition draft.',
    canonicalName: manifest.canonicalName,
    schemaHash: stringValue(registry.schemaHash),
    updatedLabel: updatedAt ? formatDate(updatedAt) : 'Published version',
    canonicalYaml: dump(schema, { lineWidth: 100, noRefs: true, sortKeys: false }),
    structure,
    relationTypes: relationPreviews(recordValue(schema.relationTypes)),
    rules: rulePreviews(schema.rules),
    changesBaseReleaseId: '',
    changes: [],
  };
}

function familyLabel(family: PublishedSchemaVersionManifest['family']): string {
  if (family === 'esphome-device') return 'ESPHome device';
  return family === 'prd' ? 'PRD' : family[0].toUpperCase() + family.slice(1);
}

function compatibleSurfaces(family: PublishedSchemaVersionManifest['family']): string[] {
  if (family === 'skill') return ['YSchema validation', 'SKILL.md adapter', 'Skill package'];
  if (family === 'prompt') return ['YSchema validation', 'Prompt compiler', 'Prompt text'];
  if (family === 'esphome-device') {
    return ['YSchema validation', 'ESPHome YAML', 'ESPHome config check'];
  }
  return ['YSchema review', 'YOps apply', 'Leaf document'];
}

function flattenNodes(
  nodes: Record<string, unknown>,
  prefix = '',
  depth = 0
): SchemaContractPath[] {
  return Object.entries(nodes).flatMap(([key, rawNode]) => {
    const node = recordValue(rawNode);
    const path = prefix ? `${prefix}.${key}` : key;
    const repeated = node.repeated === true;
    const requiredSlots = stringArray(node.requiredSlots);
    const result: SchemaContractPath[] = [
      {
        path,
        type: repeated ? 'array' : 'object',
        required: node.required === true,
        constraint:
          stringValue(node.description) ||
          (repeated ? 'repeated nodes' : stringValue(node.contentKind) || 'structured node'),
        depth: Math.min(depth, 2) as 0 | 1 | 2,
      },
    ];
    const slotPaths = Object.entries(recordValue(node.slots)).map(([slotKey, rawSlot]) => {
      const slot = recordValue(rawSlot);
      const values = Array.isArray(slot.enum) ? slot.enum.map(String) : [];
      const maxWords = numberValue(slot.maxWords);
      return {
        path: `${path}${repeated ? '.*' : ''}.${slotKey}`,
        type: values.length > 0 ? 'enum' : stringValue(slot.type) || 'string',
        required: requiredSlots.includes(slotKey),
        constraint:
          values.length > 0
            ? values.join(' | ')
            : maxWords
              ? `max ${maxWords} words`
              : stringValue(slot.description) || 'typed field',
        depth: Math.min(depth + 1, 2) as 0 | 1 | 2,
      } satisfies SchemaContractPath;
    });
    const children = node.children === 'any' ? {} : recordValue(node.children);
    return [
      ...result,
      ...slotPaths,
      ...flattenNodes(children, `${path}${repeated ? '.*' : ''}`, depth + 1),
    ];
  });
}

function relationPreviews(relations: Record<string, unknown>): SchemaRelationTypePreview[] {
  return Object.entries(relations).map(([id, rawRelation]) => {
    const relation = recordValue(rawRelation);
    return {
      id,
      from: stringValue(relation.from),
      to: stringValue(relation.to),
      description: stringValue(relation.description) || id,
      constraints: relation.acyclic === true ? ['acyclic'] : [],
    };
  });
}

function rulePreviews(value: unknown): SchemaRulePreview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawRule) => {
    const rule = recordValue(rawRule);
    const id = stringValue(rule.id);
    return id
      ? [
          {
            id,
            kind: 'executable' as const,
            description: stringValue(rule.description) || id,
            scope: stringValue(rule.scope) || 'document',
            blocking: rule.blocking !== false,
            signals: [],
          },
        ]
      : [];
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}
