import { createHash } from 'node:crypto';
import {
  bindEspHomeSourceInputs,
  buildRunnerValidationStatement,
  describeTransitionObject,
  ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT,
  type ReadyEspHomeSourceInputs,
  type ResourceDescriptor,
  type RunBinding,
  type RunnerValidationStatement,
  type State,
  yamlSourceStateCodec,
} from '@t3x-dev/core';
import {
  ESPHOME_OCI_IMAGE,
  ESPHOME_OCI_PLATFORM,
  ESPHOME_TOOL_VERSION,
  LOCAL_OCI_ISOLATION_ARGS,
  type LocalEsphomeValidationResult,
  type LocalOciCommandExecutor,
  runLocalEsphomeSourceValidation,
} from './local-oci-provider';

export const ESPHOME_RUNNER_WORKFLOW_MEDIA_TYPE =
  'application/vnd.t3x.runner-workflow+json' as const;
export const ESPHOME_RUNNER_ENVIRONMENT_MEDIA_TYPE =
  'application/vnd.t3x.runner-environment+json' as const;
export const ESPHOME_RUNNER_LOG_MEDIA_TYPE = 'text/plain; charset=utf-8' as const;
export const ESPHOME_RUNNER_WORKFLOW_NAME = 'esphome-config@v1' as const;

export interface RunEsphomeRunnerStatementInput {
  state: State;
  sourceInputs: ReadyEspHomeSourceInputs;
  /** Established by the trusted application boundary, never by request-authored content. */
  actor: RunnerValidationStatement['actor'];
  run: RunBinding;
  /** Values are transient and are never returned, hashed, logged, or added to protocol objects. */
  secretValues: Readonly<Record<string, string>>;
  image?: string;
  executor?: LocalOciCommandExecutor;
  tempRoot?: string;
  preflightTimeoutMs?: number;
  configTimeoutMs?: number;
}

export interface BoundRunnerResource<T> {
  descriptor: ResourceDescriptor;
  value: T;
}

export type EsphomeRunnerStatementResult =
  | {
      outcome: 'statement';
      operationalResult: LocalEsphomeValidationResult;
      statement: RunnerValidationStatement;
      resources: {
        workflow: BoundRunnerResource<Record<string, unknown>>;
        environment: BoundRunnerResource<Record<string, unknown>>;
        logs: Array<BoundRunnerResource<string> & { truncated: boolean }>;
      };
    }
  | {
      outcome: 'no_statement';
      operationalResult: LocalEsphomeValidationResult;
      reason: 'environment_required' | 'timed_out';
    };

function sha256Utf8(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError(
    'Runner resource values must contain only JSON strings, booleans, arrays, and objects'
  );
}

function jsonResource(
  uri: string,
  mediaType: string,
  value: Record<string, unknown>
): BoundRunnerResource<Record<string, unknown>> {
  return {
    descriptor: { uri, mediaType, digest: sha256Utf8(canonicalJson(value)) },
    value,
  };
}

function textResource(uri: string, mediaType: string, value: string): BoundRunnerResource<string> {
  return {
    descriptor: { uri, mediaType, digest: sha256Utf8(value) },
    value,
  };
}

function sameResource(left: ResourceDescriptor, right: ResourceDescriptor): boolean {
  return (
    left.uri === right.uri && left.mediaType === right.mediaType && left.digest === right.digest
  );
}

function sameObjectDescriptor(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

function compareResource(left: ResourceDescriptor, right: ResourceDescriptor): number {
  if (left.digest !== right.digest) return left.digest < right.digest ? -1 : 1;
  if (left.mediaType !== right.mediaType) return left.mediaType < right.mediaType ? -1 : 1;
  return left.uri < right.uri ? -1 : left.uri > right.uri ? 1 : 0;
}

function verifiedSourceInputs(
  state: State,
  provided: ReadyEspHomeSourceInputs
): ReadyEspHomeSourceInputs {
  if (provided.outcome !== 'ready') {
    throw new TypeError(
      `ESPHome runner requires ready source inputs, received ${provided.outcome}`
    );
  }
  const rebound = bindEspHomeSourceInputs({
    root: state,
    rootPath: provided.manifest.root.path,
    resources: provided.files.map((file) => ({
      path: file.path,
      source: file.source,
      descriptor: file.resource,
    })),
    availableSecretNames: provided.manifest.secretReferences.map((secret) => secret.name),
    manifestUri: provided.manifestResource.uri,
  });
  if (rebound.outcome !== 'ready') {
    throw new TypeError(`ESPHome runner requires ready source inputs, received ${rebound.outcome}`);
  }
  if (!sameResource(rebound.manifestResource, provided.manifestResource)) {
    throw new TypeError('ESPHome source-input manifest does not bind the supplied exact inputs');
  }
  return rebound;
}

function assertExactSecretSet(
  sourceInputs: ReadyEspHomeSourceInputs,
  secretValues: Readonly<Record<string, string>>
): void {
  const expected = sourceInputs.manifest.secretReferences.map((secret) => secret.name).sort();
  const actual = Object.keys(secretValues).sort();
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new TypeError('Transient secret names must exactly match the bound source manifest');
  }
}

function workflowResource(rootPath: string): BoundRunnerResource<Record<string, unknown>> {
  return jsonResource(
    't3x://runner-workflows/esphome-config/v1',
    ESPHOME_RUNNER_WORKFLOW_MEDIA_TYPE,
    {
      format: 't3x.dev/runner-workflow/v1',
      name: ESPHOME_RUNNER_WORKFLOW_NAME,
      inputManifestFormat: ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT,
      materialization: 'exact-source-with-transient-secrets',
      command: ['esphome', 'config', `/config/${rootPath}`],
    }
  );
}

function environmentResource(image: string): BoundRunnerResource<Record<string, unknown>> {
  return jsonResource(`oci://${image}`, ESPHOME_RUNNER_ENVIRONMENT_MEDIA_TYPE, {
    format: 't3x.dev/runner-environment/v1',
    image,
    platform: ESPHOME_OCI_PLATFORM,
    isolationArguments: [...LOCAL_OCI_ISOLATION_ARGS],
    configMount: 'rw',
  });
}

function logResources(
  runId: string,
  result: LocalEsphomeValidationResult
): Array<BoundRunnerResource<string> & { truncated: boolean }> {
  if (result.step.log_excerpt === null) return [];
  return [
    {
      ...textResource(
        `t3x://runner-runs/${encodeURIComponent(runId)}/logs/stdout-stderr-excerpt`,
        ESPHOME_RUNNER_LOG_MEDIA_TYPE,
        result.step.log_excerpt
      ),
      truncated: result.step.log_truncated,
    },
  ];
}

/**
 * Execute one exact-source ESPHome validation and issue a Statement only when
 * the external tool produced a configuration-validity conclusion.
 */
export async function runEsphomeRunnerStatement(
  input: RunEsphomeRunnerStatementInput
): Promise<EsphomeRunnerStatementResult> {
  const sourceInputs = verifiedSourceInputs(input.state, input.sourceInputs);
  assertExactSecretSet(sourceInputs, input.secretValues);
  const image = input.image ?? ESPHOME_OCI_IMAGE;
  const rootSource = yamlSourceStateCodec.decode(input.state.value) as string;
  const operationalResult = await runLocalEsphomeSourceValidation(
    {
      rootPath: sourceInputs.manifest.root.path,
      rootSource,
      files: sourceInputs.files.map((file) => ({ path: file.path, content: file.source })),
      secretValues: input.secretValues,
    },
    {
      image,
      executor: input.executor,
      tempRoot: input.tempRoot,
      preflightTimeoutMs: input.preflightTimeoutMs,
      configTimeoutMs: input.configTimeoutMs,
    }
  );

  if (operationalResult.status === 'environment_required') {
    return { outcome: 'no_statement', operationalResult, reason: 'environment_required' };
  }
  if (operationalResult.status === 'timed_out') {
    return { outcome: 'no_statement', operationalResult, reason: 'timed_out' };
  }

  const workflow = workflowResource(sourceInputs.manifest.root.path);
  const environment = environmentResource(image);
  const logs = logResources(input.run.id, operationalResult);
  const inputArtifacts = sourceInputs.files
    .map((file) => ({ ...file.resource }))
    .sort(compareResource);
  const statement = buildRunnerValidationStatement({
    state: input.state,
    actor: input.actor,
    predicate: {
      tool: { name: 'esphome', version: ESPHOME_TOOL_VERSION },
      run: input.run,
      workflow: workflow.descriptor,
      environment: environment.descriptor,
      inputManifest: sourceInputs.manifestResource,
      inputArtifacts,
      logs: logs.map((log) => ({ ...log.descriptor })).sort(compareResource),
      outputs: [],
      outcome: operationalResult.status,
      summary: operationalResult.summary,
      findings: operationalResult.findings.map((finding) => ({
        severity: finding.severity,
        code: finding.code,
        message: finding.message,
        ...(finding.file === null ? {} : { path: finding.file }),
        ...(finding.line === null ? {} : { line: finding.line }),
      })),
    },
  });

  if (!sameObjectDescriptor(statement.subjects[0], describeTransitionObject(input.state))) {
    throw new TypeError('Runner Statement subject does not match the exact Result State');
  }

  return {
    outcome: 'statement',
    operationalResult,
    statement,
    resources: { workflow, environment, logs },
  };
}
