import type { NodeSchema, YSchemaModuleArtifactV2 } from '@t3x-dev/yschema';

/** Repository-authored starters. Tags are discovery hints, never execution capabilities. */
type Starter = YSchemaModuleArtifactV2 & {
  license: 'Apache-2.0';
  readme: string;
  starter: Record<string, unknown>;
};
function starter(
  slug: string,
  title: string,
  description: string,
  tags: string[],
  nodes: Record<string, NodeSchema>,
  sample: Record<string, unknown>,
  readme: string
): Starter {
  return {
    apiVersion: 't3x.dev/yschema-module/v2',
    canonicalName: `t3x/${slug}`,
    version: '1.0.0',
    title,
    description,
    status: 'published',
    source: 'official',
    license: 'Apache-2.0',
    tags,
    compatibility: { yschema: ['0.1'] },
    provides: [{ capability: `t3x.starter.${slug}`, version: 1 }],
    imports: [],
    contribution: { nodes },
    starter: sample,
    readme,
  };
}
export const schemaEcosystemStarters: Starter[] = [
  starter(
    'product-brief',
    'Product brief',
    'Turn a problem into reviewable requirements.',
    ['planning', 'work', 'ecosystem:t3x', 'prd'],
    {
      product: {
        required: true,
        slots: {
          title: { type: 'string', minLength: 1 },
          problem: { type: 'string', minLength: 1 },
        },
        requiredSlots: ['title', 'problem'],
      },
      requirements: {
        required: true,
        repeated: true,
        slots: {
          title: { type: 'string', minLength: 1 },
          acceptance: { type: 'string', minLength: 1 },
          priority: { type: 'string', enum: ['must', 'should', 'could'] },
        },
        requiredSlots: ['title', 'acceptance'],
      },
    },
    {
      product: {
        title: 'Release checklist',
        problem: 'Release decisions need explicit acceptance criteria.',
      },
      requirements: {
        export: {
          title: 'Export a reviewed revision',
          acceptance: 'The exported file identifies the reviewed commit.',
          priority: 'must',
        },
      },
    },
    '# Product brief\n\nDescribe the problem and name each requirement. Review acceptance criteria before committing. This small PRD starter does not measure delivery success. T3X-authored; Apache-2.0.'
  ),
  starter(
    'care-checklist',
    'Care checklist',
    'A reusable checklist for everyday routines.',
    ['care', 'work', 'checklist', 'ecosystem:t3x'],
    {
      checklist: {
        required: true,
        slots: { title: { type: 'string', minLength: 1 } },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          task: { type: 'string', minLength: 1 },
          done: { type: 'boolean' },
          note: { type: 'string' },
        },
        requiredSlots: ['task', 'done'],
      },
    },
    {
      checklist: { title: 'Daily dog care' },
      items: {
        water: { task: 'Refresh the water bowl', done: false },
        walk: { task: 'Record today’s walk', done: false, note: '' },
      },
    },
    '# Care checklist\n\nRename the routine and add named items. Check off completed work and leave an optional note. Use it for household routines, equipment checks or team handoffs. It is a tracking template, not health advice. T3X-authored; Apache-2.0.'
  ),
  starter(
    'compose-services',
    'Compose services',
    'Review image-based service configuration before delivery.',
    ['infrastructure', 'devops', 'ecosystem:docker-compose', 'configuration'],
    {
      services: {
        required: true,
        repeated: true,
        slots: {
          image: { type: 'string', minLength: 1 },
          ports: { type: 'array' },
          environment: { type: 'object' },
          restart: { type: 'string', enum: ['no', 'always', 'on-failure', 'unless-stopped'] },
        },
        requiredSlots: ['image'],
      },
    },
    {
      services: {
        web: {
          image: 'nginx:1.28-alpine',
          ports: ['127.0.0.1:8080:80'],
          restart: 'unless-stopped',
        },
      },
    },
    '# Compose services\n\nAn image-based subset of Docker Compose: named services, image, ports, environment mapping and restart policy. Export the configuration and run `docker compose config --quiet` with your installed Compose version before deployment.\n\nT3X checks the declared fields; it does not validate port syntax, image availability, interpolation or runtime behavior. Build-only services and the complete Compose specification are outside this starter.\n\nReferences: https://docs.docker.com/reference/compose-file/services/\n\nT3X-authored; Apache-2.0. Docker does not publish or endorse this starter.'
  ),
];
