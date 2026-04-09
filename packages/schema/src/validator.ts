/**
 * @t3x-dev/schema — Validator
 *
 * Deterministic validation of a YValue document against a Schema.
 * Every check produces a Violation with an optional YOps fix.
 */

import type { YOp, YValue } from '@t3x-dev/yops';
import { resolvePath } from '@t3x-dev/yops';
import { normalizeSlot } from './parser';
import type {
  NodeDef,
  RuleDef,
  Schema,
  SchemaResult,
  SlotFull,
  Violation,
  ViolationCode,
} from './types';

// ── Helpers ──

function isMapping(v: YValue | undefined): v is Record<string, YValue> {
  return v !== undefined && v !== null && typeof v === 'object' && !Array.isArray(v);
}

function push(
  violations: Violation[],
  code: ViolationCode,
  path: string,
  severity: 'error' | 'warn' | 'info',
  message: string,
  fix?: YOp[]
) {
  violations.push({ code, path, severity, message, fix });
}

// ── Node Validation ──

function validateNode(doc: YValue, nodeDef: NodeDef, path: string, violations: Violation[]) {
  const nodeValue = resolvePath(doc, path);

  // Check required
  if (nodeDef.required && nodeValue === undefined) {
    push(violations, 'REQUIRED_NODE', path, 'error', `Required node "${path}" is missing`, [
      { define: { path } },
    ]);
    return; // can't validate further if missing
  }

  if (nodeValue === undefined) return;

  // Validate slots
  if (nodeDef.slots && isMapping(nodeValue)) {
    validateSlots(nodeValue, nodeDef.slots as Record<string, SlotFull>, path, violations);
  }

  // Validate declared children
  if (nodeDef.children && nodeDef.children !== 'any' && isMapping(nodeValue)) {
    for (const [childKey, childDef] of Object.entries(nodeDef.children)) {
      validateNode(doc, childDef, `${path}/${childKey}`, violations);
    }
  }

  // Validate each_child template
  if (nodeDef.each_child && isMapping(nodeValue)) {
    for (const childKey of Object.keys(nodeValue)) {
      // Skip keys that are declared slots
      if (nodeDef.slots && childKey in nodeDef.slots) continue;
      // Skip keys that are declared children
      if (nodeDef.children && nodeDef.children !== 'any' && childKey in nodeDef.children) continue;

      const childValue = nodeValue[childKey];
      if (isMapping(childValue) && nodeDef.each_child.slots) {
        validateSlots(
          childValue,
          nodeDef.each_child.slots as Record<string, SlotFull>,
          `${path}/${childKey}`,
          violations
        );
      }
    }
  }
}

function validateSlots(
  nodeValue: Record<string, YValue>,
  slotDefs: Record<string, SlotFull>,
  path: string,
  violations: Violation[]
) {
  for (const [slotKey, rawDef] of Object.entries(slotDefs)) {
    const slotDef = normalizeSlot(rawDef);
    const slotPath = `${path}/${slotKey}`;
    const value = nodeValue[slotKey];

    // Required check
    if (slotDef.required && value === undefined) {
      const fix: YOp[] | undefined =
        slotDef.default !== undefined
          ? [{ set: { path: slotPath, value: slotDef.default } }]
          : slotDef.enum?.length
            ? [{ set: { path: slotPath, value: slotDef.enum[0] } }]
            : undefined;

      push(
        violations,
        'REQUIRED_SLOT',
        slotPath,
        'error',
        `Required slot "${slotKey}" is missing at "${path}"`,
        fix
      );
      continue;
    }

    if (value === undefined) continue;

    // Type check
    if (slotDef.type === 'list' && !Array.isArray(value)) {
      push(
        violations,
        'INVALID_TYPE',
        slotPath,
        'error',
        `Slot "${slotKey}" at "${path}" should be a list but is ${typeof value}`
      );
      continue;
    }
    if (slotDef.type === 'scalar' && typeof value === 'object' && value !== null) {
      push(
        violations,
        'INVALID_TYPE',
        slotPath,
        'error',
        `Slot "${slotKey}" at "${path}" should be a scalar but is ${Array.isArray(value) ? 'list' : 'mapping'}`
      );
      continue;
    }

    // Enum check
    if (slotDef.enum && slotDef.type === 'scalar') {
      const matches = slotDef.enum.some((allowed) => allowed === value);
      if (!matches) {
        push(
          violations,
          'INVALID_ENUM',
          slotPath,
          'error',
          `Slot "${slotKey}" at "${path}" is "${value}", must be one of [${slotDef.enum.join(', ')}]`,
          [{ set: { path: slotPath, value: slotDef.enum[0] } }]
        );
      }
    }

    // Range check (numbers)
    if (typeof value === 'number') {
      if (slotDef.min !== undefined && value < slotDef.min) {
        push(
          violations,
          'INVALID_RANGE',
          slotPath,
          'warn',
          `Slot "${slotKey}" at "${path}" is ${value}, minimum is ${slotDef.min}`
        );
      }
      if (slotDef.max !== undefined && value > slotDef.max) {
        push(
          violations,
          'INVALID_RANGE',
          slotPath,
          'warn',
          `Slot "${slotKey}" at "${path}" is ${value}, maximum is ${slotDef.max}`
        );
      }
    }

    // Range check (list length)
    if (Array.isArray(value)) {
      if (slotDef.min !== undefined && value.length < slotDef.min) {
        push(
          violations,
          'INVALID_RANGE',
          slotPath,
          'warn',
          `List "${slotKey}" at "${path}" has ${value.length} items, minimum is ${slotDef.min}`
        );
      }
      if (slotDef.max !== undefined && value.length > slotDef.max) {
        push(
          violations,
          'INVALID_RANGE',
          slotPath,
          'warn',
          `List "${slotKey}" at "${path}" has ${value.length} items, maximum is ${slotDef.max}`
        );
      }
    }
  }
}

// ── Strict Mode: Unexpected Nodes ──

function checkStrict(doc: YValue, declaredNodes: Record<string, NodeDef>, violations: Violation[]) {
  if (!isMapping(doc)) return;
  for (const key of Object.keys(doc)) {
    if (!(key in declaredNodes)) {
      push(
        violations,
        'UNEXPECTED_NODE',
        key,
        'warn',
        `Node "${key}" is not declared in schema (strict mode)`,
        [{ drop: { path: key } }]
      );
    }
  }
}

// ── Rule Validation ──

function matchPaths(doc: YValue, pattern: string): string[] {
  if (!pattern.includes('*')) {
    return resolvePath(doc, pattern) !== undefined ? [pattern] : [];
  }

  // Handle wildcard: "decisions/*" matches all children of decisions
  const parts = pattern.split('/*');
  if (parts.length !== 2) return [];

  const parentPath = parts[0];
  const parent = resolvePath(doc, parentPath);
  if (!isMapping(parent)) return [];

  return Object.keys(parent).map((key) => `${parentPath}/${key}`);
}

function validateRules(doc: YValue, rules: RuleDef[], violations: Violation[]) {
  for (const rule of rules) {
    const paths = matchPaths(doc, rule.if);
    const severity = rule.severity ?? 'warn';

    for (const path of paths) {
      const value: YValue | undefined = resolvePath(doc, path);
      if (value === undefined) continue;

      // must_have: node must have these slots
      if (rule.must_have && isMapping(value)) {
        for (const slot of rule.must_have) {
          if (!(slot in (value as Record<string, YValue>))) {
            const msg =
              rule.message?.replace('{{path}}', path) ??
              `Rule "${rule.id}": slot "${slot}" missing at "${path}"`;
            push(violations, 'RULE_VIOLATION', path, severity, msg, rule.fix);
          }
        }
      }

      // must_not_have: node must NOT have these slots
      if (rule.must_not_have && isMapping(value)) {
        for (const slot of rule.must_not_have) {
          if (slot in (value as Record<string, YValue>)) {
            const msg =
              rule.message?.replace('{{path}}', path) ??
              `Rule "${rule.id}": slot "${slot}" should not exist at "${path}"`;
            push(violations, 'RULE_VIOLATION', path, severity, msg, rule.fix);
          }
        }
      }

      // one_of: value must be one of these
      if (rule.one_of) {
        if (!rule.one_of.some((allowed) => allowed === value)) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": value at "${path}" must be one of [${rule.one_of.join(', ')}]`;
          push(violations, 'RULE_VIOLATION', path, severity, msg, rule.fix);
        }
      }

      // not_empty: must have slots or children
      if (rule.not_empty && isMapping(value)) {
        if (Object.keys(value as Record<string, YValue>).length === 0) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": node at "${path}" is empty`;
          push(violations, 'RULE_VIOLATION', path, severity, msg, rule.fix);
        }
      }

      // max_children: limit child count
      if (rule.max_children !== undefined && isMapping(value)) {
        const childCount = Object.keys(value as Record<string, YValue>).length;
        if (childCount > rule.max_children) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": node at "${path}" has ${childCount} children, max is ${rule.max_children}`;
          push(violations, 'RULE_VIOLATION', path, severity, msg, rule.fix);
        }
      }

      // requires: other paths must exist if this one does
      if (rule.requires) {
        for (const reqPath of rule.requires) {
          if (resolvePath(doc, reqPath) === undefined) {
            const msg =
              rule.message?.replace('{{path}}', path) ??
              `Rule "${rule.id}": "${path}" requires "${reqPath}" to exist`;
            push(violations, 'RULE_VIOLATION', path, severity, msg, rule.fix);
          }
        }
      }
    }
  }
}

// ── Main Validator ──

export function validateSchema(doc: YValue, schema: Schema): SchemaResult {
  const violations: Violation[] = [];

  // Validate declared nodes
  for (const [nodeKey, nodeDef] of Object.entries(schema.nodes)) {
    validateNode(doc, nodeDef, nodeKey, violations);
  }

  // Strict mode: check for undeclared nodes
  if (schema.strict) {
    checkStrict(doc, schema.nodes, violations);
  }

  // Validate rules
  if (schema.rules) {
    validateRules(doc, schema.rules, violations);
  }

  const hasErrors = violations.some((v) => v.severity === 'error');

  return {
    valid: !hasErrors,
    violations,
  };
}
