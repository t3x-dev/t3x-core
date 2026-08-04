import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { stableHash } from './esphome-materializer';

export const ESPHOME_TOOL_VERSION = '2025.6';
export const ESPHOME_OCI_IMAGE =
  'ghcr.io/esphome/esphome@sha256:6a938e900f3ac586de0d44bbba6e19cf88fc76601465e34ab2180f8a6329dbc4';
export const ESPHOME_OCI_PLATFORM = 'linux/amd64';
export const LOCAL_OCI_PREFLIGHT_STEP_ID = 'local-oci-preflight';
export const ESPHOME_CONFIG_STEP_ID = 'esphome-config';
export const OCI_RUNTIME_MISSING_CODE = 'OCI_RUNTIME_MISSING';
export const OCI_RUNTIME_FAILED_CODE = 'OCI_RUNTIME_FAILED';
export const ESPHOME_CONFIG_FAILED_CODE = 'ESPHOME_CONFIG_FAILED';
export const ESPHOME_CONFIG_TIMED_OUT_CODE = 'ESPHOME_CONFIG_TIMED_OUT';
export const LOCAL_OCI_ISOLATION_ARGS = Object.freeze([
  '--network',
  'none',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--pids-limit',
  '256',
  '--memory',
  '2g',
  '--cpus',
  '2',
  '--read-only',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,nodev,size=256m',
] as const);

const DEFAULT_PREFLIGHT_TIMEOUT_MS = 5_000;
const DEFAULT_CONFIG_TIMEOUT_MS = 120_000;
const LOG_EXCERPT_LIMIT = 8_000;
const PROCESS_OUTPUT_LIMIT = 64_000;
const CONFIG_CONTAINER_DIR = '/config';
const PORTABLE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/;

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
  /** Optional OCI platform; exact-source validation freezes this to the reference platform. */
  platform?: string;
}

export interface LocalEsphomeSourceFile {
  path: string;
  content: string;
}

export interface RunLocalEsphomeSourceValidationInput {
  rootPath: string;
  rootSource: string;
  files: readonly LocalEsphomeSourceFile[];
  /** Trusted transient values. Callers must bind and authorize names separately. */
  secretValues: Readonly<Record<string, string>>;
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
  return runLocalEsphomeMaterializedValidation(
    {
      rootPath: 'device.yaml',
      rootSource: input.deviceYaml,
      files: [],
      secretValues: {},
    },
    options
  );
}

export async function runLocalEsphomeSourceValidation(
  input: RunLocalEsphomeSourceValidationInput,
  options: RunLocalEsphomeConfigValidationOptions = {}
): Promise<LocalEsphomeValidationResult> {
  assertImmutableOciImage(options.image ?? ESPHOME_OCI_IMAGE);
  validateMaterializedInput(input);
  return runLocalEsphomeMaterializedValidation(input, {
    ...options,
    platform: ESPHOME_OCI_PLATFORM,
  });
}

async function runLocalEsphomeMaterializedValidation(
  materialized: RunLocalEsphomeSourceValidationInput,
  options: RunLocalEsphomeConfigValidationOptions
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

  return runEsphomeConfigInRuntime(materialized, {
    executor,
    image,
    platform: options.platform,
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
  materialized: RunLocalEsphomeSourceValidationInput,
  input: {
    executor: LocalOciCommandExecutor;
    image: string;
    runtime: LocalOciRuntime;
    tempRoot?: string;
    timeoutMs?: number;
    platform?: string;
  }
): Promise<LocalEsphomeValidationResult> {
  const tempDir = await mkdtemp(path.join(input.tempRoot ?? tmpdir(), 't3x-esphome-'));
  const configDir = path.join(tempDir, 'config');
  const startedAt = Date.now();

  try {
    await mkdir(configDir, { recursive: true });
    await materializeConfigInput(configDir, materialized);

    const configPath = `${CONFIG_CONTAINER_DIR}/${materialized.rootPath}`;
    const containerCommand = ['config', configPath] as const;
    const ociCommand = buildOciRunCommand(
      input.runtime,
      configDir,
      input.image,
      containerCommand,
      input.platform
    );
    const result = await input.executor(ociCommand.command, ociCommand.args, {
      timeoutMs: input.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    });
    const durationMs = Date.now() - startedAt;
    const log = buildBoundedLog(result, Object.values(materialized.secretValues));

    if (result.exit_code === 0) {
      return {
        status: 'passed',
        gate_status: 'ready',
        summary: 'ESPHome config passed.',
        environment_hash: runtimeEnvironmentHash(input.runtime, input.image, input.platform),
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
          containerCommand,
        }),
        findings: [],
      };
    }

    if (result.timed_out) {
      return {
        status: 'timed_out',
        gate_status: 'blocked',
        summary: 'ESPHome config timed out.',
        environment_hash: runtimeEnvironmentHash(input.runtime, input.image, input.platform),
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
          containerCommand,
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
          containerCommand,
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
      environment_hash: runtimeEnvironmentHash(input.runtime, input.image, input.platform),
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
        containerCommand,
      }),
      findings: [
        {
          severity: 'error',
          file: materialized.rootPath,
          line: extractSourceLine(log.excerpt, materialized.rootPath),
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

export function assertImmutableOciImage(image: string): void {
  if (!/^[^\s@]+@sha256:[0-9a-f]{64}$/.test(image)) {
    throw new TypeError('ESPHome runner image must use an immutable sha256 digest reference');
  }
}

function assertPortablePath(value: string, label: string): void {
  if (
    !PORTABLE_PATH_PATTERN.test(value) ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new TypeError(`${label} must be a normalized portable relative path`);
  }
}

function validateMaterializedInput(input: RunLocalEsphomeSourceValidationInput): void {
  assertPortablePath(input.rootPath, 'ESPHome root path');
  if (input.rootPath.split('/').at(-1)?.toLowerCase() === 'secrets.yaml') {
    throw new TypeError('ESPHome root path cannot be secrets.yaml');
  }
  const paths = new Set([input.rootPath]);
  input.files.forEach((file, index) => {
    assertPortablePath(file.path, `ESPHome source file ${index} path`);
    if (file.path.split('/').at(-1)?.toLowerCase() === 'secrets.yaml') {
      throw new TypeError('ESPHome source files cannot supply secrets.yaml');
    }
    if (paths.has(file.path)) throw new TypeError(`Duplicate ESPHome source path ${file.path}`);
    paths.add(file.path);
  });
  for (const [name, value] of Object.entries(input.secretValues)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new TypeError('ESPHome secret names must be portable identifiers');
    }
    if (typeof value !== 'string') throw new TypeError('ESPHome secret values must be strings');
  }
}

async function materializeConfigInput(
  configDir: string,
  input: RunLocalEsphomeSourceValidationInput
): Promise<void> {
  const files = [
    { path: input.rootPath, content: input.rootSource },
    ...input.files.map((file) => ({ ...file })),
  ];
  for (const file of files) {
    const destination = path.join(configDir, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, 'utf8');
  }

  if (Object.keys(input.secretValues).length > 0) {
    const secretsPath = path.join(configDir, path.dirname(input.rootPath), 'secrets.yaml');
    await writeFile(
      secretsPath,
      yaml.dump({ ...input.secretValues }, { lineWidth: -1, noRefs: true, sortKeys: true }),
      'utf8'
    );
  }
}

function buildOciRunCommand(
  runtime: LocalOciRuntime,
  configDir: string,
  image: string,
  containerCommand: readonly string[],
  platform?: string
) {
  return {
    command: runtime,
    args: [
      'run',
      '--rm',
      ...(platform === undefined ? [] : ['--platform', platform]),
      ...LOCAL_OCI_ISOLATION_ARGS,
      '-v',
      `${configDir}:${CONFIG_CONTAINER_DIR}:rw`,
      image,
      ...containerCommand,
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
  containerCommand: readonly string[];
}): LocalEsphomeValidationStep {
  return {
    step_id: ESPHOME_CONFIG_STEP_ID,
    name: 'ESPHome config',
    status: input.status,
    summary: input.summary,
    error_code: input.errorCode,
    exit_code: input.exitCode,
    duration_ms: input.durationMs,
    command_json: ['esphome', ...input.containerCommand],
    log_excerpt: input.log.excerpt,
    log_truncated: input.log.truncated,
    result_json: {
      runtime: input.runtime,
      image: input.image,
      oci_command_json: [input.ociCommand.command, ...input.ociCommand.args],
    },
  };
}

function buildBoundedLog(
  result: LocalOciCommandResult,
  secretValues: readonly string[] = []
): {
  excerpt: string | null;
  truncated: boolean;
} {
  const combined = redactSecrets(
    [result.stdout.trimEnd(), result.stderr.trimEnd(), result.error?.message ?? '']
      .filter(Boolean)
      .join('\n'),
    secretValues
  );
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

function redactSecrets(value: string, secretValues: readonly string[]): string {
  let redacted = value;
  const unique = [...new Set(secretValues.filter((secret) => secret.length > 0))].sort(
    (left, right) => right.length - left.length
  );
  for (const secret of unique) redacted = redacted.split(secret).join('[REDACTED]');
  return redacted;
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

function extractSourceLine(logExcerpt: string | null, sourcePath: string): number | null {
  if (!logExcerpt) return null;
  const escaped = sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = logExcerpt.match(new RegExp(`(?:/config/)?${escaped}:(\\d+)`));
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function runtimeEnvironmentHash(
  runtime: LocalOciRuntime,
  image: string,
  platform?: string
): string {
  return stableHash({
    provider: 'local-oci',
    runtime,
    image,
    ...(platform === undefined ? {} : { platform }),
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
