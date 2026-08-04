import type { SchemaArtifactPreview } from '@/types/schemaModules';

export const PRD_CORE_ARTIFACT: SchemaArtifactPreview = {
  canonicalName: 't3x/prd-core',
  version: '1.1.0',
  family: 'prd',
  kind: 'core',
  title: 'PRD Core',
  description: 'Product problem, audience, outcomes, requirements, acceptance, and milestones.',
  domain: 'Foundation',
  source: 'official',
  status: 'active',
  provides: ['document-root', 'requirement-list', 'acceptance-contract'],
  requires: [],
  placement: 'core',
  nodePaths: ['summary', 'requirements', 'milestones'],
  renderers: ['markdown', 'yaml'],
  rules: [
    {
      id: 'core.path_ownership',
      description: 'Core paths cannot be replaced by Modules.',
      blocking: true,
    },
    {
      id: 'core.required_contract',
      description: 'Required nodes and slots remain authoritative.',
      blocking: true,
    },
  ],
  versions: [
    { version: '1.1.0', status: 'current', updatedAt: 'Jul 25, 2026' },
    { version: '1.0.0', status: 'historical', updatedAt: 'Jun 18, 2026' },
  ],
  updatedAt: 'Jul 25, 2026',
  usageCount: 2841,
  starCount: 164,
  sortOrder: 0,
  icon: 'file',
};

let nextPrdModuleSortOrder = 0;

export const PRD_MODULE_ARTIFACTS: SchemaArtifactPreview[] = [
  moduleArtifact({
    canonicalName: 't3x/prd-system-architecture',
    title: 'System Architecture',
    description: 'System boundaries, components, responsibilities, and deployment shape.',
    domain: 'Architecture',
    provides: ['system-boundaries'],
    requires: ['document-root'],
    nodePaths: ['system_architecture'],
    placement: 'technical-design',
    icon: 'blocks',
    updatedAt: 'Jul 18, 2026',
    usageCount: 1824,
    starCount: 96,
  }),
  moduleArtifact({
    canonicalName: 't3x/prd-technology-stack',
    title: 'Technology Stack',
    description: 'Runtime, frameworks, infrastructure choices, and engineering constraints.',
    domain: 'Architecture',
    provides: ['implementation-stack'],
    requires: ['system-boundaries'],
    nodePaths: ['technology_stack'],
    placement: 'technical-design',
    icon: 'cpu',
    updatedAt: 'Jul 20, 2026',
    usageCount: 1497,
    starCount: 83,
  }),
  moduleArtifact({
    canonicalName: 't3x/prd-frontend-design',
    title: 'Frontend Design',
    description: 'User flows, routes, component boundaries, interaction states, and accessibility.',
    domain: 'Frontend',
    provides: ['frontend-contract'],
    requires: ['implementation-stack'],
    nodePaths: ['frontend_design'],
    placement: 'technical-design',
    icon: 'monitor',
    updatedAt: 'Jul 23, 2026',
    usageCount: 1268,
    starCount: 72,
  }),
  moduleArtifact({
    canonicalName: 't3x/prd-backend-design',
    title: 'Backend Design',
    description: 'Service responsibilities, domain rules, background jobs, and failure handling.',
    domain: 'Backend',
    provides: ['backend-services'],
    requires: ['system-boundaries'],
    nodePaths: ['backend_design'],
    placement: 'technical-design',
    icon: 'server',
    updatedAt: 'Jul 22, 2026',
    usageCount: 1193,
    starCount: 69,
  }),
  moduleArtifact({
    canonicalName: 't3x/prd-database-design',
    title: 'Database Design',
    description: 'Entities, relationships, indexes, migrations, and data retention rules.',
    domain: 'Data',
    provides: ['data-model'],
    requires: ['backend-services'],
    nodePaths: ['database_design'],
    placement: 'data-design',
    icon: 'database',
    updatedAt: 'Jul 24, 2026',
    usageCount: 1022,
    starCount: 61,
  }),
  moduleArtifact({
    canonicalName: 't3x/prd-api-contract',
    title: 'API Contract',
    description: 'Endpoints, events, payloads, errors, and interface compatibility policy.',
    domain: 'Interfaces',
    provides: ['api-contract'],
    requires: ['backend-services'],
    nodePaths: ['api_contract'],
    placement: 'interfaces',
    icon: 'braces',
    updatedAt: 'Jul 21, 2026',
    usageCount: 938,
    starCount: 58,
  }),
];

function moduleArtifact(
  input: Omit<
    SchemaArtifactPreview,
    | 'family'
    | 'kind'
    | 'renderers'
    | 'rules'
    | 'source'
    | 'sortOrder'
    | 'status'
    | 'version'
    | 'versions'
  >
): SchemaArtifactPreview {
  return {
    ...input,
    version: '1.0.0',
    family: 'prd',
    kind: 'module',
    source: 'official',
    status: 'active',
    rules: [
      {
        id: `${input.canonicalName.split('/').at(-1)}.dependencies`,
        description: `Requires ${input.requires.join(', ') || 'no additional capabilities'}.`,
        blocking: true,
      },
      {
        id: `${input.canonicalName.split('/').at(-1)}.path_ownership`,
        description: `Owns ${input.nodePaths.join(', ')} without replacing Core paths.`,
        blocking: true,
      },
    ],
    versions: [
      { version: '1.0.0', status: 'current', updatedAt: input.updatedAt },
      { version: '0.9.0', status: 'historical', updatedAt: 'Jun 30, 2026' },
    ],
    renderers: ['markdown', 'yaml'],
    sortOrder: ++nextPrdModuleSortOrder,
  };
}
