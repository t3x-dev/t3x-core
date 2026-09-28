import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const text = (minLength = 1) => ({ type: 'string', minLength });
const note = () => ({ type: 'string' });
const flag = () => ({ type: 'boolean' });
const choice = (values) => ({ type: 'string', enum: values });

function record(slots, requiredSlots, initial, revised) {
  return {
    nodes: {
      record: { required: true, slots, requiredSlots },
    },
    initial: { record: initial },
    demonstration: { record: revised },
  };
}

function listed(itemSlots, requiredSlots, initialItems, revisedItems) {
  return {
    nodes: {
      list: {
        required: true,
        slots: { title: text() },
        requiredSlots: ['title'],
      },
      items: {
        required: true,
        repeated: true,
        slots: itemSlots,
        requiredSlots,
      },
    },
    initial: { list: { title: initialItems.title }, items: initialItems.items },
    demonstration: { list: { title: revisedItems.title }, items: revisedItems.items },
  };
}

/** Discovery tags must include at least one catalog collection alias. */
export const extraOfficialStarterPacks = [
  {
    slug: 'env-config',
    title: 'Env config',
    description: 'Review named environment values before a service starts.',
    tags: ['infrastructure', 'devops', 'configuration', 'ecosystem:t3x'],
    color: '#2865d9',
    message: 'Pin the reviewed database URL',
    readme:
      '# Env config\n\nName each variable and keep the reviewed value next to its purpose. T3X checks declared fields; it does not load secrets or start a process.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { key: text(), value: text(), secret: flag() },
      ['key', 'value'],
      {
        title: 'API process',
        items: {
          database: { key: 'DATABASE_URL', value: 'postgres://localhost/app', secret: true },
        },
      },
      {
        title: 'API process',
        items: {
          database: { key: 'DATABASE_URL', value: 'postgres://localhost/app', secret: true },
          region: { key: 'T3X_REGION', value: 'local', secret: false },
        },
      }
    ),
  },
  {
    slug: 'scheduled-jobs',
    title: 'Scheduled jobs',
    description: 'Declare cron-like jobs and their expected cadence.',
    tags: ['infrastructure', 'devops', 'homelab', 'ecosystem:t3x'],
    color: '#1d4ed8',
    message: 'Add the nightly backup window',
    readme:
      '# Scheduled jobs\n\nRecord the job name, cadence and command text. T3X does not install cron or run the command.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { name: text(), cadence: text(), command: text() },
      ['name', 'cadence'],
      {
        title: 'Ops jobs',
        items: {
          prune: {
            name: 'Prune logs',
            cadence: '0 3 * * *',
            command: 'find /var/log -mtime +14 -delete',
          },
        },
      },
      {
        title: 'Ops jobs',
        items: {
          prune: {
            name: 'Prune logs',
            cadence: '0 3 * * *',
            command: 'find /var/log -mtime +14 -delete',
          },
          backup: {
            name: 'Backup volumes',
            cadence: '30 3 * * *',
            command: 'restic backup /var/lib/app',
          },
        },
      }
    ),
  },
  {
    slug: 'service-routes',
    title: 'Service routes',
    description: 'Review host and path routing before publishing an ingress.',
    tags: ['infrastructure', 'devops', 'configuration', 'ecosystem:t3x'],
    color: '#2563eb',
    message: 'Record the health path',
    readme:
      '# Service routes\n\nName each route, host and path. T3X checks the declared fields; it does not configure a proxy.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { host: text(), path: text(), target: text() },
      ['host', 'path', 'target'],
      {
        title: 'Public ingress',
        items: { web: { host: 'app.example.test', path: '/', target: 'web:3000' } },
      },
      {
        title: 'Public ingress',
        items: {
          web: { host: 'app.example.test', path: '/', target: 'web:3000' },
          health: { host: 'app.example.test', path: '/healthz', target: 'web:3000' },
        },
      }
    ),
  },
  {
    slug: 'backup-plan',
    title: 'Backup plan',
    description: 'Record backup targets, cadence and restore owners.',
    tags: ['infrastructure', 'homelab', 'devops', 'ecosystem:t3x'],
    color: '#1e40af',
    message: 'Name the restore owner',
    readme:
      '# Backup plan\n\nWrite the target, cadence and who restores it. T3X does not copy files or prove a restore works.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { target: text(), cadence: text(), owner: text(), notes: note() },
      ['target', 'cadence', 'owner'],
      { target: '/var/lib/app', cadence: 'nightly', owner: 'ops-oncall', notes: '' },
      {
        target: '/var/lib/app',
        cadence: 'nightly',
        owner: 'ops-oncall',
        notes: 'Restore drill every Friday.',
      }
    ),
  },
  {
    slug: 'prompt-pack',
    title: 'Prompt pack',
    description: 'Keep named prompts reviewable before they are reused.',
    tags: ['ai', 'agents', 'ecosystem:t3x'],
    color: '#7c3aed',
    message: 'Add the refusal prompt',
    readme:
      '# Prompt pack\n\nName each prompt and keep the reviewed text beside it. T3X does not call a model.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { name: text(), text: text(), audience: text() },
      ['name', 'text'],
      {
        title: 'Support prompts',
        items: {
          greeting: {
            name: 'Greeting',
            text: 'Reply briefly and name the next step.',
            audience: 'support',
          },
        },
      },
      {
        title: 'Support prompts',
        items: {
          greeting: {
            name: 'Greeting',
            text: 'Reply briefly and name the next step.',
            audience: 'support',
          },
          refusal: {
            name: 'Refusal',
            text: 'Decline unsafe requests and offer a safer alternative.',
            audience: 'support',
          },
        },
      }
    ),
  },
  {
    slug: 'evaluation-cases',
    title: 'Evaluation cases',
    description: 'Define reviewable cases before connecting an evaluation runner.',
    tags: ['ai', 'evaluation', 'agents', 'ecosystem:t3x'],
    color: '#6d28d9',
    message: 'Add the uncertainty case',
    readme:
      '# Evaluation cases\n\nName the case, input and expected signal. T3X does not score a model or run a harness.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { case: text(), input: text(), expected: text() },
      ['case', 'input', 'expected'],
      {
        title: 'Assistant checks',
        items: {
          greeting: {
            case: 'Greeting',
            input: 'Hello',
            expected: 'Friendly reply with a next step',
          },
        },
      },
      {
        title: 'Assistant checks',
        items: {
          greeting: {
            case: 'Greeting',
            input: 'Hello',
            expected: 'Friendly reply with a next step',
          },
          unknown: {
            case: 'Uncertainty',
            input: 'Unknown topic',
            expected: 'Acknowledge uncertainty',
          },
        },
      }
    ),
  },
  {
    slug: 'agent-handoff',
    title: 'Agent handoff',
    description: 'Record what an agent finished and what the next owner should do.',
    tags: ['ai', 'agents', 'ecosystem:t3x'],
    color: '#5b21b6',
    message: 'Name the next owner',
    readme:
      '# Agent handoff\n\nWrite the completed work, leftover risk and next owner. T3X does not resume an agent.\n\nT3X-authored; Apache-2.0.',
    ...record(
      {
        summary: text(),
        leftover: text(),
        next_owner: text(),
        status: choice(['open', 'accepted', 'blocked']),
      },
      ['summary', 'next_owner', 'status'],
      {
        summary: 'Drafted the weekly brief',
        leftover: 'Need cited sources',
        next_owner: 'editor',
        status: 'open',
      },
      {
        summary: 'Drafted the weekly brief',
        leftover: 'Need cited sources',
        next_owner: 'editor',
        status: 'accepted',
      }
    ),
  },
  {
    slug: 'tool-allowlist',
    title: 'Tool allowlist',
    description: 'Declare which tools an agent may mention before a run.',
    tags: ['ai', 'agents', 'ecosystem:t3x'],
    color: '#4c1d95',
    message: 'Allow the search tool',
    readme:
      '# Tool allowlist\n\nName each tool and whether it is allowed. This is a review list, not a runtime sandbox.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { tool: text(), allowed: flag(), reason: text() },
      ['tool', 'allowed'],
      {
        title: 'Research agent',
        items: { files: { tool: 'read_file', allowed: true, reason: 'Inspect local notes' } },
      },
      {
        title: 'Research agent',
        items: {
          files: { tool: 'read_file', allowed: true, reason: 'Inspect local notes' },
          search: { tool: 'web_search', allowed: true, reason: 'Cite public pages only' },
        },
      }
    ),
  },
  {
    slug: 'model-choice',
    title: 'Model choice',
    description: 'Record which model a task should use and why.',
    tags: ['ai', 'agents', 'ecosystem:t3x'],
    color: '#7e22ce',
    message: 'Record the fallback model',
    readme:
      '# Model choice\n\nName the task, selected model and fallback. T3X does not call a provider.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { task: text(), model: text(), fallback: note(), reason: text() },
      ['task', 'model'],
      {
        task: 'Draft review',
        model: 'claude-sonnet',
        fallback: '',
        reason: 'Long structured edits',
      },
      {
        task: 'Draft review',
        model: 'claude-sonnet',
        fallback: 'gpt-5.4',
        reason: 'Long structured edits',
      }
    ),
  },
  {
    slug: 'experiment-log',
    title: 'Experiment log',
    description: 'Capture a hypothesis, setup and observed result.',
    tags: ['science', 'research', 'ecosystem:t3x'],
    color: '#0f766e',
    message: 'Record the observed result',
    readme:
      '# Experiment log\n\nWrite the hypothesis, setup and result. T3X does not run a lab instrument.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { title: text(), hypothesis: text(), setup: text(), result: note() },
      ['title', 'hypothesis'],
      {
        title: 'Prompt temperature',
        hypothesis: 'Lower temperature reduces invented citations.',
        setup: '20 shared cases, temperature 0.2',
        result: '',
      },
      {
        title: 'Prompt temperature',
        hypothesis: 'Lower temperature reduces invented citations.',
        setup: '20 shared cases, temperature 0.2',
        result: 'Invented citations dropped from 4 to 1.',
      }
    ),
  },
  {
    slug: 'literature-notes',
    title: 'Literature notes',
    description: 'Keep paper notes and claims reviewable in one place.',
    tags: ['science', 'research', 'ecosystem:t3x'],
    color: '#0d9488',
    message: 'Add the second claim',
    readme:
      '# Literature notes\n\nName the source and capture claims you may reuse. T3X does not fetch papers.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { claim: text(), evidence: text() },
      ['claim'],
      {
        title: 'Replay verification notes',
        items: { first: { claim: 'Replay must ignore wall-clock time', evidence: 'Section 3.2' } },
      },
      {
        title: 'Replay verification notes',
        items: {
          first: { claim: 'Replay must ignore wall-clock time', evidence: 'Section 3.2' },
          second: { claim: 'Rejected decisions stay auditable', evidence: 'Section 4.1' },
        },
      }
    ),
  },
  {
    slug: 'protocol-steps',
    title: 'Protocol steps',
    description: 'Write a repeatable protocol as named, ordered steps.',
    tags: ['science', 'research', 'ecosystem:t3x'],
    color: '#115e59',
    message: 'Mark the rinse step done',
    readme:
      '# Protocol steps\n\nName each step and whether it is complete. T3X does not supervise a bench.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { step: text(), detail: text(), done: flag() },
      ['step', 'done'],
      {
        title: 'Slide prep',
        items: { fix: { step: 'Fix sample', detail: '10 minutes in buffer', done: false } },
      },
      {
        title: 'Slide prep',
        items: {
          fix: { step: 'Fix sample', detail: '10 minutes in buffer', done: true },
          rinse: { step: 'Rinse', detail: 'Two distilled-water rinses', done: false },
        },
      }
    ),
  },
  {
    slug: 'dataset-card',
    title: 'Dataset card',
    description: 'Describe a dataset’s source, license and intended use.',
    tags: ['science', 'research', 'ecosystem:t3x'],
    color: '#134e4a',
    message: 'Record the intended use',
    readme:
      '# Dataset card\n\nWrite the source, license and intended use. T3X does not host or sample the files.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { name: text(), source: text(), license: text(), intended_use: note() },
      ['name', 'source', 'license'],
      {
        name: 'Replay fixtures',
        source: 'internal golden set',
        license: 'Apache-2.0',
        intended_use: '',
      },
      {
        name: 'Replay fixtures',
        source: 'internal golden set',
        license: 'Apache-2.0',
        intended_use: 'Deterministic replay checks only.',
      }
    ),
  },
  {
    slug: 'incident-log',
    title: 'Incident log',
    description: 'Capture an incident timeline and the reviewed response.',
    tags: ['security', 'detection', 'ecosystem:t3x'],
    color: '#b45309',
    message: 'Record the reviewed response',
    readme:
      '# Incident log\n\nWrite the summary, severity and response. T3X does not page on-call or contain a host.\n\nT3X-authored; Apache-2.0.',
    ...record(
      {
        title: text(),
        severity: choice(['low', 'medium', 'high']),
        summary: text(),
        response: note(),
      },
      ['title', 'severity', 'summary'],
      {
        title: 'Expired TLS certificate',
        severity: 'medium',
        summary: 'Public API rejected browsers',
        response: '',
      },
      {
        title: 'Expired TLS certificate',
        severity: 'medium',
        summary: 'Public API rejected browsers',
        response: 'Renewed the certificate and added a 14-day reminder.',
      }
    ),
  },
  {
    slug: 'access-review',
    title: 'Access review',
    description: 'Review who can reach a system and why that access remains.',
    tags: ['security', 'detection', 'ecosystem:t3x'],
    color: '#c2410c',
    message: 'Mark the intern access as revoked',
    readme:
      '# Access review\n\nName the subject, system and decision. T3X does not change identity-provider grants.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      {
        subject: text(),
        system: text(),
        access: choice(['keep', 'revoke', 'expire']),
        reason: text(),
      },
      ['subject', 'system', 'access'],
      {
        title: 'Q3 review',
        items: {
          editor: {
            subject: 'maya',
            system: 'studio',
            access: 'keep',
            reason: 'Daily review duty',
          },
        },
      },
      {
        title: 'Q3 review',
        items: {
          editor: {
            subject: 'maya',
            system: 'studio',
            access: 'keep',
            reason: 'Daily review duty',
          },
          intern: {
            subject: 'lee',
            system: 'studio',
            access: 'revoke',
            reason: 'Internship ended',
          },
        },
      }
    ),
  },
  {
    slug: 'threat-note',
    title: 'Threat note',
    description: 'Write a threat, its asset and the accepted mitigation.',
    tags: ['security', 'detection', 'ecosystem:t3x'],
    color: '#9a3412',
    message: 'Accept the mitigation',
    readme:
      '# Threat note\n\nName the asset, threat and mitigation. T3X does not scan or block traffic.\n\nT3X-authored; Apache-2.0.',
    ...record(
      {
        asset: text(),
        threat: text(),
        mitigation: text(),
        status: choice(['open', 'accepted', 'transferred']),
      },
      ['asset', 'threat', 'mitigation'],
      {
        asset: 'Catalog API',
        threat: 'Unreviewed community schema',
        mitigation: 'Publish only hashed official releases',
        status: 'open',
      },
      {
        asset: 'Catalog API',
        threat: 'Unreviewed community schema',
        mitigation: 'Publish only hashed official releases',
        status: 'accepted',
      }
    ),
  },
  {
    slug: 'vuln-triage',
    title: 'Vuln triage',
    description: 'Triage a vulnerability with severity and next action.',
    tags: ['security', 'detection', 'ecosystem:t3x'],
    color: '#7c2d12',
    message: 'Schedule the patch window',
    readme:
      '# Vuln triage\n\nRecord the identifier, severity and next action. T3X does not patch hosts.\n\nT3X-authored; Apache-2.0.',
    ...record(
      {
        identifier: text(),
        severity: choice(['low', 'medium', 'high', 'critical']),
        next_action: text(),
      },
      ['identifier', 'severity', 'next_action'],
      { identifier: 'CVE-2026-1000', severity: 'high', next_action: 'Confirm affected images' },
      { identifier: 'CVE-2026-1000', severity: 'high', next_action: 'Patch staging on Friday' }
    ),
  },
  {
    slug: 'device-inventory',
    title: 'Device inventory',
    description: 'Keep a named inventory of devices and where they live.',
    tags: ['devices', 'iot', 'ecosystem:t3x'],
    color: '#0369a1',
    message: 'Add the hallway sensor',
    readme:
      '# Device inventory\n\nName each device, room and firmware note. T3X does not flash or poll hardware.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { name: text(), room: text(), firmware: text() },
      ['name', 'room'],
      {
        title: 'Apartment nodes',
        items: { kitchen: { name: 'Kitchen sensor', room: 'kitchen', firmware: '2026.8.1' } },
      },
      {
        title: 'Apartment nodes',
        items: {
          kitchen: { name: 'Kitchen sensor', room: 'kitchen', firmware: '2026.8.1' },
          hall: { name: 'Hallway sensor', room: 'hallway', firmware: '2026.8.1' },
        },
      }
    ),
  },
  {
    slug: 'sensor-log',
    title: 'Sensor log',
    description: 'Record a sensor reading with units and a reviewed note.',
    tags: ['devices', 'iot', 'ecosystem:t3x'],
    color: '#0284c7',
    message: 'Add the afternoon reading',
    readme:
      '# Sensor log\n\nWrite the sensor, value and unit. T3X does not sample a device.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { sensor: text(), value: text(), unit: text(), note: text() },
      ['sensor', 'value', 'unit'],
      {
        title: 'Kitchen temperature',
        items: {
          morning: { sensor: 'kitchen-temp', value: '21.4', unit: 'C', note: 'After venting' },
        },
      },
      {
        title: 'Kitchen temperature',
        items: {
          morning: { sensor: 'kitchen-temp', value: '21.4', unit: 'C', note: 'After venting' },
          afternoon: { sensor: 'kitchen-temp', value: '23.1', unit: 'C', note: 'Oven on' },
        },
      }
    ),
  },
  {
    slug: 'automation-rules',
    title: 'Automation rules',
    description: 'Review trigger and action text before enabling a rule.',
    tags: ['devices', 'automation', 'iot', 'ecosystem:t3x'],
    color: '#075985',
    message: 'Add the night fallback',
    readme:
      '# Automation rules\n\nWrite the trigger and action in reviewable text. T3X does not arm a controller.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { trigger: text(), action: text(), enabled: flag() },
      ['trigger', 'action', 'enabled'],
      {
        title: 'Climate rules',
        items: {
          heat: { trigger: 'Temperature below 18 C', action: 'Start the heater', enabled: true },
        },
      },
      {
        title: 'Climate rules',
        items: {
          heat: { trigger: 'Temperature below 18 C', action: 'Start the heater', enabled: true },
          night: { trigger: 'After 23:00', action: 'Set heater to eco', enabled: false },
        },
      }
    ),
  },
  {
    slug: 'firmware-note',
    title: 'Firmware note',
    description: 'Record a firmware target and the reviewed rollout window.',
    tags: ['devices', 'iot', 'ecosystem:t3x'],
    color: '#0c4a6e',
    message: 'Set the rollout window',
    readme:
      '# Firmware note\n\nName the device class, version and window. T3X does not flash firmware.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { device_class: text(), version: text(), window: note(), notes: note() },
      ['device_class', 'version'],
      {
        device_class: 'hallway-sensor',
        version: '2026.9.1',
        window: '',
        notes: 'Wait for battery check',
      },
      {
        device_class: 'hallway-sensor',
        version: '2026.9.1',
        window: 'Sunday 02:00',
        notes: 'Wait for battery check',
      }
    ),
  },
  {
    slug: 'metric-snapshot',
    title: 'Metric snapshot',
    description: 'Pin a named metric, value and comparison window.',
    tags: ['data', 'visualization', 'ecosystem:t3x'],
    color: '#4338ca',
    message: 'Record this week’s value',
    readme:
      '# Metric snapshot\n\nName the metric, window and value. T3X does not query a warehouse.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { metric: text(), window: text(), value: text(), note: note() },
      ['metric', 'window', 'value'],
      { metric: 'Weekly active editors', window: '2026-W36', value: '12', note: '' },
      {
        metric: 'Weekly active editors',
        window: '2026-W36',
        value: '12',
        note: 'Two new reviewers joined.',
      }
    ),
  },
  {
    slug: 'chart-spec',
    title: 'Chart spec',
    description: 'Describe a chart before someone builds it from reviewed data.',
    tags: ['data', 'visualization', 'ecosystem:t3x'],
    color: '#3730a3',
    message: 'Choose the comparison series',
    readme:
      '# Chart spec\n\nWrite the title, chart kind and series. T3X does not render analytics.\n\nT3X-authored; Apache-2.0.',
    ...record(
      { title: text(), kind: choice(['line', 'bar', 'area']), series: text(), note: note() },
      ['title', 'kind', 'series'],
      { title: 'Review latency', kind: 'line', series: 'median hours to decide', note: '' },
      {
        title: 'Review latency',
        kind: 'line',
        series: 'median hours to decide vs p90',
        note: 'Show both series.',
      }
    ),
  },
  {
    slug: 'data-contract',
    title: 'Data contract',
    description: 'Name a dataset field contract before producers change it.',
    tags: ['data', 'visualization', 'ecosystem:t3x'],
    color: '#312e81',
    message: 'Require the commit digest',
    readme:
      '# Data contract\n\nName each field and whether it is required. T3X does not migrate a table.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { field: text(), type: text(), required: flag() },
      ['field', 'type', 'required'],
      {
        title: 'Commit export',
        items: { hash: { field: 'commit_hash', type: 'string', required: true } },
      },
      {
        title: 'Commit export',
        items: {
          hash: { field: 'commit_hash', type: 'string', required: true },
          digest: { field: 'content_digest', type: 'string', required: true },
        },
      }
    ),
  },
  {
    slug: 'meeting-notes',
    title: 'Meeting notes',
    description: 'Capture decisions and follow-ups from a working session.',
    tags: ['planning', 'work', 'care', 'ecosystem:t3x'],
    color: '#14886b',
    message: 'Add the follow-up owner',
    readme:
      '# Meeting notes\n\nWrite the agenda outcome and follow-ups. T3X does not send calendar invites.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { item: text(), owner: text(), done: flag() },
      ['item', 'done'],
      {
        title: 'Schema catalog review',
        items: { tags: { item: 'Agree category tags', owner: 'maya', done: false } },
      },
      {
        title: 'Schema catalog review',
        items: {
          tags: { item: 'Agree category tags', owner: 'maya', done: true },
          readme: { item: 'Publish starter READMEs', owner: 'lee', done: false },
        },
      }
    ),
  },
  {
    slug: 'weekly-goals',
    title: 'Weekly goals',
    description: 'Keep a short, reviewable list of goals for the week.',
    tags: ['planning', 'work', 'care', 'ecosystem:t3x'],
    color: '#0f766e',
    message: 'Check the first goal',
    readme:
      '# Weekly goals\n\nName each goal and whether it is done. T3X does not track personal productivity software.\n\nT3X-authored; Apache-2.0.',
    ...listed(
      { goal: text(), done: flag() },
      ['goal', 'done'],
      {
        title: 'Week 38',
        items: { catalog: { goal: 'Categorize official starters', done: false } },
      },
      {
        title: 'Week 38',
        items: {
          catalog: { goal: 'Categorize official starters', done: true },
          review: { goal: 'Review the backup plan starter', done: false },
        },
      }
    ),
  },
];

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

export function writeSolidPng(path, hex) {
  const width = 256;
  const height = 256;
  const rgb = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((part) => Number.parseInt(part, 16));
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return writeFile(path, png);
}

function avatarSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="40" fill="${color}"/><circle cx="238" cy="12" r="100" fill="white" opacity=".08"/><g fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><rect x="63" y="43" width="130" height="142" rx="18"/><path d="M91 82h74M91 108h74M91 134h45"/></g><rect x="77" y="202" width="102" height="34" rx="17" fill="white" fill-opacity=".18"/><text x="128" y="226" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="700" font-size="22" letter-spacing="3">T3X</text></svg>\n`;
}

function projectReadme(pack) {
  return `# ${pack.title}

${pack.description}

## Start here

1. Read the rendered State beside this introduction.
2. Open History to compare the initial example with the demonstration change.
3. Edit a copy for your own work and review the resulting diff before committing.

## What is included

| Source | Purpose |
| --- | --- |
| Initial State | A small, editable example |
| Demonstration commit | ${pack.message} |
| \`t3x/${pack.slug}@1.0.0\` | Companion YSchema definition; binding remains explicit |

## Verification boundary

${pack.readme.split('\n\n')[1] ?? 'T3X checks declared fields only.'}

The demo commits are real versioned changes to sample content. They are not evidence of a deployed service, a completed task or AI execution. The project remains private until its owner explicitly publishes it.

## License

Original T3X example. Apache-2.0. The avatar is T3X-authored branding, not an independent verification badge.
`;
}

function jsString(value) {
  return JSON.stringify(value, null, 2);
}

function emitTs() {
  const entries = extraOfficialStarterPacks.map((pack) => {
    return `  starter(
    ${jsString(pack.slug)},
    ${jsString(pack.title)},
    ${jsString(pack.description)},
    ${jsString(pack.tags)},
    ${jsString(pack.nodes)},
    ${jsString(pack.initial)},
    ${jsString(pack.readme)}
  )`;
  });
  return `import type { NodeSchema, YSchemaModuleArtifactV2 } from '@t3x-dev/yschema';

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
    canonicalName: \`t3x/\${slug}\`,
    version: '1.0.0',
    title,
    description,
    status: 'published',
    source: 'official',
    license: 'Apache-2.0',
    tags,
    compatibility: { yschema: ['0.1'] },
    provides: [{ capability: \`t3x.starter.\${slug}\`, version: 1 }],
    imports: [],
    contribution: { nodes },
    starter: sample,
    readme,
  };
}

export const extraSchemaEcosystemStarters: Starter[] = [
${entries.join(',\n')},
];
`;
}

export async function writeOfficialStarterExtras() {
  const tsPath = resolve(repoRoot, 'packages/api/src/lib/schema-ecosystem-extra-starters.ts');
  await writeFile(tsPath, emitTs());
  for (const pack of extraOfficialStarterPacks) {
    const dir = resolve(repoRoot, 'examples/official-projects', pack.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      resolve(dir, 'project.json'),
      `${JSON.stringify(
        {
          slug: pack.slug,
          title: pack.title,
          description: pack.description,
          license: 'Apache-2.0',
          tags: pack.tags,
          companionSchema: { canonicalName: `t3x/${pack.slug}`, version: '1.0.0' },
          initial: pack.initial,
          demonstration: { message: pack.message, value: pack.demonstration },
        },
        null,
        2
      )}\n`
    );
    await writeFile(resolve(dir, 'README.md'), projectReadme(pack));
    await writeFile(resolve(dir, 'avatar.svg'), avatarSvg(pack.color));
    await writeSolidPng(resolve(dir, 'avatar.png'), pack.color);
  }
}

const existingAvatars = [
  ['product-brief', '#6554d9'],
  ['care-checklist', '#14886b'],
  ['compose-services', '#2865d9'],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeOfficialStarterExtras();
  for (const [slug, color] of existingAvatars) {
    await writeSolidPng(resolve(repoRoot, 'examples/official-projects', slug, 'avatar.png'), color);
  }
}
