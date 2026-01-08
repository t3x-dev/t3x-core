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

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import yaml from 'js-yaml';
import { EvalRulesSchema, type EvalRules } from '../schemas/eval-rules.js';

/**
 * Leaf 对象类型（用于规则解析）
 *
 * content: prompt 内容，给 n8n AI Agent 使用，不参与规则解析
 * rules_ref: 规则文件引用名，指向 resources/rules/ 目录下的文件
 */
export interface LeafForRules {
  content?: string;
  rules_ref?: string;
}

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

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
 * 优先级:
 * 1. leaf.rules_ref → 从 resources/rules/ 目录加载对应文件
 * 2. 默认规则 (default.yml 或内置 DEFAULT_RULES)
 *
 * 注意: leaf.content 是给 n8n AI Agent 的 prompt，不参与规则解析
 *
 * @param leaf - Leaf 对象，包含 rules_ref 字段
 * @returns EvalRules
 */
export function parseRulesFromLeaf(leaf?: LeafForRules): EvalRules {
  // 1. 如果有 rules_ref，从文件加载
  if (leaf?.rules_ref) {
    const rulesDir = join(process.cwd(), 'resources', 'rules');

    // 尝试多种扩展名
    const candidates = [
      join(rulesDir, `${leaf.rules_ref}.yaml`),
      join(rulesDir, `${leaf.rules_ref}.yml`),
      join(rulesDir, `${leaf.rules_ref}.json`),
      join(rulesDir, leaf.rules_ref), // 完整文件名（如 "custom.yaml"）
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

  // 2. 没有 rules_ref，用默认规则
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
