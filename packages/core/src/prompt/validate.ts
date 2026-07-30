import { canonicalize } from 'json-canonicalize';
import { parsePromptPlaceholders } from './placeholders';
import type { PromptCompileIssue, PromptPolicyRelation, PromptPolicyResult } from './types';

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

function push(
  target: PromptCompileIssue[],
  code: string,
  path: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const definedDetails = details
    ? Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined))
    : undefined;
  target.push({
    code,
    path,
    message,
    source: 'policy',
    blocking: true,
    ...(definedDetails && Object.keys(definedDetails).length > 0
      ? { details: definedDetails }
      : {}),
  });
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

function relationExists(
  relations: readonly PromptPolicyRelation[],
  type: string,
  from: string,
  to: string
): boolean {
  const normalizedTo = normalizeEndpoint(to);
  return relationTargets(relations, type, from).includes(normalizedTo);
}

function endpointKey(endpoint: string, collection: string): string | null {
  const prefix = `${collection}/`;
  return endpoint.startsWith(prefix) ? endpoint.slice(prefix.length) : null;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.keys(record).includes(key);
}

function valueMatchesType(value: unknown, valueType: unknown): boolean {
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

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

/**
 * Applies deterministic Prompt cross-field rules that YSchema P0 cannot express.
 * Structural types, required slots, provenance, and relation endpoints remain in YSchema.
 */
export function validatePromptPolicy(
  tree: Record<string, unknown>,
  relations: readonly PromptPolicyRelation[] = []
): PromptPolicyResult {
  const errors: PromptCompileIssue[] = [];
  const gaps: PromptCompileIssue[] = [];
  const variables = recordsAt(tree, 'variables');
  const messages = recordsAt(tree, 'messages');
  const contexts = recordsAt(tree, 'contexts');
  const resources = recordsAt(tree, 'resources');
  const checks = recordsAt(tree, 'checks');
  const evals = recordsAt(tree, 'evals');
  const runtime = isRecord(tree.runtime) ? tree.runtime : {};
  const output = isRecord(tree.output) ? tree.output : {};
  const variableByKey = new Map(variables);
  const resourceByKey = new Map(resources);

  if (variables.length === 0) {
    push(
      gaps,
      'PROMPT_VARIABLE_REQUIRED',
      'variables',
      'A ready prompt needs a declared variable.'
    );
  }
  if (messages.length === 0) {
    push(gaps, 'PROMPT_MESSAGE_REQUIRED', 'messages', 'A ready prompt needs a message template.');
  }

  const usedVariableKeys = new Set<string>();
  const sequenceOwners = new Map<number, string>();
  for (const [messageKey, message] of messages) {
    const path = `messages/${messageKey}`;
    const sequence = message.sequence;
    if (typeof sequence === 'number') {
      const previous = sequenceOwners.get(sequence);
      if (previous) {
        push(
          errors,
          'PROMPT_DUPLICATE_MESSAGE_SEQUENCE',
          `${path}/sequence`,
          `Message sequence ${sequence} is used by both ${previous} and ${messageKey}.`,
          { sequence, previous, current: messageKey }
        );
      } else {
        sequenceOwners.set(sequence, messageKey);
      }
    }

    if (typeof message.template !== 'string') continue;
    const parsed = parsePromptPlaceholders(message.template);
    for (const issue of parsed.issues) {
      push(errors, 'PROMPT_INVALID_PLACEHOLDER', `${path}/template`, issue.message, {
        offset: issue.offset,
        raw: issue.raw,
      });
    }

    const placeholderKeys = new Set(parsed.placeholders.map((placeholder) => placeholder.key));
    for (const variableKey of [...placeholderKeys].sort()) {
      usedVariableKeys.add(variableKey);
      if (!variableByKey.has(variableKey)) {
        push(
          errors,
          'PROMPT_UNDECLARED_VARIABLE',
          `${path}/template`,
          `Template variable ${variableKey} is not declared.`,
          { variableKey }
        );
        continue;
      }
      if (!relationExists(relations, 'uses_variable', path, `variables/${variableKey}`)) {
        push(
          errors,
          'PROMPT_VARIABLE_RELATION_MISSING',
          `${path}/template`,
          `Template variable ${variableKey} needs a uses_variable relation.`,
          { variableKey }
        );
      }
    }

    for (const endpoint of relationTargets(relations, 'uses_variable', path)) {
      const variableKey = endpointKey(endpoint, 'variables');
      if (variableKey && !placeholderKeys.has(variableKey)) {
        push(
          errors,
          'PROMPT_VARIABLE_RELATION_STALE',
          `${path}/template`,
          `uses_variable points to ${variableKey}, but the template does not reference it.`,
          { variableKey }
        );
      }
    }
  }

  for (const [variableKey, variable] of variables) {
    const path = `variables/${variableKey}`;
    if (variable.required === true && !usedVariableKeys.has(variableKey)) {
      push(
        errors,
        'PROMPT_REQUIRED_VARIABLE_UNUSED',
        path,
        `Required variable ${variableKey} is not referenced by any message.`
      );
    }

    const hasDefault = hasOwn(variable, 'default_value');
    if (hasDefault && !valueMatchesType(variable.default_value, variable.value_type)) {
      push(
        errors,
        'PROMPT_DEFAULT_TYPE_MISMATCH',
        `${path}/default_value`,
        `Default value does not match ${String(variable.value_type)}.`,
        { valueType: variable.value_type }
      );
    }
    if (variable.source === 'default' && !hasDefault) {
      push(
        errors,
        'PROMPT_DEFAULT_VALUE_REQUIRED',
        `${path}/default_value`,
        'Variables with source default must declare default_value.'
      );
    }
    if (variable.on_missing === 'use_default' && !hasDefault) {
      push(
        errors,
        'PROMPT_MISSING_DEFAULT_VALUE',
        `${path}/default_value`,
        'on_missing use_default requires default_value.'
      );
    }
    if (
      hasDefault &&
      Array.isArray(variable.enum_values) &&
      !variable.enum_values.some((value) => valuesEqual(value, variable.default_value))
    ) {
      push(
        errors,
        'PROMPT_DEFAULT_NOT_IN_ENUM',
        `${path}/default_value`,
        'Default value must be included in enum_values.'
      );
    }
    if (typeof variable.value_pattern === 'string') {
      try {
        new RegExp(variable.value_pattern);
      } catch {
        push(
          errors,
          'PROMPT_VARIABLE_PATTERN_INVALID',
          `${path}/value_pattern`,
          'value_pattern must be a valid regular expression.',
          { pattern: variable.value_pattern }
        );
      }
    }
  }

  for (const [contextKey, context] of contexts) {
    const path = `contexts/${contextKey}`;
    if (typeof context.resource_key === 'string') {
      if (!resourceByKey.has(context.resource_key)) {
        push(
          errors,
          'PROMPT_CONTEXT_RESOURCE_UNKNOWN',
          `${path}/resource_key`,
          `Context resource ${context.resource_key} is not declared.`,
          { resourceKey: context.resource_key }
        );
      }
    }
    if (
      context.required === true &&
      relationTargets(relations, 'provides_context', path).length === 0
    ) {
      push(
        gaps,
        'PROMPT_CONTEXT_TARGET_REQUIRED',
        path,
        'Required context must target at least one message with provides_context.'
      );
    }
  }

  if (
    typeof runtime.response_format === 'string' &&
    typeof output.format === 'string' &&
    runtime.response_format !== output.format
  ) {
    push(
      errors,
      'PROMPT_OUTPUT_FORMAT_MISMATCH',
      'output/format',
      'Runtime response_format must match output format.',
      { runtimeFormat: runtime.response_format, outputFormat: output.format }
    );
  }

  if (output.format === 'json_schema') {
    if (typeof output.schema_resource !== 'string' || !output.schema_resource.trim()) {
      push(
        errors,
        'PROMPT_OUTPUT_SCHEMA_REQUIRED',
        'output/schema_resource',
        'JSON Schema output must name a schema resource.'
      );
    } else {
      const resource = resourceByKey.get(output.schema_resource);
      if (!resource) {
        push(
          errors,
          'PROMPT_OUTPUT_SCHEMA_UNKNOWN',
          'output/schema_resource',
          `Output schema resource ${output.schema_resource} is not declared.`,
          { resourceKey: output.schema_resource }
        );
      } else if (resource.kind !== 'schema') {
        push(
          errors,
          'PROMPT_OUTPUT_SCHEMA_KIND_INVALID',
          'output/schema_resource',
          `Output resource ${output.schema_resource} must have kind schema.`,
          { resourceKey: output.schema_resource, kind: resource.kind }
        );
      }
      if (
        !relationExists(
          relations,
          'uses_output_schema',
          'output',
          `resources/${output.schema_resource}`
        )
      ) {
        push(
          errors,
          'PROMPT_OUTPUT_SCHEMA_RELATION_REQUIRED',
          'output/schema_resource',
          `Output schema ${output.schema_resource} needs a uses_output_schema relation.`,
          { resourceKey: output.schema_resource }
        );
      }
    }
  }

  for (const [checkKey, check] of checks) {
    if (typeof check.fixture_resource === 'string') {
      const resource = resourceByKey.get(check.fixture_resource);
      if (!resource) {
        push(
          errors,
          'PROMPT_CHECK_FIXTURE_UNKNOWN',
          `checks/${checkKey}/fixture_resource`,
          `Check fixture ${check.fixture_resource} is not declared.`,
          { resourceKey: check.fixture_resource }
        );
      } else if (resource.kind !== 'fixture') {
        push(
          errors,
          'PROMPT_CHECK_FIXTURE_KIND_INVALID',
          `checks/${checkKey}/fixture_resource`,
          `Check resource ${check.fixture_resource} must have kind fixture.`,
          { resourceKey: check.fixture_resource, kind: resource.kind }
        );
      }
    }
  }

  for (const [evalKey, evaluation] of evals) {
    if (typeof evaluation.fixture_resource !== 'string') continue;
    const resource = resourceByKey.get(evaluation.fixture_resource);
    if (!resource) {
      push(
        errors,
        'PROMPT_EVAL_FIXTURE_UNKNOWN',
        `evals/${evalKey}/fixture_resource`,
        `Evaluation fixture ${evaluation.fixture_resource} is not declared.`,
        { resourceKey: evaluation.fixture_resource }
      );
    } else if (resource.kind !== 'fixture') {
      push(
        errors,
        'PROMPT_EVAL_FIXTURE_KIND_INVALID',
        `evals/${evalKey}/fixture_resource`,
        `Evaluation resource ${evaluation.fixture_resource} must have kind fixture.`,
        { resourceKey: evaluation.fixture_resource, kind: resource.kind }
      );
    }
  }

  const blockingChecks = checks.filter(
    ([, check]) =>
      check.blocking === true &&
      (check.kind === 'template_compile' || check.kind === 'output_schema')
  );
  if (blockingChecks.length === 0) {
    push(
      gaps,
      'PROMPT_BLOCKING_CHECK_REQUIRED',
      'checks',
      'A ready prompt needs a blocking template or output check.'
    );
  }

  errors.sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
  gaps.sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );

  return {
    valid: errors.length === 0,
    ready: errors.length === 0 && gaps.length === 0,
    errors,
    gaps,
  };
}
