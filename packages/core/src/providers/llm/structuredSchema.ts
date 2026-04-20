import type { ZodType } from 'zod';
import { zodToJsonSchema } from '../../llm/zodToJsonSchema';

type JsonSchema = Record<string, unknown>;

function inferLiteralType(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeConstNode(node: Record<string, unknown>): Record<string, unknown> {
  if (!('const' in node)) {
    return node;
  }

  const literalType = inferLiteralType(node.const);
  if (!literalType) {
    return node;
  }

  const { const: literalValue, ...rest } = node;
  return {
    ...rest,
    type: literalType,
    enum: [literalValue],
  };
}

function normalizeEnumNode(node: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(node.enum) || node.enum.length === 0 || 'type' in node) {
    return node;
  }

  const inferredTypes = [...new Set(node.enum.map(inferLiteralType))];
  if (inferredTypes.length !== 1 || !inferredTypes[0]) {
    return node;
  }

  return {
    ...node,
    type: inferredTypes[0],
  };
}

function normalizeOpenAISchemaNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalizeOpenAISchemaNode);
  }
  if (!isObject(node)) {
    return node;
  }

  const transformed = normalizeEnumNode(
    normalizeConstNode(
      Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, normalizeOpenAISchemaNode(value)])
      )
    )
  );

  return transformed;
}

function normalizeGeminiNullable(node: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(node.anyOf) || node.anyOf.length !== 2) {
    return node;
  }

  const normalizedVariants = node.anyOf.map((variant) => normalizeGeminiSchemaNode(variant));
  const nullVariant = normalizedVariants.find(
    (variant) => isObject(variant) && variant.type === 'null'
  );
  const nonNullVariant = normalizedVariants.find(
    (variant) => !(isObject(variant) && variant.type === 'null')
  );

  if (!nullVariant || !isObject(nonNullVariant)) {
    return {
      ...node,
      anyOf: normalizedVariants,
    };
  }

  const { anyOf: _removed, ...rest } = node;
  return {
    ...rest,
    ...nonNullVariant,
    nullable: true,
  };
}

function normalizeGeminiSchemaNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalizeGeminiSchemaNode);
  }
  if (!isObject(node)) {
    return node;
  }

  const mapped = Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== 'additionalProperties')
      .map(([key, value]) => [key, normalizeGeminiSchemaNode(value)])
  );

  return normalizeGeminiNullable(normalizeEnumNode(normalizeConstNode(mapped)));
}

function normalizeClaudeSchemaNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalizeClaudeSchemaNode);
  }
  if (!isObject(node)) {
    return node;
  }

  const mapped = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, normalizeClaudeSchemaNode(value)])
  );
  const normalized = normalizeEnumNode(normalizeConstNode(mapped));

  if (
    normalized.type === 'integer' &&
    typeof normalized.minimum === 'number' &&
    typeof normalized.maximum === 'number' &&
    normalized.minimum === normalized.maximum
  ) {
    const { minimum, maximum, ...rest } = normalized;
    return {
      ...rest,
      type: 'integer',
      enum: [minimum],
    };
  }

  if (
    (normalized.type === 'integer' || normalized.type === 'number') &&
    ('minimum' in normalized || 'maximum' in normalized)
  ) {
    const { minimum, maximum, ...rest } = normalized;
    return rest;
  }

  return normalized;
}

export function toOpenAIStructuredSchema<T>(schema: ZodType<T>): JsonSchema {
  return normalizeOpenAISchemaNode(zodToJsonSchema(schema)) as JsonSchema;
}

export function toGeminiStructuredSchema<T>(schema: ZodType<T>): JsonSchema {
  return normalizeGeminiSchemaNode(zodToJsonSchema(schema)) as JsonSchema;
}

export function toClaudeStructuredSchema<T>(schema: ZodType<T>): JsonSchema {
  return normalizeClaudeSchemaNode(zodToJsonSchema(schema)) as JsonSchema;
}

function normalizeProviderDraftChildren(candidate: Record<string, unknown>): Record<string, unknown> {
  const rawChildren = candidate.children_json;
  if (typeof rawChildren !== 'string') {
    return candidate;
  }

  try {
    const parsed = JSON.parse(rawChildren);
    if (!Array.isArray(parsed)) {
      return candidate;
    }

    const normalized = parsed.map((child) => {
      if (!isObject(child)) {
        return child;
      }

      if ('key' in child) {
        const description = typeof child.description === 'string' ? child.description : undefined;
        const nextChild = { ...child };
        delete nextChild.description;

        let parsedValuesJson: Record<string, unknown> | undefined;
        if (typeof nextChild.values_json === 'string') {
          try {
            const valuesJson = JSON.parse(nextChild.values_json);
            if (isObject(valuesJson)) {
              parsedValuesJson = valuesJson;
            }
          } catch {
            // ignore invalid nested JSON and leave as-is
          }
        }

        let parsedValueJson: unknown;
        if (typeof nextChild.value_json === 'string') {
          try {
            parsedValueJson = JSON.parse(nextChild.value_json);
          } catch {
            // ignore invalid nested JSON and leave as-is
          }
        }

        let parsedChildrenJson: unknown[] | undefined;
        if (typeof nextChild.children_json === 'string') {
          try {
            const childrenJson = JSON.parse(nextChild.children_json);
            if (Array.isArray(childrenJson)) {
              parsedChildrenJson = childrenJson;
            }
          } catch {
            // ignore invalid nested JSON and leave as-is
          }
        }

        const nextValues = {
          ...(isObject(nextChild.values) ? nextChild.values : {}),
          ...(parsedValuesJson ?? {}),
          ...(description ? { description } : {}),
          ...(typeof nextChild.value === 'string' ? { value: nextChild.value } : {}),
          ...(parsedValueJson !== undefined ? { value: parsedValueJson } : {}),
          ...(Array.isArray(nextChild.children) ? { children: nextChild.children } : {}),
          ...(parsedChildrenJson ? { children: parsedChildrenJson } : {}),
        };

        delete nextChild.value;
        delete nextChild.value_json;
        delete nextChild.children;
        delete nextChild.children_json;
        delete nextChild.values;
        delete nextChild.values_json;

        return Object.keys(nextValues).length > 0
          ? {
              ...nextChild,
              values: nextValues,
            }
          : nextChild;
      }

      const aliasEntry = Object.entries(child).find(([key, value]) => key !== 'description' && typeof value === 'string');
      if (!aliasEntry) {
        return child;
      }

      const [aliasKey, aliasValue] = aliasEntry;
      const description = typeof child.description === 'string' ? child.description : undefined;
      return {
        key: aliasValue,
        ...(description ? { values: { description } } : {}),
      };
    });

    return {
      ...candidate,
      children_json: JSON.stringify(normalized),
    };
  } catch {
    return candidate;
  }
}

export function normalizeClaudeStructuredData<T>(data: T): T {
  if (!isObject(data) || data.schema !== 't3x/provider-extraction-draft' || !Array.isArray(data.items)) {
    return data;
  }

  return {
    ...data,
    items: data.items.map((item) =>
      isObject(item) && isObject(item.candidate)
        ? {
            ...item,
            candidate: normalizeProviderDraftChildren(item.candidate),
          }
        : item
    ),
  } as T;
}

export function normalizeGeminiStructuredData<T>(data: T): T {
  if (!isObject(data) || data.schema !== 't3x/provider-extraction-draft' || !Array.isArray(data.items)) {
    return data;
  }

  return {
    ...data,
    items: data.items.map((item) =>
      isObject(item) && isObject(item.candidate)
        ? {
            ...item,
            candidate: normalizeProviderDraftChildren(item.candidate),
          }
        : item
    ),
  } as T;
}
