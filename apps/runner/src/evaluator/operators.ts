/**
 * Evaluation Operators
 *
 * Implements all rule operators for deterministic evaluation.
 * Each operator returns true if the check passes, false otherwise.
 */

import type { RuleOperator } from '../schemas/eval-rules.js';

/**
 * Operator function signature
 */
export type OperatorFn = (
  actual: unknown,
  expected: unknown,
  options?: OperatorOptions
) => boolean;

/**
 * Options for operators
 */
export interface OperatorOptions {
  pattern?: string; // for regex
  min?: number; // for range
  max?: number; // for range
  condition?: Record<string, unknown>; // for some/all/none
}

/**
 * Check if a value matches a condition object
 * Used for some/all/none operators on arrays
 */
function matchCondition(item: unknown, condition?: Record<string, unknown>): boolean {
  if (!condition || typeof item !== 'object' || item === null) {
    return false;
  }

  const obj = item as Record<string, unknown>;

  for (const [key, expectedValue] of Object.entries(condition)) {
    const actualValue = obj[key];

    // Handle nested conditions
    if (
      typeof expectedValue === 'object' &&
      expectedValue !== null &&
      !Array.isArray(expectedValue)
    ) {
      if (!matchCondition(actualValue, expectedValue as Record<string, unknown>)) {
        return false;
      }
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Check if value exists (not undefined or null)
 */
function exists(actual: unknown): boolean {
  return actual !== undefined && actual !== null;
}

/**
 * Check if value is not empty
 * - null/undefined: false
 * - '': false
 * - []: false
 * - {}: true (objects are considered non-empty)
 */
function notEmpty(actual: unknown): boolean {
  if (actual === undefined || actual === null) {
    return false;
  }

  if (typeof actual === 'string') {
    return actual.length > 0;
  }

  if (Array.isArray(actual)) {
    return actual.length > 0;
  }

  return true;
}

/**
 * Check if value equals expected (deep equality via JSON serialization)
 */
function equals(actual: unknown, expected: unknown): boolean {
  // Handle simple types
  if (actual === expected) {
    return true;
  }

  // Handle objects via JSON comparison
  try {
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/**
 * Check if value does not equal expected
 */
function notEquals(actual: unknown, expected: unknown): boolean {
  return !equals(actual, expected);
}

/**
 * Check if value contains expected substring (for strings)
 * or if array includes expected value
 */
function contains(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.includes(expected);
  }

  if (Array.isArray(actual)) {
    return actual.some((item) => equals(item, expected));
  }

  // Try to convert to string
  return String(actual).includes(String(expected));
}

/**
 * Check if value does not contain expected
 */
function notContains(actual: unknown, expected: unknown): boolean {
  return !contains(actual, expected);
}

/**
 * Check if value matches regex pattern
 */
function regex(actual: unknown, _expected: unknown, options?: OperatorOptions): boolean {
  const pattern = options?.pattern;
  if (!pattern) {
    return false;
  }

  try {
    const re = new RegExp(pattern);
    return re.test(String(actual));
  } catch {
    return false;
  }
}

/**
 * Check if number is within range [min, max]
 */
function range(actual: unknown, _expected: unknown, options?: OperatorOptions): boolean {
  const num = Number(actual);
  if (isNaN(num)) {
    return false;
  }

  const min = options?.min ?? -Infinity;
  const max = options?.max ?? Infinity;

  return num >= min && num <= max;
}

/**
 * Check if at least one array item matches condition
 */
function some(actual: unknown, _expected: unknown, options?: OperatorOptions): boolean {
  if (!Array.isArray(actual)) {
    return false;
  }

  const condition = options?.condition;
  return actual.some((item) => matchCondition(item, condition));
}

/**
 * Check if all array items match condition
 */
function all(actual: unknown, _expected: unknown, options?: OperatorOptions): boolean {
  if (!Array.isArray(actual)) {
    return false;
  }

  if (actual.length === 0) {
    return true; // Empty array satisfies "all" vacuously
  }

  const condition = options?.condition;
  return actual.every((item) => matchCondition(item, condition));
}

/**
 * Check if no array items match condition
 */
function none(actual: unknown, _expected: unknown, options?: OperatorOptions): boolean {
  if (!Array.isArray(actual)) {
    return true; // Non-array has no items to match
  }

  const condition = options?.condition;
  return !actual.some((item) => matchCondition(item, condition));
}

/**
 * Map of all operators
 */
export const operators: Record<RuleOperator, OperatorFn> = {
  exists: (actual) => exists(actual),
  not_empty: (actual) => notEmpty(actual),
  equals: (actual, expected) => equals(actual, expected),
  not_equals: (actual, expected) => notEquals(actual, expected),
  contains: (actual, expected) => contains(actual, expected),
  not_contains: (actual, expected) => notContains(actual, expected),
  regex: (actual, expected, options) => regex(actual, expected, options),
  range: (actual, expected, options) => range(actual, expected, options),
  some: (actual, expected, options) => some(actual, expected, options),
  all: (actual, expected, options) => all(actual, expected, options),
  none: (actual, expected, options) => none(actual, expected, options),
};

/**
 * Run an operator check
 */
export function runOperator(
  operator: RuleOperator,
  actual: unknown,
  expected: unknown,
  options?: OperatorOptions
): boolean {
  const fn = operators[operator];
  if (!fn) {
    throw new Error(`Unknown operator: ${operator}`);
  }
  return fn(actual, expected, options);
}
