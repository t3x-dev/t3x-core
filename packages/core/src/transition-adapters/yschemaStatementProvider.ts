import { createHash } from 'node:crypto';
import {
  type ActorRef,
  canonicalizeProtocolValue,
  type ProtocolValue,
  SchemaInvalidError,
  type State,
  UnsupportedMediaTypeError,
} from '@t3x-dev/transition';
import {
  type ProvenanceIndex,
  type ValidationInput,
  type ValidationResult,
  validateTree,
  type YSchema,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import { treesToYValue } from '../t3x-yops/convert';
import {
  buildYSchemaValidationStatement,
  type ProfileBinding,
  type ResourceBinding,
  type ResourceDescriptor,
  type RunBinding,
  type ToolBinding,
  YSCHEMA_PROFILE_ID,
  YSCHEMA_PROFILE_VERSION,
  type YSchemaValidationPredicate,
  type YSchemaValidationStatement,
} from '../transition-statements';
import { decodeRepositorySemanticState } from './semanticMergeDriver';
import { YOPS_STATE_CODEC_VERSION, YOPS_STATE_MEDIA_TYPE, yopsStateCodec } from './stateCodec';

export const YSCHEMA_NATIVE_PROFILE: Readonly<ProfileBinding> = Object.freeze({
  id: YSCHEMA_PROFILE_ID,
  version: YSCHEMA_PROFILE_VERSION,
});

export const YSCHEMA_RESOURCE_MEDIA_TYPE = 'application/vnd.t3x.yschema.normalized+json' as const;
export const YSCHEMA_CONTEXT_MEDIA_TYPE = 'application/vnd.t3x.yschema-context+json' as const;

export interface YSchemaStatementProviderInput {
  state: State;
  schema: YSchema;
  schemaResource: ResourceDescriptor;
  profile?: ProfileBinding;
  context: ResourceBinding;
  environment: ResourceBinding;
  relations?: YSchemaRelation[];
  provenanceByPath?: ProvenanceIndex;
  actor: ActorRef;
  tool: ToolBinding;
  run: RunBinding;
}

export interface RepositorySemanticYSchemaStatementProviderInput
  extends YSchemaStatementProviderInput {
  rootKey: string;
}

interface YSchemaContextDescriptorInput {
  relations?: YSchemaRelation[];
  provenanceByPath?: ProvenanceIndex;
  rootKey?: string;
}

function profileIsSupported(profile: ProfileBinding): boolean {
  return profile.id === YSCHEMA_PROFILE_ID && profile.version === YSCHEMA_PROFILE_VERSION;
}

function digestCanonicalResource(value: ProtocolValue): `sha256:${string}` {
  const canonical = canonicalizeProtocolValue(value);
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

export function createYSchemaResourceDescriptor(uri: string, schema: YSchema): ResourceDescriptor {
  return {
    uri,
    mediaType: YSCHEMA_RESOURCE_MEDIA_TYPE,
    digest: digestCanonicalResource(schema as unknown as ProtocolValue),
  };
}

export function createYSchemaContextDescriptor(
  uri: string,
  context: YSchemaContextDescriptorInput
): ResourceDescriptor {
  return {
    uri,
    mediaType: YSCHEMA_CONTEXT_MEDIA_TYPE,
    digest: digestCanonicalResource({
      relations: (context.relations ?? []) as unknown as ProtocolValue,
      provenanceByPath: (context.provenanceByPath ?? {}) as unknown as ProtocolValue,
      ...(context.rootKey === undefined ? {} : { rootKey: context.rootKey }),
    }),
  };
}

function assertResourceBinding(
  actual: ResourceDescriptor,
  expected: ResourceDescriptor,
  path: string
): void {
  if (actual.mediaType !== expected.mediaType || actual.digest !== expected.digest) {
    throw new SchemaInvalidError(
      'Resource descriptor does not bind the supplied canonical content',
      path
    );
  }
}

function normalizedNativeResult(result: ValidationResult): ValidationResult {
  return JSON.parse(
    canonicalizeProtocolValue(result as unknown as ProtocolValue)
  ) as ValidationResult;
}

function hasExternalContext(input: YSchemaStatementProviderInput & { rootKey?: string }): boolean {
  return (
    (input.relations?.length ?? 0) > 0 ||
    Object.keys(input.provenanceByPath ?? {}).length > 0 ||
    input.rootKey !== undefined
  );
}

function assertSupportedState(state: State): void {
  if (
    state.codec.mediaType !== YOPS_STATE_MEDIA_TYPE ||
    state.codec.version !== YOPS_STATE_CODEC_VERSION
  ) {
    throw new UnsupportedMediaTypeError(
      `YSchema provider requires State codec ${YOPS_STATE_MEDIA_TYPE}@${YOPS_STATE_CODEC_VERSION}`
    );
  }
}

/**
 * Execute native YSchema once and attach its complete immutable result to the
 * validated State. The caller supplies run/time metadata; this provider reads
 * no clock, random source, storage, network, or repository head.
 */
function runYSchemaStatementProviderForTree(
  input: YSchemaStatementProviderInput & { rootKey?: string },
  resolveTree: () => ValidationInput['tree']
): YSchemaValidationStatement {
  const profile = input.profile ?? YSCHEMA_NATIVE_PROFILE;
  assertResourceBinding(
    input.schemaResource,
    createYSchemaResourceDescriptor(input.schemaResource.uri, input.schema),
    '$.schemaResource'
  );
  if (input.context.mode === 'bound') {
    assertResourceBinding(
      input.context.resource,
      createYSchemaContextDescriptor(input.context.resource.uri, input),
      '$.context.resource'
    );
  }
  const common = {
    tool: input.tool,
    run: input.run,
    environment: input.environment,
    schemaResource: input.schemaResource,
    profile,
    context: input.context,
  };

  if (!profileIsSupported(profile)) {
    return buildYSchemaValidationStatement({
      state: input.state,
      actor: input.actor,
      predicate: {
        ...common,
        outcome: 'unsupported',
        reason: `Unsupported YSchema profile ${profile.id}@${profile.version}`,
      },
    });
  }

  if (input.context.mode === 'unspecified' && hasExternalContext(input)) {
    throw new SchemaInvalidError(
      'Relations, provenance, or semantic root selection require a bound validation context resource',
      '$.context'
    );
  }

  assertSupportedState(input.state);

  const result = normalizedNativeResult(
    validateTree({
      tree: resolveTree(),
      relations: input.relations,
      schema: input.schema,
      provenanceByPath: input.provenanceByPath,
    })
  );
  const predicate: YSchemaValidationPredicate = {
    ...common,
    outcome: result.valid && result.ready ? 'passed' : 'failed',
    valid: result.valid,
    ready: result.ready,
    errors: result.errors,
    gaps: result.gaps,
    fixes: result.fixes,
  } as YSchemaValidationPredicate;

  return buildYSchemaValidationStatement({
    state: input.state,
    actor: input.actor,
    predicate,
  });
}

/**
 * Select the schema-bound root from an explicit repository SemanticContent
 * State. Root selection is exact so validation never guesses another State
 * shape or silently validates an unrelated tree.
 */
export function repositorySemanticYSchemaTree(
  state: State,
  rootKey: string
): ValidationInput['tree'] {
  const normalizedRootKey = rootKey.trim();
  if (!normalizedRootKey) {
    throw new SchemaInvalidError('Repository semantic YSchema root key is required', '$.rootKey');
  }
  const content = decodeRepositorySemanticState(state);
  const matches = content.trees.filter((tree) => tree.key === normalizedRootKey);
  if (matches.length !== 1) {
    throw new SchemaInvalidError(
      `Repository semantic State must contain exactly one ${normalizedRootKey} root tree`,
      '$.state.value.content.trees'
    );
  }
  const wrapped = treesToYValue(matches);
  if (wrapped === null || typeof wrapped !== 'object' || Array.isArray(wrapped)) {
    throw new SchemaInvalidError(
      'Repository semantic root tree could not be converted to YSchema input',
      '$.state.value.content.trees'
    );
  }
  return wrapped[normalizedRootKey] as ValidationInput['tree'];
}

/** Execute native YSchema against a repository SemanticContent root. */
export function runRepositorySemanticYSchemaStatementProvider(
  input: RepositorySemanticYSchemaStatementProviderInput
): YSchemaValidationStatement {
  return runYSchemaStatementProviderForTree(input, () =>
    repositorySemanticYSchemaTree(input.state, input.rootKey)
  );
}

/** Execute native YSchema against a generic YOps State document. */
export function runYSchemaStatementProvider(
  input: YSchemaStatementProviderInput
): YSchemaValidationStatement {
  return runYSchemaStatementProviderForTree(
    input,
    () => yopsStateCodec.decode(input.state.value) as ValidationInput['tree']
  );
}
