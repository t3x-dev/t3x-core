import { t3xPrdP0Fixtures } from '../p0';
import type { NodeSchema } from '../p0/types';
import type { YSchemaCoreArtifact, YSchemaModuleManifest } from './types';

function structuredNode(
  description: string,
  slots: NodeSchema['slots'],
  requiredSlots: string[]
): NodeSchema {
  return {
    required: false,
    repeated: false,
    contentKind: 'structured',
    description,
    slots,
    requiredSlots,
  };
}

const compatiblePrdModule = {
  apiVersion: 't3x.dev/yschema-module/v1' as const,
  family: 'prd' as const,
  kind: 'structure' as const,
  status: 'active' as const,
  source: 'official' as const,
  compatibility: { core: 't3x/prd-core', versions: ['1.1.0'] },
};

export const builtInPrdCoreArtifact: YSchemaCoreArtifact = {
  apiVersion: 't3x.dev/yschema-core/v1',
  canonicalName: 't3x/prd-core',
  version: '1.1.0',
  family: 'prd',
  title: 'PRD Core',
  description: 'The stable product problem, requirements, acceptance, and delivery contract.',
  status: 'active',
  source: 'official',
  provides: ['document-root', 'requirement-list', 'acceptance-contract'],
  extensionSlots: [
    'after.summary',
    'technical-design',
    'data-design',
    'interfaces',
    'quality-gates',
    'delivery',
    'operations',
    'before.validation',
  ],
  schema: {
    ...t3xPrdP0Fixtures.normalizedYSchema,
    version: '1.1.0',
  },
};

export const builtInPrdModules: YSchemaModuleManifest[] = [
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-system-architecture',
    version: '1.0.0',
    title: 'System Architecture',
    description: 'System boundaries, components, responsibilities, and deployment shape.',
    domain: 'Architecture',
    provides: ['system-boundaries'],
    requires: ['document-root'],
    defaultPlacement: { slot: 'technical-design' },
    contribution: {
      nodes: {
        system_architecture: structuredNode(
          'System boundaries and the responsibilities of major components.',
          {
            context: { type: 'string', maxWords: 100 },
            components: { type: 'array' },
            deployment: { type: 'string', maxWords: 120 },
          },
          ['context', 'components']
        ),
      },
    },
    registry: { icon: 'blocks', updatedAt: '2026-07-18', usageCount: 1824, starCount: 96 },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-technology-stack',
    version: '1.0.0',
    title: 'Technology Stack',
    description: 'Runtime, frameworks, infrastructure choices, and engineering constraints.',
    domain: 'Architecture',
    provides: ['implementation-stack'],
    requires: ['system-boundaries'],
    defaultPlacement: { slot: 'technical-design' },
    contribution: {
      nodes: {
        technology_stack: structuredNode(
          'Selected technologies and the reasons or constraints behind each choice.',
          {
            frontend: { type: 'array' },
            backend: { type: 'array' },
            infrastructure: { type: 'array' },
            constraints: { type: 'array' },
          },
          ['frontend', 'backend']
        ),
      },
    },
    registry: { icon: 'cpu', updatedAt: '2026-07-20', usageCount: 1497, starCount: 83 },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-frontend-design',
    version: '1.0.0',
    title: 'Frontend Design',
    description: 'User flows, information architecture, component boundaries, and UI states.',
    domain: 'Frontend',
    provides: ['frontend-contract'],
    requires: ['implementation-stack'],
    defaultPlacement: { slot: 'technical-design' },
    contribution: {
      nodes: {
        frontend_design: structuredNode(
          'Frontend experience and implementation contract.',
          {
            user_flows: { type: 'array' },
            routes: { type: 'array' },
            components: { type: 'array' },
            states: { type: 'array' },
            accessibility: { type: 'array' },
          },
          ['user_flows', 'states']
        ),
      },
    },
    registry: { icon: 'monitor', updatedAt: '2026-07-23', usageCount: 1268, starCount: 72 },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-backend-design',
    version: '1.0.0',
    title: 'Backend Design',
    description: 'Service responsibilities, domain boundaries, jobs, and failure handling.',
    domain: 'Backend',
    provides: ['backend-services'],
    requires: ['system-boundaries'],
    defaultPlacement: { slot: 'technical-design' },
    contribution: {
      nodes: {
        backend_design: structuredNode(
          'Backend service and operational behavior contract.',
          {
            services: { type: 'array' },
            domain_rules: { type: 'array' },
            background_jobs: { type: 'array' },
            failure_modes: { type: 'array' },
          },
          ['services', 'domain_rules']
        ),
      },
    },
    registry: { icon: 'server', updatedAt: '2026-07-22', usageCount: 1193, starCount: 69 },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-database-design',
    version: '1.0.0',
    title: 'Database Design',
    description: 'Entities, relationships, indexes, migrations, and retention rules.',
    domain: 'Data',
    provides: ['data-model'],
    requires: ['backend-services'],
    defaultPlacement: { slot: 'data-design' },
    contribution: {
      nodes: {
        database_design: structuredNode(
          'Persistent data model and lifecycle contract.',
          {
            entities: { type: 'array' },
            relationships: { type: 'array' },
            indexes: { type: 'array' },
            migrations: { type: 'array' },
            retention: { type: 'string', maxWords: 100 },
          },
          ['entities', 'relationships']
        ),
      },
    },
    registry: { icon: 'database', updatedAt: '2026-07-24', usageCount: 1022, starCount: 61 },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-api-contract',
    version: '1.0.0',
    title: 'API Contract',
    description: 'External and internal interfaces, payloads, errors, and compatibility policy.',
    domain: 'Interfaces',
    provides: ['api-contract'],
    requires: ['backend-services'],
    defaultPlacement: { slot: 'interfaces' },
    contribution: {
      nodes: {
        api_contract: structuredNode(
          'Interface behavior shared by producers and consumers.',
          {
            endpoints: { type: 'array' },
            events: { type: 'array' },
            errors: { type: 'array' },
            compatibility: { type: 'string', maxWords: 100 },
          },
          ['endpoints', 'errors']
        ),
      },
    },
    registry: { icon: 'braces', updatedAt: '2026-07-21', usageCount: 938, starCount: 58 },
  },
];

export const defaultPrdCompositionModuleOrder = [
  't3x/prd-system-architecture',
  't3x/prd-technology-stack',
  't3x/prd-frontend-design',
  't3x/prd-backend-design',
  't3x/prd-database-design',
  't3x/prd-api-contract',
] as const;
