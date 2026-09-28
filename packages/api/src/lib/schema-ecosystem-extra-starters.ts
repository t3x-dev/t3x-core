import type { NodeSchema, YSchemaModuleArtifactV2 } from '@t3x-dev/yschema';

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

export const extraSchemaEcosystemStarters: Starter[] = [
  starter(
    'env-config',
    'Env config',
    'Review named environment values before a service starts.',
    ['infrastructure', 'devops', 'configuration', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          key: {
            type: 'string',
            minLength: 1,
          },
          value: {
            type: 'string',
            minLength: 1,
          },
          secret: {
            type: 'boolean',
          },
        },
        requiredSlots: ['key', 'value'],
      },
    },
    {
      list: {
        title: 'API process',
      },
      items: {
        database: {
          key: 'DATABASE_URL',
          value: 'postgres://localhost/app',
          secret: true,
        },
      },
    },
    '# Env config\n\nName each variable and keep the reviewed value next to its purpose. T3X checks declared fields; it does not load secrets or start a process.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'scheduled-jobs',
    'Scheduled jobs',
    'Declare cron-like jobs and their expected cadence.',
    ['infrastructure', 'devops', 'homelab', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          name: {
            type: 'string',
            minLength: 1,
          },
          cadence: {
            type: 'string',
            minLength: 1,
          },
          command: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['name', 'cadence'],
      },
    },
    {
      list: {
        title: 'Ops jobs',
      },
      items: {
        prune: {
          name: 'Prune logs',
          cadence: '0 3 * * *',
          command: 'find /var/log -mtime +14 -delete',
        },
      },
    },
    '# Scheduled jobs\n\nRecord the job name, cadence and command text. T3X does not install cron or run the command.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'service-routes',
    'Service routes',
    'Review host and path routing before publishing an ingress.',
    ['infrastructure', 'devops', 'configuration', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          host: {
            type: 'string',
            minLength: 1,
          },
          path: {
            type: 'string',
            minLength: 1,
          },
          target: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['host', 'path', 'target'],
      },
    },
    {
      list: {
        title: 'Public ingress',
      },
      items: {
        web: {
          host: 'app.example.test',
          path: '/',
          target: 'web:3000',
        },
      },
    },
    '# Service routes\n\nName each route, host and path. T3X checks the declared fields; it does not configure a proxy.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'backup-plan',
    'Backup plan',
    'Record backup targets, cadence and restore owners.',
    ['infrastructure', 'homelab', 'devops', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          target: {
            type: 'string',
            minLength: 1,
          },
          cadence: {
            type: 'string',
            minLength: 1,
          },
          owner: {
            type: 'string',
            minLength: 1,
          },
          notes: {
            type: 'string',
          },
        },
        requiredSlots: ['target', 'cadence', 'owner'],
      },
    },
    {
      record: {
        target: '/var/lib/app',
        cadence: 'nightly',
        owner: 'ops-oncall',
        notes: '',
      },
    },
    '# Backup plan\n\nWrite the target, cadence and who restores it. T3X does not copy files or prove a restore works.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'prompt-pack',
    'Prompt pack',
    'Keep named prompts reviewable before they are reused.',
    ['ai', 'agents', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          name: {
            type: 'string',
            minLength: 1,
          },
          text: {
            type: 'string',
            minLength: 1,
          },
          audience: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['name', 'text'],
      },
    },
    {
      list: {
        title: 'Support prompts',
      },
      items: {
        greeting: {
          name: 'Greeting',
          text: 'Reply briefly and name the next step.',
          audience: 'support',
        },
      },
    },
    '# Prompt pack\n\nName each prompt and keep the reviewed text beside it. T3X does not call a model.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'evaluation-cases',
    'Evaluation cases',
    'Define reviewable cases before connecting an evaluation runner.',
    ['ai', 'evaluation', 'agents', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          case: {
            type: 'string',
            minLength: 1,
          },
          input: {
            type: 'string',
            minLength: 1,
          },
          expected: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['case', 'input', 'expected'],
      },
    },
    {
      list: {
        title: 'Assistant checks',
      },
      items: {
        greeting: {
          case: 'Greeting',
          input: 'Hello',
          expected: 'Friendly reply with a next step',
        },
      },
    },
    '# Evaluation cases\n\nName the case, input and expected signal. T3X does not score a model or run a harness.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'agent-handoff',
    'Agent handoff',
    'Record what an agent finished and what the next owner should do.',
    ['ai', 'agents', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          summary: {
            type: 'string',
            minLength: 1,
          },
          leftover: {
            type: 'string',
            minLength: 1,
          },
          next_owner: {
            type: 'string',
            minLength: 1,
          },
          status: {
            type: 'string',
            enum: ['open', 'accepted', 'blocked'],
          },
        },
        requiredSlots: ['summary', 'next_owner', 'status'],
      },
    },
    {
      record: {
        summary: 'Drafted the weekly brief',
        leftover: 'Need cited sources',
        next_owner: 'editor',
        status: 'open',
      },
    },
    '# Agent handoff\n\nWrite the completed work, leftover risk and next owner. T3X does not resume an agent.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'tool-allowlist',
    'Tool allowlist',
    'Declare which tools an agent may mention before a run.',
    ['ai', 'agents', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          tool: {
            type: 'string',
            minLength: 1,
          },
          allowed: {
            type: 'boolean',
          },
          reason: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['tool', 'allowed'],
      },
    },
    {
      list: {
        title: 'Research agent',
      },
      items: {
        files: {
          tool: 'read_file',
          allowed: true,
          reason: 'Inspect local notes',
        },
      },
    },
    '# Tool allowlist\n\nName each tool and whether it is allowed. This is a review list, not a runtime sandbox.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'model-choice',
    'Model choice',
    'Record which model a task should use and why.',
    ['ai', 'agents', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          task: {
            type: 'string',
            minLength: 1,
          },
          model: {
            type: 'string',
            minLength: 1,
          },
          fallback: {
            type: 'string',
          },
          reason: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['task', 'model'],
      },
    },
    {
      record: {
        task: 'Draft review',
        model: 'claude-sonnet',
        fallback: '',
        reason: 'Long structured edits',
      },
    },
    '# Model choice\n\nName the task, selected model and fallback. T3X does not call a provider.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'experiment-log',
    'Experiment log',
    'Capture a hypothesis, setup and observed result.',
    ['science', 'research', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
          hypothesis: {
            type: 'string',
            minLength: 1,
          },
          setup: {
            type: 'string',
            minLength: 1,
          },
          result: {
            type: 'string',
          },
        },
        requiredSlots: ['title', 'hypothesis'],
      },
    },
    {
      record: {
        title: 'Prompt temperature',
        hypothesis: 'Lower temperature reduces invented citations.',
        setup: '20 shared cases, temperature 0.2',
        result: '',
      },
    },
    '# Experiment log\n\nWrite the hypothesis, setup and result. T3X does not run a lab instrument.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'literature-notes',
    'Literature notes',
    'Keep paper notes and claims reviewable in one place.',
    ['science', 'research', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          claim: {
            type: 'string',
            minLength: 1,
          },
          evidence: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['claim'],
      },
    },
    {
      list: {
        title: 'Replay verification notes',
      },
      items: {
        first: {
          claim: 'Replay must ignore wall-clock time',
          evidence: 'Section 3.2',
        },
      },
    },
    '# Literature notes\n\nName the source and capture claims you may reuse. T3X does not fetch papers.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'protocol-steps',
    'Protocol steps',
    'Write a repeatable protocol as named, ordered steps.',
    ['science', 'research', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          step: {
            type: 'string',
            minLength: 1,
          },
          detail: {
            type: 'string',
            minLength: 1,
          },
          done: {
            type: 'boolean',
          },
        },
        requiredSlots: ['step', 'done'],
      },
    },
    {
      list: {
        title: 'Slide prep',
      },
      items: {
        fix: {
          step: 'Fix sample',
          detail: '10 minutes in buffer',
          done: false,
        },
      },
    },
    '# Protocol steps\n\nName each step and whether it is complete. T3X does not supervise a bench.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'dataset-card',
    'Dataset card',
    'Describe a dataset’s source, license and intended use.',
    ['science', 'research', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          name: {
            type: 'string',
            minLength: 1,
          },
          source: {
            type: 'string',
            minLength: 1,
          },
          license: {
            type: 'string',
            minLength: 1,
          },
          intended_use: {
            type: 'string',
          },
        },
        requiredSlots: ['name', 'source', 'license'],
      },
    },
    {
      record: {
        name: 'Replay fixtures',
        source: 'internal golden set',
        license: 'Apache-2.0',
        intended_use: '',
      },
    },
    '# Dataset card\n\nWrite the source, license and intended use. T3X does not host or sample the files.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'incident-log',
    'Incident log',
    'Capture an incident timeline and the reviewed response.',
    ['security', 'detection', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
          summary: {
            type: 'string',
            minLength: 1,
          },
          response: {
            type: 'string',
          },
        },
        requiredSlots: ['title', 'severity', 'summary'],
      },
    },
    {
      record: {
        title: 'Expired TLS certificate',
        severity: 'medium',
        summary: 'Public API rejected browsers',
        response: '',
      },
    },
    '# Incident log\n\nWrite the summary, severity and response. T3X does not page on-call or contain a host.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'access-review',
    'Access review',
    'Review who can reach a system and why that access remains.',
    ['security', 'detection', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          subject: {
            type: 'string',
            minLength: 1,
          },
          system: {
            type: 'string',
            minLength: 1,
          },
          access: {
            type: 'string',
            enum: ['keep', 'revoke', 'expire'],
          },
          reason: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['subject', 'system', 'access'],
      },
    },
    {
      list: {
        title: 'Q3 review',
      },
      items: {
        editor: {
          subject: 'maya',
          system: 'studio',
          access: 'keep',
          reason: 'Daily review duty',
        },
      },
    },
    '# Access review\n\nName the subject, system and decision. T3X does not change identity-provider grants.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'threat-note',
    'Threat note',
    'Write a threat, its asset and the accepted mitigation.',
    ['security', 'detection', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          asset: {
            type: 'string',
            minLength: 1,
          },
          threat: {
            type: 'string',
            minLength: 1,
          },
          mitigation: {
            type: 'string',
            minLength: 1,
          },
          status: {
            type: 'string',
            enum: ['open', 'accepted', 'transferred'],
          },
        },
        requiredSlots: ['asset', 'threat', 'mitigation'],
      },
    },
    {
      record: {
        asset: 'Catalog API',
        threat: 'Unreviewed community schema',
        mitigation: 'Publish only hashed official releases',
        status: 'open',
      },
    },
    '# Threat note\n\nName the asset, threat and mitigation. T3X does not scan or block traffic.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'vuln-triage',
    'Vuln triage',
    'Triage a vulnerability with severity and next action.',
    ['security', 'detection', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          identifier: {
            type: 'string',
            minLength: 1,
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          next_action: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['identifier', 'severity', 'next_action'],
      },
    },
    {
      record: {
        identifier: 'CVE-2026-1000',
        severity: 'high',
        next_action: 'Confirm affected images',
      },
    },
    '# Vuln triage\n\nRecord the identifier, severity and next action. T3X does not patch hosts.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'device-inventory',
    'Device inventory',
    'Keep a named inventory of devices and where they live.',
    ['devices', 'iot', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          name: {
            type: 'string',
            minLength: 1,
          },
          room: {
            type: 'string',
            minLength: 1,
          },
          firmware: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['name', 'room'],
      },
    },
    {
      list: {
        title: 'Apartment nodes',
      },
      items: {
        kitchen: {
          name: 'Kitchen sensor',
          room: 'kitchen',
          firmware: '2026.8.1',
        },
      },
    },
    '# Device inventory\n\nName each device, room and firmware note. T3X does not flash or poll hardware.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'sensor-log',
    'Sensor log',
    'Record a sensor reading with units and a reviewed note.',
    ['devices', 'iot', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          sensor: {
            type: 'string',
            minLength: 1,
          },
          value: {
            type: 'string',
            minLength: 1,
          },
          unit: {
            type: 'string',
            minLength: 1,
          },
          note: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['sensor', 'value', 'unit'],
      },
    },
    {
      list: {
        title: 'Kitchen temperature',
      },
      items: {
        morning: {
          sensor: 'kitchen-temp',
          value: '21.4',
          unit: 'C',
          note: 'After venting',
        },
      },
    },
    '# Sensor log\n\nWrite the sensor, value and unit. T3X does not sample a device.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'automation-rules',
    'Automation rules',
    'Review trigger and action text before enabling a rule.',
    ['devices', 'automation', 'iot', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          trigger: {
            type: 'string',
            minLength: 1,
          },
          action: {
            type: 'string',
            minLength: 1,
          },
          enabled: {
            type: 'boolean',
          },
        },
        requiredSlots: ['trigger', 'action', 'enabled'],
      },
    },
    {
      list: {
        title: 'Climate rules',
      },
      items: {
        heat: {
          trigger: 'Temperature below 18 C',
          action: 'Start the heater',
          enabled: true,
        },
      },
    },
    '# Automation rules\n\nWrite the trigger and action in reviewable text. T3X does not arm a controller.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'firmware-note',
    'Firmware note',
    'Record a firmware target and the reviewed rollout window.',
    ['devices', 'iot', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          device_class: {
            type: 'string',
            minLength: 1,
          },
          version: {
            type: 'string',
            minLength: 1,
          },
          window: {
            type: 'string',
          },
          notes: {
            type: 'string',
          },
        },
        requiredSlots: ['device_class', 'version'],
      },
    },
    {
      record: {
        device_class: 'hallway-sensor',
        version: '2026.9.1',
        window: '',
        notes: 'Wait for battery check',
      },
    },
    '# Firmware note\n\nName the device class, version and window. T3X does not flash firmware.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'metric-snapshot',
    'Metric snapshot',
    'Pin a named metric, value and comparison window.',
    ['data', 'visualization', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          metric: {
            type: 'string',
            minLength: 1,
          },
          window: {
            type: 'string',
            minLength: 1,
          },
          value: {
            type: 'string',
            minLength: 1,
          },
          note: {
            type: 'string',
          },
        },
        requiredSlots: ['metric', 'window', 'value'],
      },
    },
    {
      record: {
        metric: 'Weekly active editors',
        window: '2026-W36',
        value: '12',
        note: '',
      },
    },
    '# Metric snapshot\n\nName the metric, window and value. T3X does not query a warehouse.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'chart-spec',
    'Chart spec',
    'Describe a chart before someone builds it from reviewed data.',
    ['data', 'visualization', 'ecosystem:t3x'],
    {
      record: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
          kind: {
            type: 'string',
            enum: ['line', 'bar', 'area'],
          },
          series: {
            type: 'string',
            minLength: 1,
          },
          note: {
            type: 'string',
          },
        },
        requiredSlots: ['title', 'kind', 'series'],
      },
    },
    {
      record: {
        title: 'Review latency',
        kind: 'line',
        series: 'median hours to decide',
        note: '',
      },
    },
    '# Chart spec\n\nWrite the title, chart kind and series. T3X does not render analytics.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'data-contract',
    'Data contract',
    'Name a dataset field contract before producers change it.',
    ['data', 'visualization', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          field: {
            type: 'string',
            minLength: 1,
          },
          type: {
            type: 'string',
            minLength: 1,
          },
          required: {
            type: 'boolean',
          },
        },
        requiredSlots: ['field', 'type', 'required'],
      },
    },
    {
      list: {
        title: 'Commit export',
      },
      items: {
        hash: {
          field: 'commit_hash',
          type: 'string',
          required: true,
        },
      },
    },
    '# Data contract\n\nName each field and whether it is required. T3X does not migrate a table.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'meeting-notes',
    'Meeting notes',
    'Capture decisions and follow-ups from a working session.',
    ['planning', 'work', 'care', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          item: {
            type: 'string',
            minLength: 1,
          },
          owner: {
            type: 'string',
            minLength: 1,
          },
          done: {
            type: 'boolean',
          },
        },
        requiredSlots: ['item', 'done'],
      },
    },
    {
      list: {
        title: 'Schema catalog review',
      },
      items: {
        tags: {
          item: 'Agree category tags',
          owner: 'maya',
          done: false,
        },
      },
    },
    '# Meeting notes\n\nWrite the agenda outcome and follow-ups. T3X does not send calendar invites.\n\nT3X-authored; Apache-2.0.'
  ),
  starter(
    'weekly-goals',
    'Weekly goals',
    'Keep a short, reviewable list of goals for the week.',
    ['planning', 'work', 'care', 'ecosystem:t3x'],
    {
      list: {
        required: true,
        slots: {
          title: {
            type: 'string',
            minLength: 1,
          },
        },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: {
          goal: {
            type: 'string',
            minLength: 1,
          },
          done: {
            type: 'boolean',
          },
        },
        requiredSlots: ['goal', 'done'],
      },
    },
    {
      list: {
        title: 'Week 38',
      },
      items: {
        catalog: {
          goal: 'Categorize official starters',
          done: false,
        },
      },
    },
    '# Weekly goals\n\nName each goal and whether it is done. T3X does not track personal productivity software.\n\nT3X-authored; Apache-2.0.'
  ),
];
