import type { YValue } from '@t3x-dev/yops';
import {
  t3xPromptP0Fixtures,
  type ValidationError,
  type ValidationGap,
  validateTree as validateYSchemaTree,
  type YSchemaRelation,
} from '@t3x-dev/yschema';
import { canonicalize } from 'json-canonicalize';
import { sha256 } from '../common';
import { parsePromptPlaceholders, renderPromptTemplate } from './placeholders';
import type {
  CompiledPromptMessage,
  CompiledPromptOutput,
  CompilePromptInput,
  PromptCompileIssue,
  PromptCompileResult,
  PromptContextResolution,
  PromptPolicyRelation,
  PromptResourceResolution,
  PromptVariableResolution,
} from './types';
import { validatePromptPolicy } from './validate';

export const PROMPT_COMPILER_VERSION = 't3x-prompt-compiler@0.1.0';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordsAt(
  tree: Record<string, unknown>,
  key: string
): Array<[string, Record<string, unknown>]> {
  const value = tree[key];
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right));
}

function normalizeEndpoint(value: string): string {
  return value.replace(/^prompt\//, '').replace(/^\//, '');
}

function relationTargets(
  relations: readonly PromptPolicyRelation[],
  type: string,
  from: string
): string[] {
  const normalizedFrom = normalizeEndpoint(from);
  return [
    ...new Set(
      relations
        .filter(
          (relation) =>
            relation.type === type && normalizeEndpoint(relation.from) === normalizedFrom
        )
        .map((relation) => normalizeEndpoint(relation.to))
    ),
  ].sort();
}

function relationSources(
  relations: readonly PromptPolicyRelation[],
  type: string,
  to: string
): string[] {
  const normalizedTo = normalizeEndpoint(to);
  return [
    ...new Set(
      relations
        .filter(
          (relation) => relation.type === type && normalizeEndpoint(relation.to) === normalizedTo
        )
        .map((relation) => normalizeEndpoint(relation.from))
    ),
  ].sort();
}

function endpointKey(endpoint: string, collection: string): string | null {
  const prefix = `${collection}/`;
  return endpoint.startsWith(prefix) ? endpoint.slice(prefix.length) : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hasOwn(record: object, key: string): boolean {
  return Object.keys(record).includes(key);
}

function prefixedSha256(value: unknown): string {
  return `sha256:${sha256(value)}`;
}

function compileIssue(
  code: string,
  path: string,
  message: string,
  details?: Record<string, unknown>
): PromptCompileIssue {
  const definedDetails = details
    ? Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined))
    : undefined;
  return {
    code,
    path,
    message,
    source: 'compile',
    blocking: true,
    ...(definedDetails && Object.keys(definedDetails).length > 0
      ? { details: definedDetails }
      : {}),
  };
}

function fromYSchemaError(error: ValidationError): PromptCompileIssue {
  return {
    code: error.code,
    path: error.path,
    message: error.message,
    source: 'yschema',
    blocking: true,
    ...(error.details ? { details: error.details } : {}),
  };
}

function fromYSchemaGap(gap: ValidationGap): PromptCompileIssue {
  const details = {
    ...(gap.details ?? {}),
    ...(gap.gapQuestion ? { gapQuestion: gap.gapQuestion } : {}),
    ...(gap.fixIds ? { fixIds: gap.fixIds } : {}),
  };
  return {
    code: gap.code,
    path: gap.path,
    message: gap.message,
    source: 'yschema',
    blocking: true,
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function valueMatchesType(value: YValue, valueType: unknown): boolean {
  switch (valueType) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isRecord(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

function valuesEqual(left: YValue, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

function emptyValue(valueType: unknown): YValue {
  switch (valueType) {
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return 0;
    case 'object':
      return {};
    default:
      return '';
  }
}

function usedVariableKeys(tree: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const [, message] of recordsAt(tree, 'messages')) {
    if (typeof message.template !== 'string') continue;
    for (const placeholder of parsePromptPlaceholders(message.template).placeholders) {
      keys.add(placeholder.key);
    }
  }
  return keys;
}

function resolveVariables(input: CompilePromptInput): {
  resolutions: PromptVariableResolution[];
  values: Record<string, YValue>;
  issues: PromptCompileIssue[];
} {
  const resolutions: PromptVariableResolution[] = [];
  const values: Record<string, YValue> = {};
  const issues: PromptCompileIssue[] = [];
  const usedKeys = usedVariableKeys(input.tree);
  const suppliedValues = input.variableValues ?? {};
  const contextContents = input.contextContents ?? {};

  for (const [key, variable] of recordsAt(input.tree, 'variables')) {
    const path = `variables/${key}`;
    const source = stringValue(variable.source);
    const required = variable.required === true;
    const sensitive = variable.sensitive === true;
    const hasSuppliedValue = hasOwn(suppliedValues, key);
    const hasContextValue = source === 'context' && hasOwn(contextContents, key);
    const hasDefault = hasOwn(variable, 'default_value');
    let status: PromptVariableResolution['status'] = 'missing';
    let value: YValue | undefined;

    if (hasSuppliedValue) {
      value = suppliedValues[key] as YValue;
      status = 'resolved';
    } else if (hasContextValue) {
      value = contextContents[key] as string;
      status = 'resolved';
    } else if ((source === 'default' || variable.on_missing === 'use_default') && hasDefault) {
      value = variable.default_value as YValue;
      status = 'defaulted';
    } else if (variable.on_missing === 'use_empty') {
      value = emptyValue(variable.value_type);
      status = 'empty';
    }

    if (value !== undefined && !valueMatchesType(value, variable.value_type)) {
      status = 'invalid';
      issues.push(
        compileIssue(
          'PROMPT_VARIABLE_VALUE_TYPE_INVALID',
          path,
          `Resolved value for ${key} does not match ${String(variable.value_type)}.`,
          { variableKey: key, valueType: variable.value_type }
        )
      );
    }

    if (
      value !== undefined &&
      status !== 'invalid' &&
      Array.isArray(variable.enum_values) &&
      !variable.enum_values.some((allowed) => valuesEqual(value as YValue, allowed))
    ) {
      status = 'invalid';
      issues.push(
        compileIssue(
          'PROMPT_VARIABLE_VALUE_NOT_IN_ENUM',
          path,
          `Resolved value for ${key} is not included in enum_values.`,
          { variableKey: key, allowed: variable.enum_values }
        )
      );
    }

    if (
      typeof value === 'string' &&
      status !== 'invalid' &&
      typeof variable.value_pattern === 'string'
    ) {
      try {
        if (!new RegExp(variable.value_pattern).test(value)) {
          status = 'invalid';
          issues.push(
            compileIssue(
              'PROMPT_VARIABLE_VALUE_PATTERN_MISMATCH',
              path,
              `Resolved value for ${key} does not match value_pattern.`,
              { variableKey: key, pattern: variable.value_pattern }
            )
          );
        }
      } catch {
        // The policy validator owns invalid regular-expression declarations.
      }
    }

    if (value !== undefined && status !== 'invalid') values[key] = value;
    resolutions.push({
      key,
      path,
      source,
      required,
      sensitive,
      status,
      ...(value !== undefined ? { value } : {}),
    });

    if (status === 'missing' && (required || usedKeys.has(key))) {
      issues.push(
        compileIssue('PROMPT_VARIABLE_UNRESOLVED', path, `Variable ${key} could not be resolved.`, {
          variableKey: key,
          onMissing: variable.on_missing,
        })
      );
    }
  }

  return { resolutions, values, issues };
}

function resolveContexts(
  input: CompilePromptInput,
  relations: readonly PromptPolicyRelation[]
): { resolutions: PromptContextResolution[]; issues: PromptCompileIssue[] } {
  const resolutions: PromptContextResolution[] = [];
  const issues: PromptCompileIssue[] = [];
  const contextContents = input.contextContents ?? {};
  const resourceContents = input.resourceContents ?? {};

  for (const [key, context] of recordsAt(input.tree, 'contexts')) {
    const path = `contexts/${key}`;
    const resourceKey = typeof context.resource_key === 'string' ? context.resource_key : undefined;
    const directContent = contextContents[key];
    const resourceContent = resourceKey ? resourceContents[resourceKey] : undefined;
    const content = directContent ?? resourceContent;
    const required = context.required === true;
    const targetMessageKeys = relationTargets(relations, 'provides_context', path)
      .map((endpoint) => endpointKey(endpoint, 'messages'))
      .filter((messageKey): messageKey is string => messageKey !== null)
      .sort();

    resolutions.push({
      key,
      path,
      kind: stringValue(context.kind),
      loadPolicy: stringValue(context.load_policy),
      placement: stringValue(context.placement),
      required,
      status: content === undefined ? 'missing' : 'resolved',
      targetMessageKeys,
      ...(resourceKey ? { resourceKey } : {}),
      ...(content === undefined ? {} : { content, contentHash: prefixedSha256(content) }),
    });

    if (
      content === undefined &&
      (required || context.on_empty === 'ask_user' || context.on_empty === 'report_and_stop')
    ) {
      issues.push(
        compileIssue('PROMPT_CONTEXT_UNRESOLVED', path, `Context ${key} could not be resolved.`, {
          contextKey: key,
          resourceKey,
          onEmpty: context.on_empty,
        })
      );
    }
  }

  return { resolutions, issues };
}

function referencedResourceKeys(
  tree: Record<string, unknown>,
  relations: readonly PromptPolicyRelation[],
  contextContents: Readonly<Record<string, string>>
): Set<string> {
  const keys = new Set<string>();
  for (const [messageKey] of recordsAt(tree, 'messages')) {
    for (const endpoint of relationTargets(relations, 'uses_resource', `messages/${messageKey}`)) {
      const key = endpointKey(endpoint, 'resources');
      if (key) keys.add(key);
    }
  }
  const output = isRecord(tree.output) ? tree.output : {};
  if (typeof output.schema_resource === 'string') keys.add(output.schema_resource);
  for (const [contextKey, context] of recordsAt(tree, 'contexts')) {
    if (!hasOwn(contextContents, contextKey) && typeof context.resource_key === 'string') {
      keys.add(context.resource_key);
    }
  }
  return keys;
}

function resolveResources(
  input: CompilePromptInput,
  relations: readonly PromptPolicyRelation[]
): { resolutions: PromptResourceResolution[]; issues: PromptCompileIssue[] } {
  const resolutions: PromptResourceResolution[] = [];
  const issues: PromptCompileIssue[] = [];
  const resourceContents = input.resourceContents ?? {};
  const referencedKeys = referencedResourceKeys(input.tree, relations, input.contextContents ?? {});

  for (const [key, resource] of recordsAt(input.tree, 'resources')) {
    const path = `resources/${key}`;
    const content = resourceContents[key];
    const referenced = referencedKeys.has(key);
    resolutions.push({
      key,
      path,
      kind: stringValue(resource.kind),
      bundlePath: stringValue(resource.path),
      referenced,
      available: content !== undefined,
      ...(content === undefined ? {} : { contentHash: prefixedSha256(content) }),
    });
    if (referenced && content === undefined) {
      issues.push(
        compileIssue(
          'PROMPT_RESOURCE_CONTENT_MISSING',
          `${path}/path`,
          `Referenced resource ${key} has no compiler content.`,
          { resourceKey: key, bundlePath: resource.path }
        )
      );
    }
  }

  return { resolutions, issues };
}

function validateJsonSchemaDocument(value: YValue): string | null {
  if (!isRecord(value)) return 'JSON Schema root must be an object.';
  const schemaKeywords = [
    '$schema',
    '$id',
    '$ref',
    'type',
    'properties',
    'items',
    'allOf',
    'anyOf',
    'oneOf',
    'enum',
    'const',
  ];
  if (!schemaKeywords.some((keyword) => hasOwn(value, keyword))) {
    return 'JSON Schema must contain at least one recognized schema keyword.';
  }
  if (value.type !== undefined) {
    const allowed = new Set(['null', 'boolean', 'object', 'array', 'number', 'string', 'integer']);
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (!types.every((type) => typeof type === 'string' && allowed.has(type))) {
      return 'JSON Schema type must use recognized JSON types.';
    }
  }
  if (value.properties !== undefined && !isRecord(value.properties)) {
    return 'JSON Schema properties must be an object.';
  }
  if (
    value.required !== undefined &&
    (!Array.isArray(value.required) || !value.required.every((key) => typeof key === 'string'))
  ) {
    return 'JSON Schema required must be an array of strings.';
  }
  return null;
}

function compileOutput(
  tree: Record<string, unknown>,
  resourceContents: Readonly<Record<string, string>>
): { output: CompiledPromptOutput; issues: PromptCompileIssue[] } {
  const source = isRecord(tree.output) ? tree.output : {};
  const schemaResource =
    typeof source.schema_resource === 'string' ? source.schema_resource : undefined;
  const output: CompiledPromptOutput = {
    format: stringValue(source.format),
    strict: source.strict === true,
    onParseFailure: stringValue(source.on_parse_failure),
    maxRetries: numberValue(source.max_retries),
    ...(schemaResource ? { schemaResource } : {}),
  };
  const issues: PromptCompileIssue[] = [];

  if (source.format !== 'json_schema' || !schemaResource) return { output, issues };
  const content = resourceContents[schemaResource];
  if (content === undefined) return { output, issues };

  try {
    const schema = JSON.parse(content) as YValue;
    const invalidReason = validateJsonSchemaDocument(schema);
    if (invalidReason) {
      issues.push(
        compileIssue(
          'PROMPT_OUTPUT_SCHEMA_INVALID',
          `resources/${schemaResource}/path`,
          invalidReason,
          { resourceKey: schemaResource }
        )
      );
    } else {
      output.schema = schema;
      output.schemaHash = prefixedSha256(canonicalize(schema));
    }
  } catch (error) {
    issues.push(
      compileIssue(
        'PROMPT_OUTPUT_SCHEMA_INVALID',
        `resources/${schemaResource}/path`,
        'Output schema resource must contain valid JSON.',
        {
          resourceKey: schemaResource,
          reason: error instanceof Error ? error.message : 'Unknown JSON parse error.',
        }
      )
    );
  }

  return { output, issues };
}

function compileMessages(
  tree: Record<string, unknown>,
  relations: readonly PromptPolicyRelation[],
  values: Readonly<Record<string, YValue>>
): { messages: CompiledPromptMessage[]; issues: PromptCompileIssue[] } {
  const messages: CompiledPromptMessage[] = [];
  const issues: PromptCompileIssue[] = [];
  const entries = recordsAt(tree, 'messages').sort((left, right) => {
    const leftSequence = numberValue(left[1].sequence, Number.MAX_SAFE_INTEGER);
    const rightSequence = numberValue(right[1].sequence, Number.MAX_SAFE_INTEGER);
    return leftSequence - rightSequence || left[0].localeCompare(right[0]);
  });

  for (const [key, message] of entries) {
    const path = `messages/${key}`;
    const template = stringValue(message.template);
    let rendered = renderPromptTemplate(template, values);
    if (
      rendered.unresolvedKeys.length > 0 &&
      message.optional === true &&
      message.on_missing_variable === 'omit_message'
    ) {
      continue;
    }
    if (rendered.unresolvedKeys.length > 0 && message.on_missing_variable === 'use_empty') {
      const withEmptyValues: Record<string, YValue> = { ...values };
      for (const unresolvedKey of rendered.unresolvedKeys) withEmptyValues[unresolvedKey] = '';
      rendered = renderPromptTemplate(template, withEmptyValues);
    }
    if (rendered.unresolvedKeys.length > 0) {
      issues.push(
        compileIssue(
          'PROMPT_MESSAGE_VARIABLE_UNRESOLVED',
          `${path}/template`,
          `Message ${key} has unresolved template variables.`,
          { variableKeys: rendered.unresolvedKeys }
        )
      );
    }

    const variableKeys = [
      ...new Set(rendered.placeholders.map((placeholder) => placeholder.key)),
    ].sort();
    const contextKeys = relationSources(relations, 'provides_context', path)
      .map((endpoint) => endpointKey(endpoint, 'contexts'))
      .filter((contextKey): contextKey is string => contextKey !== null)
      .sort();
    const resourceKeys = relationTargets(relations, 'uses_resource', path)
      .map((endpoint) => endpointKey(endpoint, 'resources'))
      .filter((resourceKey): resourceKey is string => resourceKey !== null)
      .sort();
    messages.push({
      key,
      path,
      sequence: numberValue(message.sequence),
      role: stringValue(message.role),
      content: rendered.content,
      variableKeys,
      contextKeys,
      resourceKeys,
    });
  }

  return { messages, issues };
}

function stableIssues(issues: PromptCompileIssue[]): PromptCompileIssue[] {
  const unique = new Map<string, PromptCompileIssue>();
  for (const issue of issues) {
    const key = `${issue.source}\0${issue.code}\0${issue.path}\0${issue.message}`;
    if (!unique.has(key)) unique.set(key, issue);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.source.localeCompare(right.source)
  );
}

/** Compile a Prompt candidate without invoking an LLM, network, or host adapter. */
export function compilePrompt(input: CompilePromptInput): PromptCompileResult {
  const relations = input.relations ?? [];
  const yschemaValidation = validateYSchemaTree({
    schema: t3xPromptP0Fixtures.normalizedYSchema,
    tree: input.tree as YValue,
    relations: relations.map(
      (relation): YSchemaRelation => ({
        type: relation.type,
        from: relation.from,
        to: relation.to,
      })
    ),
    provenanceByPath: input.provenanceByPath,
  });
  const policyValidation = validatePromptPolicy(input.tree, relations);
  const variableResult = resolveVariables(input);
  const contextResult = resolveContexts(input, relations);
  const resourceResult = resolveResources(input, relations);
  const messageResult = compileMessages(input.tree, relations, variableResult.values);
  const outputResult = compileOutput(input.tree, input.resourceContents ?? {});
  const issues = stableIssues([
    ...yschemaValidation.errors.map(fromYSchemaError),
    ...yschemaValidation.gaps.map(fromYSchemaGap),
    ...policyValidation.errors,
    ...policyValidation.gaps,
    ...variableResult.issues,
    ...contextResult.issues,
    ...resourceResult.issues,
    ...messageResult.issues,
    ...outputResult.issues,
  ]);
  const compiled = !issues.some((issue) => issue.blocking);
  const result: PromptCompileResult = {
    compilerVersion: PROMPT_COMPILER_VERSION,
    compiled,
    schemaName: 't3x/prompt',
    schemaVersion: 'v1',
    messages: messageResult.messages,
    variables: variableResult.resolutions,
    contexts: contextResult.resolutions,
    resources: resourceResult.resolutions,
    output: outputResult.output,
    issues,
  };

  if (compiled) {
    result.compileHash = prefixedSha256({
      compilerVersion: result.compilerVersion,
      schemaName: result.schemaName,
      schemaVersion: result.schemaVersion,
      messages: result.messages,
      variables: result.variables,
      contexts: result.contexts,
      resources: result.resources,
      output: result.output,
    });
  }
  return result;
}

export function serializeCompiledPrompt(result: PromptCompileResult): string {
  return canonicalize(result);
}
