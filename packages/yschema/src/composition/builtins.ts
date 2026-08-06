import { t3xPrdP0Fixtures, t3xPromptP0Fixtures, t3xSkillP0Fixtures } from '../p0';
import type { NodeSchema } from '../p0/types';
import type { YSchemaArtifactFamily, YSchemaCoreArtifact, YSchemaModuleManifest } from './types';

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

function compatibleModule(
  family: YSchemaArtifactFamily,
  core: Pick<YSchemaCoreArtifact, 'canonicalName' | 'version'>
) {
  return {
    apiVersion: 't3x.dev/yschema-module/v1' as const,
    family,
    kind: 'structure' as const,
    status: 'active' as const,
    source: 'official' as const,
    compatibility: { core: core.canonicalName, versions: [core.version] },
  };
}

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

export const builtInSkillCoreArtifact: YSchemaCoreArtifact = {
  apiVersion: 't3x.dev/yschema-core/v1',
  canonicalName: 't3x/skill-core',
  version: '1.0.0',
  family: 'skill',
  title: 'Skill Core',
  description:
    'Portable agent activation, workflow, instruction, resource, and verification contract.',
  status: 'active',
  source: 'official',
  provides: ['skill-root', 'workflow-contract', 'delivery-checks'],
  extensionSlots: ['tooling', 'safety', 'delivery', 'before.validation'],
  schema: {
    ...t3xSkillP0Fixtures.normalizedYSchema,
    name: 't3x/skill-core',
    version: '1.0.0',
  },
};

export const builtInPromptCoreArtifact: YSchemaCoreArtifact = {
  apiVersion: 't3x.dev/yschema-core/v1',
  canonicalName: 't3x/prompt-core',
  version: '1.0.0',
  family: 'prompt',
  title: 'Prompt Core',
  description:
    'Typed variables, ordered messages, runtime, output, resource, and deterministic check contract.',
  status: 'active',
  source: 'official',
  provides: ['prompt-root', 'message-contract', 'output-contract'],
  extensionSlots: ['examples', 'guardrails', 'observability', 'before.validation'],
  schema: {
    ...t3xPromptP0Fixtures.normalizedYSchema,
    name: 't3x/prompt-core',
    version: '1.0.0',
  },
};

export const builtInEsphomeDeviceCoreArtifact: YSchemaCoreArtifact = {
  apiVersion: 't3x.dev/yschema-core/v1',
  canonicalName: 't3x/esphome-device-core',
  version: '1.0.0',
  family: 'esphome-device',
  title: 'ESPHome Device Core',
  description:
    'Compilable device identity, ESP32 platform, connectivity, logging, API, and OTA contract.',
  status: 'active',
  source: 'official',
  provides: ['device-root', 'hardware-platform', 'connectivity-base'],
  extensionSlots: [
    'hardware',
    'connectivity',
    'entities',
    'automation',
    'operations',
    'before.validation',
  ],
  schema: {
    yschema: '0.1',
    name: 't3x/esphome-device-core',
    version: '1.0.0',
    description: 'Supported ESPHome device configuration foundation.',
    strict: false,
    nodes: {
      esphome: {
        ...structuredNode(
          'Stable ESPHome device identity.',
          {
            name: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,23}$' },
            friendly_name: { type: 'string', maxLength: 80 },
          },
          ['name']
        ),
      },
      esp32: {
        ...structuredNode(
          'ESP32 board and framework target.',
          {
            board: { type: 'string' },
            framework: { type: 'object' },
          },
          ['board']
        ),
      },
      substitutions: structuredNode('Reusable device configuration values.', {}, []),
      wifi: structuredNode(
        'Local Wi-Fi credential references.',
        {
          ssid: { type: 'string' },
          password: { type: 'string' },
        },
        []
      ),
      logger: structuredNode('ESPHome logger configuration.', { level: { type: 'string' } }, []),
      api: structuredNode('Native ESPHome API configuration.', {}, []),
      ota: structuredNode('Over-the-air update configuration.', {}, []),
    },
    relationTypes: {},
    rules: [],
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
    registry: {
      icon: 'blocks',
      updatedAt: '2026-07-18',
      usageCount: 1824,
      starCount: 96,
    },
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
    registry: {
      icon: 'cpu',
      updatedAt: '2026-07-20',
      usageCount: 1497,
      starCount: 83,
    },
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
    registry: {
      icon: 'monitor',
      updatedAt: '2026-07-23',
      usageCount: 1268,
      starCount: 72,
    },
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
    registry: {
      icon: 'server',
      updatedAt: '2026-07-22',
      usageCount: 1193,
      starCount: 69,
    },
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
    registry: {
      icon: 'database',
      updatedAt: '2026-07-24',
      usageCount: 1022,
      starCount: 61,
    },
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
    registry: {
      icon: 'braces',
      updatedAt: '2026-07-21',
      usageCount: 938,
      starCount: 58,
    },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-security-privacy',
    version: '1.0.0',
    title: 'Security & Privacy',
    description:
      'Threats, access controls, data classification, privacy constraints, and abuse cases.',
    domain: 'Security',
    provides: ['security-controls'],
    requires: ['system-boundaries'],
    defaultPlacement: { slot: 'quality-gates' },
    contribution: {
      nodes: {
        security_privacy: structuredNode(
          'Security and privacy controls that constrain product delivery.',
          {
            threats: { type: 'array' },
            access_controls: { type: 'array' },
            data_classification: { type: 'array' },
            privacy_constraints: { type: 'array' },
            abuse_cases: { type: 'array' },
          },
          ['threats', 'access_controls']
        ),
      },
    },
    registry: {
      icon: 'blocks',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-quality-strategy',
    version: '1.0.0',
    title: 'Quality Strategy',
    description: 'Test levels, quality budgets, release gates, and required verification evidence.',
    domain: 'Quality',
    provides: ['quality-strategy'],
    requires: ['acceptance-contract'],
    defaultPlacement: { slot: 'quality-gates' },
    contribution: {
      nodes: {
        quality_strategy: structuredNode(
          'Quality expectations and evidence required before release.',
          {
            test_levels: { type: 'array' },
            quality_budgets: { type: 'array' },
            release_gates: { type: 'array' },
            evidence: { type: 'array' },
          },
          ['test_levels', 'release_gates']
        ),
      },
    },
    registry: {
      icon: 'monitor',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
      recommended: true,
    },
  },
  {
    ...compatiblePrdModule,
    canonicalName: 't3x/prd-rollout-operations',
    version: '1.0.0',
    title: 'Rollout & Operations',
    description: 'Rollout, migration, monitoring, rollback, and operational runbook requirements.',
    domain: 'Operations',
    provides: ['operational-readiness'],
    requires: ['implementation-stack'],
    defaultPlacement: { slot: 'operations' },
    contribution: {
      nodes: {
        rollout_operations: structuredNode(
          'Delivery and operational readiness contract.',
          {
            rollout_strategy: { type: 'string', maxWords: 120 },
            migrations: { type: 'array' },
            monitoring: { type: 'array' },
            rollback: { type: 'string', maxWords: 120 },
            runbooks: { type: 'array' },
          },
          ['rollout_strategy', 'rollback']
        ),
      },
    },
    registry: {
      icon: 'server',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
];

const compatibleSkillModule = compatibleModule('skill', builtInSkillCoreArtifact);

export const builtInSkillModules: YSchemaModuleManifest[] = [
  {
    ...compatibleSkillModule,
    canonicalName: 't3x/skill-tool-policy',
    version: '1.0.0',
    title: 'Tool Policy',
    description: 'Tool allowlists, permissions, approvals, and failure behavior.',
    domain: 'Tools',
    provides: ['tool-policy'],
    requires: ['skill-root'],
    defaultPlacement: { slot: 'tooling' },
    contribution: {
      nodes: {
        tool_policy: structuredNode(
          'Runtime tool access and approval contract.',
          {
            allowed: { type: 'array' },
            denied: { type: 'array' },
            approval_required: { type: 'array' },
            on_failure: { type: 'string' },
          },
          ['allowed']
        ),
      },
    },
    registry: {
      icon: 'braces',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleSkillModule,
    canonicalName: 't3x/skill-safety-gates',
    version: '1.0.0',
    title: 'Safety Gates',
    description: 'Explicit risk boundaries and approval gates for mutating workflows.',
    domain: 'Safety',
    provides: ['safety-gates'],
    requires: ['workflow-contract'],
    defaultPlacement: { slot: 'safety' },
    contribution: {
      nodes: {
        safety_gates: structuredNode(
          'Safety boundaries applied before side effects.',
          {
            risks: { type: 'array' },
            approvals: { type: 'array' },
            stop_conditions: { type: 'array' },
          },
          ['risks', 'stop_conditions']
        ),
      },
    },
    registry: {
      icon: 'blocks',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleSkillModule,
    canonicalName: 't3x/skill-delivery-targets',
    version: '1.0.0',
    title: 'Delivery Targets',
    description: 'Output layout, packaging, and host-adapter delivery requirements.',
    domain: 'Delivery',
    provides: ['delivery-targets'],
    requires: ['delivery-checks'],
    defaultPlacement: { slot: 'delivery' },
    contribution: {
      nodes: {
        delivery_targets: structuredNode(
          'Files and adapters emitted by the Skill compiler.',
          {
            formats: { type: 'array' },
            files: { type: 'array' },
            adapters: { type: 'array' },
          },
          ['formats']
        ),
      },
    },
    registry: {
      icon: 'file',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleSkillModule,
    canonicalName: 't3x/skill-runtime-environment',
    version: '1.0.0',
    title: 'Runtime Environment',
    description:
      'Runtime, dependency, environment reference, filesystem, and network requirements.',
    domain: 'Runtime',
    provides: ['runtime-contract'],
    requires: ['workflow-contract'],
    defaultPlacement: { slot: 'tooling' },
    contribution: {
      nodes: {
        runtime_environment: structuredNode(
          'Execution environment required by the Skill workflow.',
          {
            runtimes: { type: 'array' },
            dependencies: { type: 'array' },
            environment_references: { type: 'array' },
            filesystem_policy: { type: 'string' },
            network_policy: { type: 'string' },
          },
          ['runtimes']
        ),
      },
    },
    registry: {
      icon: 'cpu',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleSkillModule,
    canonicalName: 't3x/skill-evaluation-suite',
    version: '1.0.0',
    title: 'Evaluation Suite',
    description: 'Fixtures, evaluation cases, assertions, and acceptance thresholds for a Skill.',
    domain: 'Evaluation',
    provides: ['evaluation-suite'],
    requires: ['delivery-checks'],
    defaultPlacement: { slot: 'before.validation' },
    contribution: {
      nodes: {
        evaluation_suite: structuredNode(
          'Deterministic and scored evaluations applied before Skill delivery.',
          {
            cases: { type: 'array' },
            fixtures: { type: 'array' },
            assertions: { type: 'array' },
            thresholds: { type: 'array' },
          },
          ['cases', 'assertions']
        ),
      },
    },
    registry: {
      icon: 'monitor',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
      recommended: true,
    },
  },
];

const compatiblePromptModule = compatibleModule('prompt', builtInPromptCoreArtifact);

export const builtInPromptModules: YSchemaModuleManifest[] = [
  {
    ...compatiblePromptModule,
    canonicalName: 't3x/prompt-few-shot-examples',
    version: '1.0.0',
    title: 'Few-shot Examples',
    description: 'Versioned input and output examples that demonstrate the intended behavior.',
    domain: 'Examples',
    provides: ['few-shot-examples'],
    requires: ['message-contract'],
    defaultPlacement: { slot: 'examples' },
    contribution: {
      nodes: {
        examples: structuredNode(
          'Reusable prompt examples and expected outputs.',
          {
            cases: { type: 'array' },
            selection_policy: { type: 'string' },
          },
          ['cases']
        ),
      },
    },
    registry: {
      icon: 'file',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatiblePromptModule,
    canonicalName: 't3x/prompt-guardrails',
    version: '1.0.0',
    title: 'Guardrails',
    description: 'Content boundaries, refusal behavior, and escalation policy.',
    domain: 'Safety',
    provides: ['prompt-guardrails'],
    requires: ['prompt-root'],
    defaultPlacement: { slot: 'guardrails' },
    contribution: {
      nodes: {
        guardrails: structuredNode(
          'Prompt safety and refusal behavior.',
          {
            prohibited: { type: 'array' },
            refusal: { type: 'string' },
            escalation: { type: 'string' },
          },
          ['prohibited']
        ),
      },
    },
    registry: {
      icon: 'blocks',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatiblePromptModule,
    canonicalName: 't3x/prompt-observability',
    version: '1.0.0',
    title: 'Observability',
    description: 'Trace fields, redaction rules, latency budgets, and quality signals.',
    domain: 'Operations',
    provides: ['prompt-observability'],
    requires: ['output-contract'],
    defaultPlacement: { slot: 'observability' },
    contribution: {
      nodes: {
        observability: structuredNode(
          'Runtime trace and measurement contract.',
          {
            trace_fields: { type: 'array' },
            redactions: { type: 'array' },
            latency_budget_ms: { type: 'integer', minimum: 1 },
          },
          ['trace_fields']
        ),
      },
    },
    registry: {
      icon: 'monitor',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatiblePromptModule,
    canonicalName: 't3x/prompt-context-policy',
    version: '1.0.0',
    title: 'Context Policy',
    description:
      'Context sources, trust levels, freshness, token budgets, and conflict resolution.',
    domain: 'Context',
    provides: ['context-policy'],
    requires: ['prompt-root'],
    defaultPlacement: { slot: 'guardrails' },
    contribution: {
      nodes: {
        context_policy: structuredNode(
          'Selection and trust policy for context supplied to the Prompt.',
          {
            sources: { type: 'array' },
            trust_levels: { type: 'array' },
            freshness_policy: { type: 'string' },
            token_budget: { type: 'integer', minimum: 1 },
            conflict_resolution: { type: 'string' },
          },
          ['sources', 'conflict_resolution']
        ),
      },
    },
    registry: {
      icon: 'file',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatiblePromptModule,
    canonicalName: 't3x/prompt-evaluation-suite',
    version: '1.0.0',
    title: 'Evaluation Suite',
    description:
      'Regression cases, graders, quality metrics, and acceptance thresholds for a Prompt.',
    domain: 'Evaluation',
    provides: ['evaluation-suite'],
    requires: ['output-contract'],
    defaultPlacement: { slot: 'before.validation' },
    contribution: {
      nodes: {
        evaluation_suite: structuredNode(
          'Repeatable evaluations for Prompt behavior and output quality.',
          {
            cases: { type: 'array' },
            graders: { type: 'array' },
            metrics: { type: 'array' },
            thresholds: { type: 'array' },
          },
          ['cases', 'metrics']
        ),
      },
    },
    registry: {
      icon: 'monitor',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
      recommended: true,
    },
  },
];

const compatibleEsphomeModule = compatibleModule(
  'esphome-device',
  builtInEsphomeDeviceCoreArtifact
);

export const builtInEsphomeDeviceModules: YSchemaModuleManifest[] = [
  {
    ...compatibleEsphomeModule,
    canonicalName: 't3x/esphome-sensors',
    version: '1.0.0',
    title: 'Sensors',
    description: 'Sensor platforms, pins, update intervals, filters, and exposed entities.',
    domain: 'Sensors',
    provides: ['sensor-entities'],
    requires: ['hardware-platform'],
    defaultPlacement: { slot: 'entities' },
    contribution: {
      nodes: {
        sensors: structuredNode(
          'ESPHome sensor entity declarations.',
          {
            entities: { type: 'array' },
            shared_filters: { type: 'array' },
          },
          ['entities']
        ),
      },
    },
    registry: {
      icon: 'cpu',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleEsphomeModule,
    canonicalName: 't3x/esphome-actuators',
    version: '1.0.0',
    title: 'Actuators',
    description: 'Switch, light, fan, motor, and climate output entities.',
    domain: 'Actuators',
    provides: ['actuator-entities'],
    requires: ['hardware-platform'],
    defaultPlacement: { slot: 'entities' },
    contribution: {
      nodes: {
        actuators: structuredNode(
          'ESPHome actuator entity declarations.',
          {
            entities: { type: 'array' },
            restore_policy: { type: 'string' },
          },
          ['entities']
        ),
      },
    },
    registry: {
      icon: 'server',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleEsphomeModule,
    canonicalName: 't3x/esphome-automations',
    version: '1.0.0',
    title: 'Automations',
    description: 'Triggers, conditions, actions, scripts, and safety fallbacks.',
    domain: 'Automation',
    provides: ['device-automations'],
    requires: ['sensor-entities', 'actuator-entities'],
    defaultPlacement: { slot: 'automation' },
    contribution: {
      nodes: {
        automations: structuredNode(
          'Local deterministic device behavior.',
          {
            triggers: { type: 'array' },
            scripts: { type: 'array' },
            fallbacks: { type: 'array' },
          },
          ['triggers']
        ),
      },
    },
    registry: {
      icon: 'blocks',
      updatedAt: '2026-08-04',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleEsphomeModule,
    canonicalName: 't3x/esphome-hardware-buses',
    version: '1.0.0',
    title: 'Hardware Buses',
    description: 'I2C, SPI, UART, OneWire, and shared pin reservation contracts.',
    domain: 'Hardware',
    provides: ['hardware-buses'],
    requires: ['hardware-platform'],
    defaultPlacement: { slot: 'hardware' },
    contribution: {
      nodes: {
        hardware_buses: structuredNode(
          'Shared device buses and pin ownership.',
          {
            i2c: { type: 'array' },
            spi: { type: 'array' },
            uart: { type: 'array' },
            one_wire: { type: 'array' },
            pin_reservations: { type: 'array' },
          },
          []
        ),
      },
    },
    registry: {
      icon: 'cpu',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleEsphomeModule,
    canonicalName: 't3x/esphome-network-services',
    version: '1.0.0',
    title: 'Network Services',
    description: 'Network transports, discovery, local services, and fallback access behavior.',
    domain: 'Connectivity',
    provides: ['network-services'],
    requires: ['connectivity-base'],
    defaultPlacement: { slot: 'connectivity' },
    contribution: {
      nodes: {
        network_services: structuredNode(
          'Connectivity and local network service contract.',
          {
            transports: { type: 'array' },
            services: { type: 'array' },
            discovery: { type: 'array' },
            fallback_access: { type: 'string' },
          },
          ['transports']
        ),
      },
    },
    registry: {
      icon: 'server',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
  {
    ...compatibleEsphomeModule,
    canonicalName: 't3x/esphome-power-management',
    version: '1.0.0',
    title: 'Power Management',
    description: 'Power modes, wake sources, power domains, and device energy budgets.',
    domain: 'Power',
    provides: ['power-management'],
    requires: ['hardware-platform'],
    defaultPlacement: { slot: 'operations' },
    contribution: {
      nodes: {
        power_management: structuredNode(
          'Device power behavior and operational energy constraints.',
          {
            modes: { type: 'array' },
            wake_sources: { type: 'array' },
            power_domains: { type: 'array' },
            energy_budget: { type: 'string' },
          },
          ['modes']
        ),
      },
    },
    registry: {
      icon: 'blocks',
      updatedAt: '2026-08-06',
      usageCount: 0,
      starCount: 0,
    },
  },
];

export const builtInYSchemaCores: YSchemaCoreArtifact[] = [
  builtInPrdCoreArtifact,
  builtInSkillCoreArtifact,
  builtInPromptCoreArtifact,
  builtInEsphomeDeviceCoreArtifact,
];

export const builtInYSchemaModules: YSchemaModuleManifest[] = [
  ...builtInPrdModules,
  ...builtInSkillModules,
  ...builtInPromptModules,
  ...builtInEsphomeDeviceModules,
];

export const defaultPrdCompositionModuleOrder = [
  't3x/prd-system-architecture',
  't3x/prd-technology-stack',
  't3x/prd-frontend-design',
  't3x/prd-backend-design',
  't3x/prd-database-design',
  't3x/prd-api-contract',
] as const;

export const defaultSkillCompositionModuleOrder = [
  't3x/skill-tool-policy',
  't3x/skill-safety-gates',
  't3x/skill-delivery-targets',
] as const;
export const defaultPromptCompositionModuleOrder = [
  't3x/prompt-few-shot-examples',
  't3x/prompt-guardrails',
  't3x/prompt-observability',
] as const;
export const defaultEsphomeDeviceCompositionModuleOrder = [
  't3x/esphome-sensors',
  't3x/esphome-actuators',
  't3x/esphome-automations',
] as const;
