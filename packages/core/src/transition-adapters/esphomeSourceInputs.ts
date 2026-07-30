import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  type Digest,
  describeProtocolObject,
  type ProtocolValue,
  parseState,
  type ResourceDescriptor,
  SchemaInvalidError,
  type State,
  type StateDescriptor,
  UnsupportedMediaTypeError,
} from '@t3x-dev/transition';
import { isMap, isScalar, parseDocument, visit } from 'yaml';
import {
  YAML_SOURCE_CODEC_VERSION,
  YAML_SOURCE_MEDIA_TYPE,
  yamlSourceStateCodec,
} from './yamlSourceStateCodec';

export const ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT =
  't3x.dev/esphome-source-input-manifest/v1' as const;
export const ESPHOME_SOURCE_INPUT_MANIFEST_MEDIA_TYPE =
  'application/vnd.t3x.esphome-source-input-manifest+json' as const;

const REMOTE_REFERENCE_PATTERN = /^(?:codeberg|github|gitlab|https?):\/\//i;
const PORTABLE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const ALLOWED_NON_RESOURCE_TAGS = new Set(['!extend', '!lambda', '!literal', '!remove']);

export type EspHomeSourceInputIssueCode =
  | 'INCLUDE_CYCLE'
  | 'MISSING_RESOURCE'
  | 'MISSING_SECRET'
  | 'SOURCE_DEPENDENCY_SCAN_FAILED'
  | 'UNSUPPORTED_DYNAMIC_INCLUDE'
  | 'UNSUPPORTED_INCLUDE_DIRECTORY'
  | 'UNSUPPORTED_INCLUDE_SHAPE'
  | 'UNSUPPORTED_REMOTE_PACKAGE'
  | 'UNSUPPORTED_TAG'
  | 'UNUSED_RESOURCE';

export interface EspHomeSourceInputIssue {
  code: EspHomeSourceInputIssueCode;
  sourcePath: string;
  reference?: string;
  message: string;
}

export interface EspHomeSourceResourceInput {
  path: string;
  source: string;
  descriptor: ResourceDescriptor;
}

export interface EspHomeSourceInputManifest {
  format: typeof ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT;
  root: {
    path: string;
    state: StateDescriptor;
  };
  files: Array<{
    path: string;
    resource: ResourceDescriptor;
  }>;
  secretReferences: Array<{
    name: string;
    availability: 'available';
  }>;
  resolution: {
    localIncludes: 'complete';
    packageSemantics: 'delegated_to_esphome';
    commandLineSubstitutions: 'unsupported';
    secretValues: 'transient_unhashed';
  };
}

export interface ReadyEspHomeSourceInputs {
  outcome: 'ready';
  manifest: EspHomeSourceInputManifest;
  manifestResource: ResourceDescriptor;
  /** Exact bytes for later isolated materialization; never part of a protocol object. */
  files: Array<{
    path: string;
    source: string;
    resource: ResourceDescriptor;
  }>;
}

export interface IncompleteEspHomeSourceInputs {
  outcome: 'incomplete';
  issues: EspHomeSourceInputIssue[];
}

export interface UnsupportedEspHomeSourceInputs {
  outcome: 'unsupported';
  issues: EspHomeSourceInputIssue[];
}

export type EspHomeSourceInputResult =
  | ReadyEspHomeSourceInputs
  | IncompleteEspHomeSourceInputs
  | UnsupportedEspHomeSourceInputs;

export interface BindEspHomeSourceInputsInput {
  root: State;
  rootPath: string;
  resources: readonly EspHomeSourceResourceInput[];
  /** Names established by a trusted secret resolver. Values are never accepted here. */
  availableSecretNames: readonly string[];
  manifestUri: string;
}

interface SourceFile {
  path: string;
  source: string;
  descriptor?: ResourceDescriptor;
}

interface ScannedSource {
  includes: string[];
  secretReferences: string[];
  issues: EspHomeSourceInputIssue[];
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Utf8(value: string): Digest {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function assertNonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new SchemaInvalidError('Expected a non-empty string', path);
}

function assertClosedRecord(value: object, allowedKeys: readonly string[], path: string): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new SchemaInvalidError('Unknown source-input field', `${path}.${unknown}`);
  }
}

function assertPortablePath(value: string, path: string): void {
  if (
    !PORTABLE_PATH_PATTERN.test(value) ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '.' || segment === '..' || segment === '')
  ) {
    throw new SchemaInvalidError('Expected a normalized portable relative path', path);
  }
}

function assertSecretName(value: string, path: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new SchemaInvalidError('Expected a portable secret reference name', path);
  }
}

function isSecretValueFile(path: string): boolean {
  return path.split('/').at(-1)?.toLowerCase() === 'secrets.yaml';
}

export function createYamlSourceResourceDescriptor(
  uri: string,
  source: string
): ResourceDescriptor {
  assertNonEmpty(uri, '$.uri');
  canonicalizeProtocolValue(source);
  return {
    uri,
    mediaType: YAML_SOURCE_MEDIA_TYPE,
    digest: sha256Utf8(source),
  };
}

function verifySourceResource(resource: EspHomeSourceResourceInput, index: number): void {
  assertClosedRecord(resource, ['path', 'source', 'descriptor'], `$.resources[${index}]`);
  assertClosedRecord(
    resource.descriptor,
    ['uri', 'mediaType', 'digest'],
    `$.resources[${index}].descriptor`
  );
  assertPortablePath(resource.path, `$.resources[${index}].path`);
  if (isSecretValueFile(resource.path)) {
    throw new SchemaInvalidError(
      'Secret value files are not accepted as source resources',
      `$.resources[${index}].path`
    );
  }
  const expected = createYamlSourceResourceDescriptor(resource.descriptor.uri, resource.source);
  if (
    resource.descriptor.mediaType !== expected.mediaType ||
    resource.descriptor.digest !== expected.digest
  ) {
    throw new SchemaInvalidError(
      'Resource descriptor does not bind the supplied exact source bytes',
      `$.resources[${index}].descriptor`
    );
  }
}

function unsupportedIssue(
  code: EspHomeSourceInputIssueCode,
  sourcePath: string,
  reference: string | undefined,
  message: string
): EspHomeSourceInputIssue {
  return { code, sourcePath, ...(reference === undefined ? {} : { reference }), message };
}

function taggedScalarValue(node: unknown): string | null {
  return isScalar(node) && typeof node.value === 'string' ? node.value : null;
}

function includeReference(node: unknown): string | null {
  const scalar = taggedScalarValue(node);
  if (scalar !== null) return scalar;
  if (!isMap(node)) return null;

  const allowedKeys = new Set(['file', 'vars']);
  for (const item of node.items) {
    const key = taggedScalarValue(item.key);
    if (key === null || !allowedKeys.has(key)) return null;
  }
  return taggedScalarValue(node.get('file', true));
}

function sourceParseIssue(sourcePath: string, code: string): EspHomeSourceInputIssue {
  return unsupportedIssue(
    'SOURCE_DEPENDENCY_SCAN_FAILED',
    sourcePath,
    undefined,
    `Cannot inventory dependencies for ${sourcePath} (${code})`
  );
}

function scanSource(file: SourceFile): ScannedSource {
  const document = parseDocument(file.source, {
    keepSourceTokens: true,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  const parseProblem =
    document.errors[0] ??
    document.warnings.find((warning) => warning.code !== 'TAG_RESOLVE_FAILED');
  if (parseProblem !== undefined) {
    return {
      includes: [],
      secretReferences: [],
      issues: [sourceParseIssue(file.path, parseProblem.code)],
    };
  }

  const includes: string[] = [];
  const secretReferences: string[] = [];
  const issues: EspHomeSourceInputIssue[] = [];

  visit(document, (_key, node) => {
    if (typeof node !== 'object' || node === null || !('tag' in node)) return;
    const tag = node.tag;
    if (typeof tag !== 'string' || tag.startsWith('tag:yaml.org,2002:')) return;

    if (tag === '!secret') {
      const name = taggedScalarValue(node);
      if (name === null || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        issues.push(
          unsupportedIssue(
            'UNSUPPORTED_TAG',
            file.path,
            '!secret',
            `Unsupported !secret shape in ${file.path}`
          )
        );
      } else {
        secretReferences.push(name);
      }
      return;
    }

    if (tag === '!include') {
      const reference = includeReference(node);
      if (reference === null) {
        issues.push(
          unsupportedIssue(
            'UNSUPPORTED_INCLUDE_SHAPE',
            file.path,
            '!include',
            `Unsupported !include shape in ${file.path}`
          )
        );
      } else if (reference.includes('$') || reference.includes('{%')) {
        issues.push(
          unsupportedIssue(
            'UNSUPPORTED_DYNAMIC_INCLUDE',
            file.path,
            reference,
            `Dynamic include filenames are unsupported in ${file.path}`
          )
        );
      } else if (REMOTE_REFERENCE_PATTERN.test(reference)) {
        issues.push(
          unsupportedIssue(
            'UNSUPPORTED_REMOTE_PACKAGE',
            file.path,
            undefined,
            `Remote includes are unsupported in ${file.path}`
          )
        );
      } else {
        includes.push(reference);
      }
      return;
    }

    if (tag.startsWith('!include_dir_')) {
      issues.push(
        unsupportedIssue(
          'UNSUPPORTED_INCLUDE_DIRECTORY',
          file.path,
          tag,
          `Directory include tags are unsupported in ${file.path}`
        )
      );
      return;
    }

    if (!ALLOWED_NON_RESOURCE_TAGS.has(tag)) {
      issues.push(
        unsupportedIssue(
          'UNSUPPORTED_TAG',
          file.path,
          tag,
          `Unsupported YAML tag ${tag} in ${file.path}`
        )
      );
    }
  });

  const packagesNode = document.get('packages', true);
  if (packagesNode !== undefined) {
    visit(packagesNode as never, (_key, node) => {
      const value = taggedScalarValue(node);
      if (value !== null && REMOTE_REFERENCE_PATTERN.test(value)) {
        issues.push(
          unsupportedIssue(
            'UNSUPPORTED_REMOTE_PACKAGE',
            file.path,
            undefined,
            `Remote packages are unsupported in ${file.path}`
          )
        );
      }
    });
  }

  return { includes, secretReferences, issues };
}

function resolveIncludePath(fromPath: string, reference: string): string | null {
  if (
    !PORTABLE_PATH_PATTERN.test(reference) ||
    reference.startsWith('/') ||
    reference.endsWith('/') ||
    reference.includes('//') ||
    reference.includes('\\') ||
    reference.split('/').some((segment) => segment === '.' || segment === '..' || segment === '')
  ) {
    return null;
  }
  const base = fromPath.split('/').slice(0, -1);
  return [...base, ...reference.split('/')].join('/');
}

function issueKey(issue: EspHomeSourceInputIssue): string {
  return [issue.code, issue.sourcePath, issue.reference ?? '', issue.message].join('\0');
}

function sortedIssues(issues: EspHomeSourceInputIssue[]): EspHomeSourceInputIssue[] {
  return [...new Map(issues.map((issue) => [issueKey(issue), issue] as const)).values()].sort(
    (left, right) => comparePortable(issueKey(left), issueKey(right))
  );
}

function manifestDescriptor(uri: string, manifest: EspHomeSourceInputManifest): ResourceDescriptor {
  assertNonEmpty(uri, '$.manifestUri');
  const canonical = canonicalizeProtocolValue(manifest as unknown as ProtocolValue);
  return {
    uri,
    mediaType: ESPHOME_SOURCE_INPUT_MANIFEST_MEDIA_TYPE,
    digest: sha256Utf8(canonical),
  };
}

/**
 * Bind the exact non-secret source inputs required by the supported ESPHome v1
 * surface. ESPHome remains the sole interpreter of package and substitution
 * semantics; this function performs no I/O and produces no validation claim.
 */
export function bindEspHomeSourceInputs(
  input: BindEspHomeSourceInputsInput
): EspHomeSourceInputResult {
  assertClosedRecord(
    input,
    ['root', 'rootPath', 'resources', 'availableSecretNames', 'manifestUri'],
    '$'
  );
  const rootState = parseState(input.root);
  if (
    rootState.codec.mediaType !== YAML_SOURCE_MEDIA_TYPE ||
    rootState.codec.version !== YAML_SOURCE_CODEC_VERSION
  ) {
    throw new UnsupportedMediaTypeError(
      `ESPHome source inputs require State codec ${YAML_SOURCE_MEDIA_TYPE}@${YAML_SOURCE_CODEC_VERSION}`
    );
  }
  assertPortablePath(input.rootPath, '$.rootPath');
  if (isSecretValueFile(input.rootPath)) {
    throw new SchemaInvalidError('Secret value files cannot be the root State', '$.rootPath');
  }
  assertNonEmpty(input.manifestUri, '$.manifestUri');
  const rootSource = yamlSourceStateCodec.decode(rootState.value) as string;

  const availableSecrets = new Set<string>();
  input.availableSecretNames.forEach((name, index) => {
    assertSecretName(name, `$.availableSecretNames[${index}]`);
    if (availableSecrets.has(name)) {
      throw new SchemaInvalidError(
        'Duplicate available secret name',
        `$.availableSecretNames[${index}]`
      );
    }
    availableSecrets.add(name);
  });

  const resourceByPath = new Map<string, SourceFile>();
  input.resources.forEach((resource, index) => {
    verifySourceResource(resource, index);
    if (resource.path === input.rootPath || resourceByPath.has(resource.path)) {
      throw new SchemaInvalidError('Duplicate source resource path', `$.resources[${index}].path`);
    }
    resourceByPath.set(resource.path, { ...resource });
  });

  const root: SourceFile = { path: input.rootPath, source: rootSource };
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const referencedResources = new Set<string>();
  const secretReferences = new Set<string>();
  const issues: EspHomeSourceInputIssue[] = [];

  const walk = (file: SourceFile): void => {
    if (visited.has(file.path)) return;
    if (visiting.has(file.path)) {
      issues.push(
        unsupportedIssue(
          'INCLUDE_CYCLE',
          file.path,
          file.path,
          `Include cycle detected at ${file.path}`
        )
      );
      return;
    }

    visiting.add(file.path);
    const scanned = scanSource(file);
    issues.push(...scanned.issues);
    scanned.secretReferences.forEach((name) => secretReferences.add(name));

    for (const reference of scanned.includes) {
      const resolved = resolveIncludePath(file.path, reference);
      if (resolved === null) {
        issues.push(
          unsupportedIssue(
            'UNSUPPORTED_INCLUDE_SHAPE',
            file.path,
            reference,
            `Include path is not a portable relative path in ${file.path}`
          )
        );
        continue;
      }
      const dependency = resourceByPath.get(resolved);
      if (dependency === undefined) {
        issues.push(
          unsupportedIssue(
            'MISSING_RESOURCE',
            file.path,
            resolved,
            `Required source resource ${resolved} was not supplied`
          )
        );
        continue;
      }
      referencedResources.add(resolved);
      if (visiting.has(resolved)) {
        issues.push(
          unsupportedIssue(
            'INCLUDE_CYCLE',
            file.path,
            resolved,
            `Include cycle detected from ${file.path} to ${resolved}`
          )
        );
        continue;
      }
      walk(dependency);
    }

    visiting.delete(file.path);
    visited.add(file.path);
  };

  walk(root);

  for (const resourcePath of resourceByPath.keys()) {
    if (!referencedResources.has(resourcePath)) {
      issues.push(
        unsupportedIssue(
          'UNUSED_RESOURCE',
          resourcePath,
          resourcePath,
          `Supplied source resource ${resourcePath} is not reachable from ${input.rootPath}`
        )
      );
    }
  }
  for (const name of secretReferences) {
    if (!availableSecrets.has(name)) {
      issues.push(
        unsupportedIssue(
          'MISSING_SECRET',
          input.rootPath,
          name,
          `Required secret reference ${name} is unavailable`
        )
      );
    }
  }

  const orderedIssues = sortedIssues(issues);
  const unsupported = orderedIssues.some(
    (issue) => issue.code !== 'MISSING_RESOURCE' && issue.code !== 'MISSING_SECRET'
  );
  if (unsupported) return { outcome: 'unsupported', issues: orderedIssues };
  if (orderedIssues.length > 0) return { outcome: 'incomplete', issues: orderedIssues };

  const files = [...referencedResources].sort(comparePortable).map((path) => {
    const file = resourceByPath.get(path);
    if (file?.descriptor === undefined) {
      throw new SchemaInvalidError('Resolved source resource lacks a descriptor', '$.resources');
    }
    return { path, source: file.source, resource: { ...file.descriptor } };
  });
  const manifest: EspHomeSourceInputManifest = {
    format: ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT,
    root: {
      path: input.rootPath,
      state: describeProtocolObject(rootState),
    },
    files: files.map(({ path, resource }) => ({ path, resource: { ...resource } })),
    secretReferences: [...secretReferences]
      .sort(comparePortable)
      .map((name) => ({ name, availability: 'available' as const })),
    resolution: {
      localIncludes: 'complete',
      packageSemantics: 'delegated_to_esphome',
      commandLineSubstitutions: 'unsupported',
      secretValues: 'transient_unhashed',
    },
  };

  return {
    outcome: 'ready',
    manifest,
    manifestResource: manifestDescriptor(input.manifestUri, manifest),
    files,
  };
}
