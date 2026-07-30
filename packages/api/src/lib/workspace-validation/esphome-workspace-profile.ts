import yaml from 'js-yaml';

export const ESPHOME_DEVICE_CANONICAL_NAME = 't3x/esphome-device';
export const ESPHOME_DEVICE_SCHEMA_VERSION = 'v1';
export const ESPHOME_DEVICE_SCHEMA_HASH =
  'sha256:4dadbf6d65b4bd1f0310be317b9b0cfb90edfbcf293fe1d8bc60a0b07f05675d';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface WorkspaceSourceText {
  id: string;
  title: string;
  text: string;
}

type ExtractEsphomeDeviceResult =
  | {
      ok: true;
      device: Record<string, JsonValue>;
      esphomeName: string;
      source: WorkspaceSourceText;
    }
  | { ok: false; message: string };

export function isEsphomeDeviceWorkspace(workspace: Record<string, unknown>): boolean {
  const binding = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings[0] : null;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false;
  const record = binding as Record<string, unknown>;
  return (
    isEsphomeDeviceBindingName(record) &&
    isSupportedEsphomeDeviceBindingVersion(record.version) &&
    isSupportedEsphomeDeviceBindingHash(record.schemaHash)
  );
}

function isEsphomeDeviceBindingName(record: Record<string, unknown>): boolean {
  const canonicalName = record.canonicalName;
  const schemaName = record.schemaName;
  return (
    (typeof canonicalName === 'string' &&
      canonicalName.trim().toLowerCase() === ESPHOME_DEVICE_CANONICAL_NAME) ||
    (typeof schemaName === 'string' && /esphome\s+device/i.test(schemaName))
  );
}

function isSupportedEsphomeDeviceBindingVersion(version: unknown): boolean {
  return (
    version === undefined ||
    (typeof version === 'string' && version.trim().toLowerCase() === ESPHOME_DEVICE_SCHEMA_VERSION)
  );
}

function isSupportedEsphomeDeviceBindingHash(schemaHash: unknown): boolean {
  return (
    schemaHash === undefined ||
    (typeof schemaHash === 'string' &&
      schemaHash.trim().toLowerCase() === ESPHOME_DEVICE_SCHEMA_HASH)
  );
}

export function buildEsphomeDeviceWorkspace(
  workspace: Record<string, unknown>,
  projectId: string,
  sourceTexts: WorkspaceSourceText[],
  candidateId: string
): { ok: true; workspace: Record<string, unknown> } | { ok: false; message: string } {
  const extracted = extractEsphomeDeviceFromSources(sourceTexts);
  if (!extracted.ok) return extracted;

  const { device, esphomeName, source } = extracted;
  return {
    ok: true,
    workspace: {
      ...workspace,
      projectId,
      device,
      schemaCandidate: buildEsphomeDeviceSchemaCandidate(device, esphomeName, source),
      schemaReview: {
        verdict: 'ready',
        summary: 'ESPHome Device source produced device state for deterministic YOps validation.',
        gaps: [],
      },
      yopsDraft: buildEsphomeDeviceYOpsDraft(device, candidateId, source),
    },
  };
}

function extractEsphomeDeviceFromSources(
  sourceTexts: WorkspaceSourceText[]
): ExtractEsphomeDeviceResult {
  if (!sourceTexts.length) {
    return { ok: false, message: 'Add ESPHome YAML source before regenerating this Workspace.' };
  }

  let lastError = 'ESPHome Device source must contain ESPHome YAML.';
  for (const source of [...sourceTexts].reverse()) {
    const result = extractEsphomeDeviceFromSource(source);
    if (result.ok) return result;
    lastError = result.message;
  }

  return { ok: false, message: lastError };
}

function extractEsphomeDeviceFromSource(source: WorkspaceSourceText): ExtractEsphomeDeviceResult {
  let docs: unknown[];
  try {
    docs = yaml.loadAll(source.text);
  } catch {
    return { ok: false, message: 'ESPHome Device source must be valid YAML.' };
  }

  if (docs.length !== 1) {
    return { ok: false, message: 'ESPHome Device source must contain one YAML document.' };
  }

  const parsed = docs[0];
  if (!isRecord(parsed)) {
    return { ok: false, message: 'ESPHome Device source must be a YAML mapping.' };
  }

  const candidateDevice = 'device' in parsed ? parsed.device : parsed;
  if (!isRecord(candidateDevice)) {
    return { ok: false, message: 'ESPHome Device source must be a YAML mapping.' };
  }
  if (!isJsonRecord(candidateDevice)) {
    return { ok: false, message: 'ESPHome Device source must use JSON-compatible YAML values.' };
  }

  const esphome = candidateDevice.esphome;
  if (!isRecord(esphome)) {
    return { ok: false, message: 'ESPHome Device requires esphome.name.' };
  }

  const name = esphome.name;
  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, message: 'ESPHome Device requires esphome.name.' };
  }

  return {
    ok: true,
    device: candidateDevice,
    esphomeName: name.trim(),
    source,
  };
}

function buildEsphomeDeviceSchemaCandidate(
  device: Record<string, JsonValue>,
  esphomeName: string,
  source: WorkspaceSourceText
) {
  const board = deviceBoard(device);
  return {
    proposalMode: 'deterministic_scaffold',
    summary: `ESPHome Device mapped from ${source.title}.`,
    fields: [
      {
        id: 'field_device',
        path: 'device',
        label: 'Device',
        type: 'object',
        required: true,
        status: 'covered',
        value: `esphome.name: ${esphomeName}`,
        evidence: `${source.title}: esphome.name ${esphomeName}`,
        sourceRefs: 1,
        children: [
          {
            id: 'field_device_esphome_name',
            path: 'device.esphome.name',
            label: 'ESPHome name',
            type: 'string',
            required: true,
            status: 'covered',
            value: esphomeName,
            evidence: `${source.title}: esphome.name ${esphomeName}`,
            sourceRefs: 1,
          },
          ...(board
            ? [
                {
                  id: 'field_device_board',
                  path: board.path,
                  label: 'Board',
                  type: 'string',
                  required: false,
                  status: 'covered',
                  value: board.value,
                  evidence: `${source.title}: ${board.path} ${board.value}`,
                  sourceRefs: 1,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function buildEsphomeDeviceYOpsDraft(
  device: Record<string, JsonValue>,
  candidateId: string,
  source: WorkspaceSourceText
) {
  return {
    id: `draft:${candidateId}`,
    proposalMode: 'deterministic_scaffold',
    operations: [
      {
        id: 'op_esphome_device',
        op: 'set',
        path: 'device',
        summary: 'Set ESPHome device config from YAML source.',
        beforeValue: '',
        afterValue: device,
        reason: `ESPHome Device source ${source.title} produced device state.`,
        sourceRefs: [source.id],
      },
    ],
  };
}

function deviceBoard(device: Record<string, JsonValue>): { path: string; value: string } | null {
  for (const platform of ['esp32', 'esp8266', 'bk72xx', 'rp2040']) {
    const value = device[platform];
    if (!isRecord(value)) continue;
    const board = value.board;
    if (typeof board === 'string' && board.trim()) {
      return { path: `device.${platform}.board`, value: board.trim() };
    }
  }
  return null;
}

function isJsonRecord(value: Record<string, unknown>): value is Record<string, JsonValue> {
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && isJsonRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
