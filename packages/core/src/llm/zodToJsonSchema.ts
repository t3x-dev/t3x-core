/**
 * Minimal Zod v4 to JSON Schema converter.
 *
 * Handles the subset of Zod types used in FlatNodeSchema and TreeChangeBatchSchema:
 * object, string, number, boolean, array, enum, literal, union,
 * discriminatedUnion, record, lazy, optional, nullable, and refinements.
 *
 * Inspects Zod v4's `_zod.def` internal structure (not `_def`).
 */

import type { ZodTypeAny } from 'zod';

// biome-ignore lint/suspicious/noExplicitAny: JSON Schema output is inherently dynamic
type JsonSchema = Record<string, any>;

function getDef(schema: ZodTypeAny): Record<string, unknown> {
  // Zod v4 stores the def on _zod.def
  const z = (schema as unknown as { _zod?: { def?: Record<string, unknown> } })._zod;
  if (z?.def) return z.def;
  // Fallback to legacy _def (Zod v3)
  const legacy = (schema as unknown as { _def?: Record<string, unknown> })._def;
  if (legacy) return legacy;
  return {};
}

/**
 * Convert a Zod schema to a JSON Schema object.
 */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = getDef(schema);
  const type = def.type as string | undefined;

  switch (type) {
    case 'string':
      return convertString(def);

    case 'number':
    case 'int':
      return convertNumber(def, type === 'int');

    case 'boolean':
      return { type: 'boolean' };

    case 'literal': {
      const values = def.values as unknown[];
      // Single literal → const; multiple literals → enum
      if (Array.isArray(values) && values.length === 1) {
        return { const: values[0] };
      }
      if (Array.isArray(values) && values.length > 1) {
        return { enum: values };
      }
      return {};
    }

    case 'enum': {
      const entries = def.entries as Record<string, unknown> | undefined;
      const values = entries ? Object.values(entries) : [];
      return { enum: values };
    }

    case 'array': {
      const element = def.element as ZodTypeAny | undefined;
      return {
        type: 'array',
        items: element ? zodToJsonSchema(element) : {},
      };
    }

    case 'object': {
      const shape = def.shape as Record<string, ZodTypeAny> | undefined;
      if (!shape) return { type: 'object' };

      const properties: JsonSchema = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fieldDef = getDef(fieldSchema);
        const isOptional =
          fieldDef.type === 'optional' ||
          fieldDef.type === 'default' ||
          (fieldSchema as unknown as { isOptional?: () => boolean }).isOptional?.();

        if (isOptional) {
          // Unwrap optional/default to get the inner type for properties
          const inner = (fieldDef.innerType as ZodTypeAny | undefined) ?? fieldSchema;
          properties[key] = zodToJsonSchema(inner);
        } else {
          properties[key] = zodToJsonSchema(fieldSchema);
          required.push(key);
        }
      }

      const result: JsonSchema = { type: 'object', properties };
      if (required.length > 0) result.required = required;
      return result;
    }

    case 'record': {
      const valueType = def.valueType as ZodTypeAny | undefined;
      return {
        type: 'object',
        additionalProperties: valueType ? zodToJsonSchema(valueType) : {},
      };
    }

    case 'union': {
      // Note: In Zod v4, z.discriminatedUnion() produces the same def.type === 'union'
      // as z.union(). There is no separate 'discriminatedUnion' type to handle — both
      // are covered by this case via the options array.
      const options = def.options as ZodTypeAny[] | undefined;
      return {
        anyOf: (options ?? []).map(zodToJsonSchema),
      };
    }

    case 'optional': {
      const inner = def.innerType as ZodTypeAny | undefined;
      return inner ? zodToJsonSchema(inner) : {};
    }

    case 'nullable': {
      const inner = def.innerType as ZodTypeAny | undefined;
      return {
        anyOf: [inner ? zodToJsonSchema(inner) : {}, { type: 'null' }],
      };
    }

    case 'default': {
      const inner = def.innerType as ZodTypeAny | undefined;
      return inner ? zodToJsonSchema(inner) : {};
    }

    case 'lazy': {
      const getter = def.getter as (() => ZodTypeAny) | undefined;
      if (getter) {
        try {
          return zodToJsonSchema(getter());
        } catch {
          return {};
        }
      }
      return {};
    }

    case 'effects':
    case 'transform':
    case 'pipe': {
      // Refinements/transforms: recurse into inner schema
      const inner =
        (def.schema as ZodTypeAny | undefined) ??
        (def.in as ZodTypeAny | undefined) ??
        (def.innerType as ZodTypeAny | undefined);
      return inner ? zodToJsonSchema(inner) : {};
    }

    case 'intersection': {
      const left = def.left as ZodTypeAny | undefined;
      const right = def.right as ZodTypeAny | undefined;
      return {
        allOf: [left ? zodToJsonSchema(left) : {}, right ? zodToJsonSchema(right) : {}],
      };
    }

    case 'null':
      return { type: 'null' };

    case 'undefined':
    case 'void':
      return {};

    case 'any':
    case 'unknown':
      return {};

    case 'never':
      return { not: {} };

    default:
      // Unknown type — return empty schema
      return {};
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function convertString(def: Record<string, unknown>): JsonSchema {
  const result: JsonSchema = { type: 'string' };
  const checks = def.checks as Array<{ _zod?: { def?: Record<string, unknown> } }> | undefined;
  if (!checks) return result;

  for (const check of checks) {
    const checkDef = check._zod?.def;
    if (!checkDef) continue;
    const kind = checkDef.check as string;
    switch (kind) {
      case 'min_length':
        result.minLength = checkDef.minimum as number;
        break;
      case 'max_length':
        result.maxLength = checkDef.maximum as number;
        break;
      case 'regex':
        result.pattern = (checkDef.pattern as RegExp)?.source ?? String(checkDef.pattern);
        break;
      // Zod v4 string format checks (string_format with format field)
      case 'string_format': {
        const fmt = checkDef.format as string | undefined;
        const formatMap: Record<string, string> = {
          email: 'email',
          url: 'uri',
          uuid: 'uuid',
          datetime: 'date-time',
          date: 'date',
          time: 'time',
        };
        if (fmt && formatMap[fmt]) result.format = formatMap[fmt];
        break;
      }
      // Legacy Zod v3 individual format checks
      case 'email':
        result.format = 'email';
        break;
      case 'url':
        result.format = 'uri';
        break;
      case 'uuid':
        result.format = 'uuid';
        break;
      case 'datetime':
        result.format = 'date-time';
        break;
      case 'date':
        result.format = 'date';
        break;
      case 'time':
        result.format = 'time';
        break;
    }
  }
  return result;
}

function convertNumber(def: Record<string, unknown>, isInt: boolean): JsonSchema {
  const result: JsonSchema = { type: isInt ? 'integer' : 'number' };
  const checks = def.checks as Array<{ _zod?: { def?: Record<string, unknown> } }> | undefined;
  if (!checks) return result;

  for (const check of checks) {
    const checkDef = check._zod?.def;
    if (!checkDef) continue;
    const kind = checkDef.check as string;
    switch (kind) {
      case 'greater_than':
        if (checkDef.inclusive) {
          result.minimum = checkDef.value as number;
        } else {
          result.exclusiveMinimum = checkDef.value as number;
        }
        break;
      case 'less_than':
        if (checkDef.inclusive) {
          result.maximum = checkDef.value as number;
        } else {
          result.exclusiveMaximum = checkDef.value as number;
        }
        break;
      case 'multiple_of':
        result.multipleOf = checkDef.value as number;
        break;
      // Zod v4 number_format check — safeint / int means integer type
      case 'number_format': {
        const fmt = checkDef.format as string | undefined;
        if (fmt === 'safeint' || fmt === 'int') {
          result.type = 'integer';
        }
        break;
      }
    }
  }
  return result;
}
