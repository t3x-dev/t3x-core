/**
 * @t3x-dev/schema — Validator
 *
 * Deterministic validation of a YValue document against a Schema.
 * Every check produces a Violation with an optional YOps fix.
 */

import type { YOp, YValue } from '@t3x-dev/yops';
import { resolvePath } from '@t3x-dev/yops';
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

function validateNode(
  doc: YValue,
  nodeDef: NodeDef,
  path: string,
  violations: Violation[],
  strict = false
) {
  const nodeValue = resolvePath(doc, path);

  // Check required
  if (nodeDef.required && nodeValue === undefined) {
    push(violations, 'REQUIRED_NODE', path, 'error', `Required node "${path}" is missing`, [
      { define: { path } },
    ]);
    return; // can't validate further if missing
  }

  if (nodeValue === undefined) return;

  // Check: if node has slots or children declared, value must be a mapping
  const expectsMapping = nodeDef.slots || nodeDef.children || nodeDef.each_child;
  if (expectsMapping && !isMapping(nodeValue)) {
    push(
      violations,
      'INVALID_TYPE',
      path,
      'error',
      `Node "${path}" should be a mapping but is ${nodeValue === null ? 'null' : Array.isArray(nodeValue) ? 'list' : typeof nodeValue}`
    );
    return; // can't validate slots/children on a non-mapping
  }

  // Validate slots
  if (nodeDef.slots && isMapping(nodeValue)) {
    validateSlots(nodeValue, nodeDef.slots as Record<string, SlotFull>, path, violations);
  }

  // Validate declared children
  if (nodeDef.children && nodeDef.children !== 'any' && isMapping(nodeValue)) {
    for (const [childKey, childDef] of Object.entries(nodeDef.children)) {
      validateNode(doc, childDef, `${path}/${childKey}`, violations, strict);
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
      if (nodeDef.each_child.slots) {
        if (isMapping(childValue)) {
          validateSlots(
            childValue,
            nodeDef.each_child.slots as Record<string, SlotFull>,
            `${path}/${childKey}`,
            violations
          );
          // Strict mode: reject slots not declared in each_child.slots
          if (strict) {
            const declaredSlots = nodeDef.each_child.slots as Record<string, SlotFull>;
            for (const slotKey of Object.keys(childValue as Record<string, YValue>)) {
              if (!(slotKey in declaredSlots)) {
                push(
                  violations,
                  'UNEXPECTED_SLOT',
                  `${path}/${childKey}/${slotKey}`,
                  'error',
                  `Slot "${slotKey}" at "${path}/${childKey}" is not declared in schema (strict mode)`
                );
              }
            }
          }
        } else {
          push(
            violations,
            'CHILD_MISMATCH',
            `${path}/${childKey}`,
            'error',
            `Child "${childKey}" at "${path}" should be a mapping but is ${childValue === null ? 'null' : Array.isArray(childValue) ? 'list' : typeof childValue}`
          );
        }
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
  for (const [slotKey, slotDef] of Object.entries(slotDefs)) {
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

    // Pattern check (scalar slots only)
    if (slotDef.pattern && slotDef.type !== 'list' && typeof value === 'string') {
      if (!new RegExp(slotDef.pattern).test(value)) {
        push(
          violations,
          'INVALID_PATTERN',
          slotPath,
          'error',
          slotDef.pattern_message ?? `value '${value}' does not match pattern ${slotDef.pattern}`
        );
      }
    }

    // Item pattern check (list slots only)
    if (slotDef.item_pattern && Array.isArray(value)) {
      const re = new RegExp(slotDef.item_pattern);
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string' && !re.test(item)) {
          push(
            violations,
            'INVALID_ITEM_PATTERN',
            `${slotPath}/[${i}]`,
            'error',
            `item '${item}' at index ${i} does not match pattern ${slotDef.item_pattern}`
          );
        }
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

  // Only trailing /* is supported (e.g., "decisions/*")
  if (!pattern.endsWith('/*')) return [];

  const parentPath = pattern.slice(0, -2);
  if (parentPath.includes('*')) return []; // reject nested wildcards like "a/*/b/*"

  const parent = resolvePath(doc, parentPath);
  if (!isMapping(parent)) return [];

  return Object.keys(parent).map((key) => `${parentPath}/${key}`);
}

/** Replace {{path}} placeholders in fix ops with the actual matched path. */
function interpolateFixOps(ops: YOp[] | undefined, path: string): YOp[] | undefined {
  if (!ops) return undefined;
  const json = JSON.stringify(ops);
  if (!json.includes('{{path}}')) return ops;
  return JSON.parse(json.replace(/\{\{path\}\}/g, path)) as YOp[];
}

function validateRules(doc: YValue, rules: RuleDef[], violations: Violation[]) {
  for (const rule of rules) {
    const paths = matchPaths(doc, rule.if);
    const severity = rule.severity ?? 'warn';

    for (const path of paths) {
      const value: YValue | undefined = resolvePath(doc, path);
      if (value === undefined) continue;

      // must_have: node must have these slots
      if (rule.must_have) {
        if (!isMapping(value)) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": "${path}" is not a mapping, cannot check slots`;
          push(
            violations,
            'RULE_VIOLATION',
            path,
            severity,
            msg,
            interpolateFixOps(rule.fix, path)
          );
        } else {
          for (const slot of rule.must_have) {
            if (!(slot in (value as Record<string, YValue>))) {
              const msg =
                rule.message?.replace('{{path}}', path) ??
                `Rule "${rule.id}": slot "${slot}" missing at "${path}"`;
              push(
                violations,
                'RULE_VIOLATION',
                path,
                severity,
                msg,
                interpolateFixOps(rule.fix, path)
              );
            }
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
            push(
              violations,
              'RULE_VIOLATION',
              path,
              severity,
              msg,
              interpolateFixOps(rule.fix, path)
            );
          }
        }
      }

      // one_of: value must be one of these (scalars only)
      if (rule.one_of) {
        if (typeof value === 'object' && value !== null) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": value at "${path}" is a ${Array.isArray(value) ? 'list' : 'mapping'}, expected a scalar`;
          push(
            violations,
            'RULE_VIOLATION',
            path,
            severity,
            msg,
            interpolateFixOps(rule.fix, path)
          );
        } else if (!rule.one_of.some((allowed) => allowed === value)) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": value at "${path}" must be one of [${rule.one_of.join(', ')}]`;
          push(
            violations,
            'RULE_VIOLATION',
            path,
            severity,
            msg,
            interpolateFixOps(rule.fix, path)
          );
        }
      }

      // not_empty: must have slots or children
      if (rule.not_empty && isMapping(value)) {
        if (Object.keys(value as Record<string, YValue>).length === 0) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": node at "${path}" is empty`;
          push(
            violations,
            'RULE_VIOLATION',
            path,
            severity,
            msg,
            interpolateFixOps(rule.fix, path)
          );
        }
      }

      // max_children: limit child count
      if (rule.max_children !== undefined && isMapping(value)) {
        const childCount = Object.keys(value as Record<string, YValue>).length;
        if (childCount > rule.max_children) {
          const msg =
            rule.message?.replace('{{path}}', path) ??
            `Rule "${rule.id}": node at "${path}" has ${childCount} children, max is ${rule.max_children}`;
          push(
            violations,
            'RULE_VIOLATION',
            path,
            severity,
            msg,
            interpolateFixOps(rule.fix, path)
          );
        }
      }

      // requires: other paths must exist if this one does
      if (rule.requires) {
        for (const reqPath of rule.requires) {
          if (resolvePath(doc, reqPath) === undefined) {
            const msg =
              rule.message?.replace('{{path}}', path) ??
              `Rule "${rule.id}": "${path}" requires "${reqPath}" to exist`;
            push(
              violations,
              'RULE_VIOLATION',
              path,
              severity,
              msg,
              interpolateFixOps(rule.fix, path)
            );
          }
        }
      }

      // ref_must_exist: each value in a slot must be a key under in_path
      if (rule.ref_must_exist) {
        const { slot, in_path } = rule.ref_must_exist;
        const nodeValue = resolvePath(doc, path);
        if (isMapping(nodeValue)) {
          const slotValue = (nodeValue as Record<string, YValue>)[slot];
          if (slotValue !== undefined) {
            // Resolve the set of valid keys from in_path (top-level)
            const target = resolvePath(doc, in_path);
            const validKeys: Set<string> = isMapping(target)
              ? new Set(Object.keys(target as Record<string, YValue>))
              : new Set();

            // Accept scalar or list
            const refs: YValue[] = Array.isArray(slotValue) ? (slotValue as YValue[]) : [slotValue];

            for (const ref of refs) {
              if (typeof ref === 'string' && !validKeys.has(ref)) {
                push(
                  violations,
                  'REF_NOT_FOUND',
                  path,
                  severity,
                  `'${ref}' (referenced from ${path}/${slot}) is not a key under ${in_path}`
                );
              }
            }
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
  const strict = schema.strict ?? false;
  for (const [nodeKey, nodeDef] of Object.entries(schema.nodes)) {
    validateNode(doc, nodeDef, nodeKey, violations, strict);
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
