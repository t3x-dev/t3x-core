/**
 * Rule Parser
 *
 * Parses evaluation rules from various sources:
 * - JSON string (from leaf.content)
 * - YAML string
 * - JSON file
 * - YAML file (.yml, .yaml)
 * - Default rules
 */

import { existsSync, readFileSync } from 'fs';
import yaml from 'js-yaml';
import { join } from 'path';
import { logger } from '../lib/logger.js';
import { type EvalRules, EvalRulesSchema } from '../schemas/eval-rules.js';

/**
 * Leaf object type (for rule parsing)
 *
 * content: prompt content for n8n AI Agent, not used for rule parsing
 * rules_ref: rules file reference name, points to files in resources/rules/
 */
export interface LeafForRules {
  content?: string;
  rules_ref?: string;
}

/**
 * Default evaluation rules
 *
 * Used when no custom rules are provided.
 */
export const DEFAULT_RULES: EvalRules = {
  version: '1.0',
  name: 'default-eval',
  description: 'Default evaluation rules for agent runs',
  rules: [
    {
      id: 'output_exists',
      name: 'Output exists',
      type: 'basic',
      target: 'output',
      check: 'exists',
      weight: 0.2,
      severity: 'error',
    },
    {
      id: 'output_not_empty',
      name: 'Output is not empty',
      type: 'basic',
      target: 'output',
      check: 'not_empty',
      weight: 0.2,
      severity: 'error',
    },
    {
      id: 'no_errors',
      name: 'All steps completed without errors',
      type: 'basic',
      target: 'steps',
      check: 'all',
      condition: { status: 'ok' },
      weight: 0.4,
      severity: 'error',
    },
    {
      id: 'has_steps',
      name: 'At least one step executed',
      type: 'basic',
      target: 'steps',
      check: 'not_empty',
      weight: 0.2,
      severity: 'warning',
    },
  ],
  pass_threshold: 0.8,
};

/**
 * Parse rules from JSON string
 *
 * @param jsonContent - JSON string containing eval rules
 * @returns Parsed and validated EvalRules
 */
export function parseRulesFromJson(jsonContent: string): EvalRules {
  try {
    const parsed = JSON.parse(jsonContent);
    const validated = EvalRulesSchema.parse(parsed);
    logger.debug({ rules_count: validated.rules.length }, 'Parsed rules from JSON');
    return validated;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Failed to parse rules from JSON');
    throw new Error(`Failed to parse rules from JSON: ${msg}`);
  }
}

/**
 * Parse rules from YAML string
 *
 * @param yamlContent - YAML string containing eval rules
 * @returns Parsed and validated EvalRules
 */
export function parseRulesFromYaml(yamlContent: string): EvalRules {
  try {
    const parsed = yaml.load(yamlContent);
    const validated = EvalRulesSchema.parse(parsed);
    logger.debug({ rules_count: validated.rules.length }, 'Parsed rules from YAML');
    return validated;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Failed to parse rules from YAML');
    throw new Error(`Failed to parse rules from YAML: ${msg}`);
  }
}

/**
 * Load rules from file (JSON or YAML)
 *
 * @param filePath - Path to JSON or YAML file
 * @returns Parsed and validated EvalRules
 */
export function loadRulesFromFile(filePath: string): EvalRules {
  try {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');

    // Support both .json and .yml/.yaml files
    if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
      return parseRulesFromYaml(content);
    } else if (filePath.endsWith('.json')) {
      return parseRulesFromJson(content);
    } else {
      // Try JSON by default
      return parseRulesFromJson(content);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ file: filePath, error: msg }, 'Failed to load rules from file');
    throw error;
  }
}

/**
 * Parse rules from leaf object
 *
 * Priority:
 * 1. leaf.rules_ref -> load from resources/rules/ directory
 * 2. Default rules (default.yml or built-in DEFAULT_RULES)
 *
 * Note: leaf.content is the prompt for n8n AI Agent, not used for rule parsing
 *
 * @param leaf - Leaf object containing rules_ref field
 * @returns EvalRules
 */
export function parseRulesFromLeaf(leaf?: LeafForRules): EvalRules {
  // 1. If rules_ref is provided, load from file
  if (leaf?.rules_ref) {
    // Sanitize rules_ref to prevent path traversal (e.g., "../../etc/passwd")
    const safeRef = leaf.rules_ref.replace(/[^a-zA-Z0-9_\-.]/g, '');
    if (safeRef !== leaf.rules_ref) {
      logger.warn({ rules_ref: leaf.rules_ref, sanitized: safeRef }, 'Sanitized unsafe rules_ref');
    }
    const rulesDir = join(process.cwd(), 'resources', 'rules');

    // Try multiple extensions
    const candidates = [
      join(rulesDir, `${safeRef}.yaml`),
      join(rulesDir, `${safeRef}.yml`),
      join(rulesDir, `${safeRef}.json`),
      join(rulesDir, safeRef), // Full filename (e.g. "custom.yaml")
    ];

    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        try {
          logger.info({ rules_ref: leaf.rules_ref, file: filePath }, 'Loading rules from file');
          return loadRulesFromFile(filePath);
        } catch (error) {
          logger.warn({ file: filePath, error: String(error) }, 'Failed to load rules file');
        }
      }
    }

    logger.warn({ rules_ref: leaf.rules_ref }, 'Rules file not found, falling back to defaults');
  }

  // 2. No rules_ref, use default rules
  logger.debug('No rules_ref provided, using default rules');
  return loadDefaultRules();
}

/**
 * Load default rules from resources/rules/default.yml or use built-in defaults
 */
export function loadDefaultRules(): EvalRules {
  // Try to load from default.yml first
  const defaultYmlPath = join(process.cwd(), 'resources', 'rules', 'default.yml');
  const defaultYamlPath = join(process.cwd(), 'resources', 'rules', 'default.yaml');
  const defaultJsonPath = join(process.cwd(), 'resources', 'rules', 'default.json');

  // Try YAML first (preferred format)
  if (existsSync(defaultYmlPath)) {
    try {
      return loadRulesFromFile(defaultYmlPath);
    } catch {
      logger.warn('Failed to load default.yml, trying other formats');
    }
  }

  if (existsSync(defaultYamlPath)) {
    try {
      return loadRulesFromFile(defaultYamlPath);
    } catch {
      logger.warn('Failed to load default.yaml, trying other formats');
    }
  }

  // Try JSON as fallback
  if (existsSync(defaultJsonPath)) {
    try {
      return loadRulesFromFile(defaultJsonPath);
    } catch {
      logger.warn('Failed to load default.json, using built-in defaults');
    }
  }

  return DEFAULT_RULES;
}

/**
 * Validate rules object
 *
 * @param rules - Rules object to validate
 * @returns true if valid, throws if invalid
 */
export function validateRules(rules: unknown): rules is EvalRules {
  EvalRulesSchema.parse(rules);
  return true;
}
