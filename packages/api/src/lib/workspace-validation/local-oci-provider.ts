import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ESPHOME_CONFIG_COMMAND,
  ESPHOME_DEVICE_CONFIG_PATH,
  stableHash,
} from './esphome-materializer';

export const ESPHOME_OCI_IMAGE = 'ghcr.io/esphome/esphome:2025.6';
export const LOCAL_OCI_PREFLIGHT_STEP_ID = 'local-oci-preflight';
export const ESPHOME_CONFIG_STEP_ID = 'esphome-config';
export const OCI_RUNTIME_MISSING_CODE = 'OCI_RUNTIME_MISSING';
export const OCI_RUNTIME_FAILED_CODE = 'OCI_RUNTIME_FAILED';
export const ESPHOME_CONFIG_FAILED_CODE = 'ESPHOME_CONFIG_FAILED';
export const ESPHOME_CONFIG_TIMED_OUT_CODE = 'ESPHOME_CONFIG_TIMED_OUT';

const DEFAULT_PREFLIGHT_TIMEOUT_MS = 5_000;
const DEFAULT_CONFIG_TIMEOUT_MS = 120_000;
const LOG_EXCERPT_LIMIT = 8_000;
const PROCESS_OUTPUT_LIMIT = 64_000;
const CONFIG_CONTAINER_DIR = '/config';
const ESPHOME_CONFIG_CONTAINER_COMMAND = ['config', ESPHOME_DEVICE_CONFIG_PATH] as const;

type LocalOciRuntime = 'docker' | 'podman';

export interface LocalOciCommandOptions {
  timeoutMs?: number;
}

export interface LocalOciCommandResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out?: boolean;
  output_truncated?: boolean;
  error?: {
    code?: string;
    message: string;
  };
}

export type LocalOciCommandExecutor = (
  command: string,
  args: string[],
  options?: LocalOciCommandOptions
) => Promise<LocalOciCommandResult>;

export interface RunLocalEsphomeConfigValidationOptions {
  executor?: LocalOciCommandExecutor;
  image?: string;
  tempRoot?: string;
  preflightTimeoutMs?: number;
  configTimeoutMs?: number;
}

export interface LocalEsphomeValidationStep {
  step_id: typeof LOCAL_OCI_PREFLIGHT_STEP_ID | typeof ESPHOME_CONFIG_STEP_ID;
  name: string;
  status: 'passed' | 'failed' | 'environment_required' | 'timed_out';
  summary: string;
  error_code: string | null;
  exit_code: number | null;
  duration_ms: number;
  command_json: unknown[] | null;
  log_excerpt: string | null;
  log_truncated: boolean;
  result_json: Record<string, unknown>;
}

export interface LocalEsphomeValidationFinding {
  severity: 'error';
  file: string | null;
  line: number | null;
  state_path: string | null;
  code: string;
  message: string;
  log_excerpt: string | null;
  evidence_json: Record<string, unknown>;
}

export interface LocalEsphomeValidationResult {
  status: 'passed' | 'failed' | 'environment_required' | 'timed_out';
  gate_status: 'ready' | 'blocked';
  summary: string;
  environment_hash: string | null;
  step: LocalEsphomeValidationStep;
  findings: LocalEsphomeValidationFinding[];
}

interface RuntimePreflightAttempt {
  runtime: LocalOciRuntime;
  exit_code: number | null;
  timed_out: boolean;
  error_code: string | null;
}

interface RuntimePreflightResult {
  runtime: LocalOciRuntime | null;
  attempts: RuntimePreflightAttempt[];
}

export async function runLocalEsphomeConfigValidation(
  input: { deviceYaml: string },
  options: RunLocalEsphomeConfigValidationOptions = {}
): Promise<LocalEsphomeValidationResult> {
  const executor = options.executor ?? executeLocalOciCommand;
  const image = options.image ?? ESPHOME_OCI_IMAGE;
  const startedAt = Date.now();
  const preflight = await findLocalOciRuntime(executor, options.preflightTimeoutMs);
  if (!preflight.runtime) {
    const durationMs = Date.now() - startedAt;
    return {
      status: 'environment_required',
      gate_status: 'blocked',
      summary: 'Local OCI runtime is not available.',
      environment_hash: null,
      step: {
        step_id: LOCAL_OCI_PREFLIGHT_STEP_ID,
        name: 'Local OCI preflight',
        status: 'environment_required',
        summary: 'Local OCI runtime is not available.',
        error_code: OCI_RUNTIME_MISSING_CODE,
        exit_code: null,
        duration_ms: durationMs,
        command_json: null,
        log_excerpt: null,
        log_truncated: false,
        result_json: { attempted_runtimes: preflight.attempts },
      },
      findings: [
        {
          severity: 'error',
          file: null,
          line: null,
          state_path: null,
          code: OCI_RUNTIME_MISSING_CODE,
          message: 'Docker or Podman is required to run ESPHome validation.',
          log_excerpt: null,
          evidence_json: { attempted_runtimes: preflight.attempts },
        },
      ],
    };
  }

  return runEsphomeConfigInRuntime(input.deviceYaml, {
    executor,
    image,
    runtime: preflight.runtime,
    tempRoot: options.tempRoot,
    timeoutMs: options.configTimeoutMs,
  });
}

export const executeLocalOciCommand: LocalOciCommandExecutor = (command, args, options = {}) => {
  return new Promise((resolve) => {
    const stdout = createOutputCollector();
    const stderr = createOutputCollector();
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeout =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, options.timeoutMs)
        : null;

    const settle = (result: LocalOciCommandResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };

    child.stdout.on('data', (chunk: Buffer) => stdout.append(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.append(chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      settle({
        exit_code: null,
        stdout: stdout.value,
        stderr: stderr.value,
        timed_out: timedOut,
        output_truncated: stdout.truncated || stderr.truncated,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    });
    child.on('close', (code) => {
      settle({
        exit_code: code,
        stdout: stdout.value,
        stderr: stderr.value,
        timed_out: timedOut,
        output_truncated: stdout.truncated || stderr.truncated,
      });
    });
  });
};

async function findLocalOciRuntime(
  executor: LocalOciCommandExecutor,
  timeoutMs = DEFAULT_PREFLIGHT_TIMEOUT_MS
): Promise<RuntimePreflightResult> {
  const attempts: RuntimePreflightAttempt[] = [];

  for (const runtime of ['docker', 'podman'] as const) {
    const result = await executor(runtime, ['info'], { timeoutMs });
    attempts.push({
      runtime,
      exit_code: result.exit_code,
      timed_out: Boolean(result.timed_out),
      error_code: result.error?.code ?? null,
    });
    if (result.exit_code === 0 && !result.timed_out) {
      return { runtime, attempts };
    }
  }

  return { runtime: null, attempts };
}

async function runEsphomeConfigInRuntime(
  deviceYaml: string,
  input: {
    executor: LocalOciCommandExecutor;
    image: string;
    runtime: LocalOciRuntime;
    tempRoot?: string;
    timeoutMs?: number;
  }
): Promise<LocalEsphomeValidationResult> {
  const tempDir = await mkdtemp(path.join(input.tempRoot ?? tmpdir(), 't3x-esphome-'));
  const configDir = path.join(tempDir, 'config');
  const startedAt = Date.now();

  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'device.yaml'), deviceYaml, 'utf8');

    const ociCommand = buildOciRunCommand(input.runtime, configDir, input.image);
    const result = await input.executor(ociCommand.command, ociCommand.args, {
      timeoutMs: input.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    });
    const durationMs = Date.now() - startedAt;
    const log = buildBoundedLog(result);

    if (result.exit_code === 0) {
      return {
        status: 'passed',
        gate_status: 'ready',
        summary: 'ESPHome config passed.',
        environment_hash: runtimeEnvironmentHash(input.runtime, input.image),
        step: configStep({
          status: 'passed',
          summary: 'ESPHome config passed.',
          errorCode: null,
          exitCode: result.exit_code,
          durationMs,
          log,
          runtime: input.runtime,
          image: input.image,
          ociCommand,
        }),
        findings: [],
      };
    }

    if (result.timed_out) {
      return {
        status: 'timed_out',
        gate_status: 'blocked',
        summary: 'ESPHome config timed out.',
        environment_hash: runtimeEnvironmentHash(input.runtime, input.image),
        step: configStep({
          status: 'timed_out',
          summary: 'ESPHome config timed out.',
          errorCode: ESPHOME_CONFIG_TIMED_OUT_CODE,
          exitCode: result.exit_code,
          durationMs,
          log,
          runtime: input.runtime,
          image: input.image,
          ociCommand,
        }),
        findings: [
          {
            severity: 'error',
            file: null,
            line: null,
            state_path: null,
            code: ESPHOME_CONFIG_TIMED_OUT_CODE,
            message: 'ESPHome config validation timed out.',
            log_excerpt: log.excerpt,
            evidence_json: {
              runtime: input.runtime,
              image: input.image,
            },
          },
        ],
      };
    }

    if (isOciRuntimeFailure(result, log.excerpt)) {
      const message = summarizeOciRuntimeFailure(log.excerpt);
      return {
        status: 'environment_required',
        gate_status: 'blocked',
        summary: 'Local OCI runtime could not run the ESPHome image.',
        environment_hash: null,
        step: configStep({
          status: 'environment_required',
          summary: 'Local OCI runtime could not run the ESPHome image.',
          errorCode: OCI_RUNTIME_FAILED_CODE,
          exitCode: result.exit_code,
          durationMs,
          log,
          runtime: input.runtime,
          image: input.image,
          ociCommand,
        }),
        findings: [
          {
            severity: 'error',
            file: null,
            line: null,
            state_path: null,
            code: OCI_RUNTIME_FAILED_CODE,
            message,
            log_excerpt: log.excerpt,
            evidence_json: {
              runtime: input.runtime,
              image: input.image,
            },
          },
        ],
      };
    }

    const message = summarizeEsphomeFailure(log.excerpt);
    return {
      status: 'failed',
      gate_status: 'blocked',
      summary: 'ESPHome config failed.',
      environment_hash: runtimeEnvironmentHash(input.runtime, input.image),
      step: configStep({
        status: 'failed',
        summary: 'ESPHome config failed.',
        errorCode: ESPHOME_CONFIG_FAILED_CODE,
        exitCode: result.exit_code,
        durationMs,
        log,
        runtime: input.runtime,
        image: input.image,
        ociCommand,
      }),
      findings: [
        {
          severity: 'error',
          file: 'device.yaml',
          line: extractDeviceYamlLine(log.excerpt),
          state_path: null,
          code: ESPHOME_CONFIG_FAILED_CODE,
          message,
          log_excerpt: log.excerpt,
          evidence_json: {
            runtime: input.runtime,
            image: input.image,
          },
        },
      ],
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildOciRunCommand(runtime: LocalOciRuntime, configDir: string, image: string) {
  return {
    command: runtime,
    args: [
      'run',
      '--rm',
      '--network',
      'none',
      '-v',
      `${configDir}:${CONFIG_CONTAINER_DIR}:rw`,
      image,
      ...ESPHOME_CONFIG_CONTAINER_COMMAND,
    ],
  };
}

function configStep(input: {
  status: 'passed' | 'failed' | 'environment_required' | 'timed_out';
  summary: string;
  errorCode: string | null;
  exitCode: number | null;
  durationMs: number;
  log: { excerpt: string | null; truncated: boolean };
  runtime: LocalOciRuntime;
  image: string;
  ociCommand: { command: string; args: string[] };
}): LocalEsphomeValidationStep {
  return {
    step_id: ESPHOME_CONFIG_STEP_ID,
    name: 'ESPHome config',
    status: input.status,
    summary: input.summary,
    error_code: input.errorCode,
    exit_code: input.exitCode,
    duration_ms: input.durationMs,
    command_json: [...ESPHOME_CONFIG_COMMAND],
    log_excerpt: input.log.excerpt,
    log_truncated: input.log.truncated,
    result_json: {
      runtime: input.runtime,
      image: input.image,
      oci_command_json: [input.ociCommand.command, ...input.ociCommand.args],
    },
  };
}

function buildBoundedLog(result: LocalOciCommandResult): {
  excerpt: string | null;
  truncated: boolean;
} {
  const combined = [result.stdout.trimEnd(), result.stderr.trimEnd(), result.error?.message ?? '']
    .filter(Boolean)
    .join('\n');
  if (!combined) {
    return { excerpt: null, truncated: Boolean(result.output_truncated) };
  }

  if (combined.length <= LOG_EXCERPT_LIMIT) {
    return { excerpt: combined, truncated: Boolean(result.output_truncated) };
  }

  return {
    excerpt: combined.slice(0, LOG_EXCERPT_LIMIT),
    truncated: true,
  };
}

function isOciRuntimeFailure(result: LocalOciCommandResult, logExcerpt: string | null): boolean {
  if (result.error) return true;
  if (result.exit_code === 125) return true;
  if (!logExcerpt) return false;

  return /(?:unable to find image|pull access denied|manifest unknown|error response from daemon|docker:\s*error|podman:\s*error|cannot connect to the docker daemon|requested access to the resource is denied|no such image)/i.test(
    logExcerpt
  );
}

function summarizeOciRuntimeFailure(logExcerpt: string | null): string {
  const fallback = 'Local OCI runtime could not run the ESPHome image.';
  if (!logExcerpt) return fallback;

  const firstUsefulLine = logExcerpt
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!firstUsefulLine) return fallback;

  return truncateText(`${fallback} ${firstUsefulLine}`, 240);
}

function summarizeEsphomeFailure(logExcerpt: string | null): string {
  const fallback = 'ESPHome configuration validation failed.';
  if (!logExcerpt) return fallback;

  const lines = logExcerpt
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item && !isEsphomeBoilerplateLogLine(item));
  const line =
    lines.find((item) =>
      /(?:not a valid|invalid|requires|missing|required|must|failed|error)/i.test(item)
    ) ?? lines[0];
  if (!line) return fallback;

  return truncateText(line, 240);
}

function isEsphomeBoilerplateLogLine(line: string): boolean {
  return (
    line.startsWith('INFO ') ||
    line.startsWith('WARNING ') ||
    line.startsWith('Creating cache directory ') ||
    line.startsWith('You can change this behavior ') ||
    line === 'Failed config'
  );
}

function extractDeviceYamlLine(logExcerpt: string | null): number | null {
  if (!logExcerpt) return null;
  const match = logExcerpt.match(/(?:\/config\/)?device\.ya?ml:(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function runtimeEnvironmentHash(runtime: LocalOciRuntime, image: string): string {
  return stableHash({
    provider: 'local-oci',
    runtime,
    image,
  });
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}...`;
}

function createOutputCollector() {
  let value = '';
  let truncated = false;

  return {
    append(chunk: Buffer) {
      if (value.length >= PROCESS_OUTPUT_LIMIT) {
        truncated = true;
        return;
      }

      const next = `${value}${chunk.toString('utf8')}`;
      if (next.length > PROCESS_OUTPUT_LIMIT) {
        value = next.slice(0, PROCESS_OUTPUT_LIMIT);
        truncated = true;
        return;
      }

      value = next;
    },
    get value() {
      return value;
    },
    get truncated() {
      return truncated;
    },
  };
}
