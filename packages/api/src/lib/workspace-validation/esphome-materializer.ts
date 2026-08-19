import { createHash } from 'node:crypto';
import yaml from 'js-yaml';

export const ESPHOME_VALIDATION_WORKFLOW_NAME = 'workspace-validation/esphome-config@v0';
export const ESPHOME_VALIDATION_PROVIDER = 'local-oci';
export const ESPHOME_DEVICE_INPUT_REF = 'state://device';
export const ESPHOME_DEVICE_CONFIG_PATH = '/config/device.yaml';
export const ESPHOME_CONFIG_COMMAND = ['esphome', 'config', ESPHOME_DEVICE_CONFIG_PATH] as const;

const WORKFLOW_CONTRACT = {
  name: ESPHOME_VALIDATION_WORKFLOW_NAME,
  inputs: [
    {
      from: ESPHOME_DEVICE_INPUT_REF,
      format: 'yaml',
      to: ESPHOME_DEVICE_CONFIG_PATH,
    },
  ],
  required_steps: [
    'candidate-projection',
    'materialize-input',
    'local-oci-preflight',
    'esphome-config',
    'gate',
  ],
};

const VALIDATOR_CONTRACT = {
  provider: ESPHOME_VALIDATION_PROVIDER,
  workflow_name: ESPHOME_VALIDATION_WORKFLOW_NAME,
  command: ESPHOME_CONFIG_COMMAND,
};

export type EsphomeMaterializedFile = {
  from: typeof ESPHOME_DEVICE_INPUT_REF;
  to: typeof ESPHOME_DEVICE_CONFIG_PATH;
  format: 'yaml';
  content: string;
};

export interface MaterializeEsphomeDeviceInput {
  projectId: string;
  workspaceId: string;
  workspace: Record<string, unknown>;
}

export interface MaterializedEsphomeDeviceInput {
  project_id: string;
  workspace_id: string;
  subject_hash: string;
  input_hash: string;
  workflow_name: typeof ESPHOME_VALIDATION_WORKFLOW_NAME;
  workflow_hash: string;
  validator_hash: string;
  provider: typeof ESPHOME_VALIDATION_PROVIDER;
  files: [EsphomeMaterializedFile];
}

export class WorkspaceValidationMaterializerError extends Error {
  constructor(
    readonly code: 'VALIDATION_INPUT_NOT_SUPPORTED',
    message: string
  ) {
    super(message);
    this.name = 'WorkspaceValidationMaterializerError';
  }
}

export function materializeEsphomeDeviceInput(
  input: MaterializeEsphomeDeviceInput
): MaterializedEsphomeDeviceInput {
  const device = readDeviceState(input.workspace);
  const normalizedDevice = normalizeForMaterialization(device);
  const content = yaml.dump(normalizedDevice, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
  const file: EsphomeMaterializedFile = {
    from: ESPHOME_DEVICE_INPUT_REF,
    to: ESPHOME_DEVICE_CONFIG_PATH,
    format: 'yaml' as const,
    content,
  };

  return {
    project_id: input.projectId,
    workspace_id: input.workspaceId,
    subject_hash: stableHash(normalizedDevice),
    input_hash: stableHash({ files: [file] }),
    workflow_name: ESPHOME_VALIDATION_WORKFLOW_NAME,
    workflow_hash: stableHash(WORKFLOW_CONTRACT),
    validator_hash: stableHash(VALIDATOR_CONTRACT),
    provider: ESPHOME_VALIDATION_PROVIDER,
    files: [file],
  };
}

export function stableHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function readDeviceState(workspace: Record<string, unknown>): Record<string, unknown> {
  const device = workspace.device;
  if (!isRecord(device)) {
    throw new WorkspaceValidationMaterializerError(
      'VALIDATION_INPUT_NOT_SUPPORTED',
      'ESPHome validation requires workspace.device candidate state.'
    );
  }
  return device;
}

function normalizeForMaterialization(value: unknown, keyPath: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForMaterialization(item, keyPath));
  }
  if (!isRecord(value)) {
    if (value === undefined) return null;
    return isSecretKey(keyPath.at(-1)) ? redactSecretValue(value) : value;
  }

  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(
    entries.map(([key, item]) => [key, normalizeForMaterialization(item, [...keyPath, key])])
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSecretKey(key: string | undefined): boolean {
  if (!key) return false;
  return /(?:password|secret|token|key)/i.test(key);
}

function redactSecretValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value;
  return '__T3X_REDACTED_SECRET__';
}
