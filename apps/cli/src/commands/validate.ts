/**
 * Validate Command
 *
 * Validate a YAML/JSON file against the T3X SemanticContent schema.
 * Pure local — no API server needed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SemanticContentSchema,
  validateIntegrity,
  checkRelationSanity,
  type SemanticContent,
} from '@t3x-dev/core';
import type { Command } from 'commander';
import YAML from 'yaml';
import { error, info, readStdin, success, warn } from '../utils.js';

export interface ValidateResult {
  valid: boolean;
  tree_count: number;
  node_count: number;
  relation_count: number;
  errors: string[];
  warnings: string[];
}

/** Recursively count all nodes in a tree */
function countNodes(tree: { children: { children: unknown[] }[] }): number {
  let count = 1;
  for (const child of tree.children) {
    count += countNodes(child as { children: { children: unknown[] }[] });
  }
  return count;
}

export function parseAndValidate(
  content: string,
  format: 'json' | 'yaml',
  schemaOnly: boolean,
): ValidateResult {
  // 1. Parse
  let parsed: unknown;
  try {
    parsed = format === 'yaml' ? YAML.parse(content) : JSON.parse(content);
  } catch (e) {
    return {
      valid: false,
      tree_count: 0,
      node_count: 0,
      relation_count: 0,
      errors: [`Parse error: ${e instanceof Error ? e.message : String(e)}`],
      warnings: [],
    };
  }

  // 2. Zod structural validation
  const result = SemanticContentSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    return { valid: false, tree_count: 0, node_count: 0, relation_count: 0, errors, warnings: [] };
  }

  const data = result.data;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // 3. Semantic validation (unless schema-only)
  if (!schemaOnly) {
    const integrity = validateIntegrity(data as SemanticContent);
    for (const err of integrity.errors) {
      allErrors.push(`[${err.type}] ${err.message} (${err.location})`);
    }
    for (const w of integrity.warnings) {
      allWarnings.push(`[${w.type}] ${w.message} (${w.location})`);
    }

    const sanity = checkRelationSanity(data as SemanticContent);
    for (const w of sanity) {
      allWarnings.push(`[${w.type}] ${w.message} (${w.location})`);
    }
  }

  // 4. Count stats
  let nodeCount = 0;
  for (const tree of data.trees) {
    nodeCount += countNodes(tree as unknown as { children: { children: unknown[] }[] });
  }

  return {
    valid: allErrors.length === 0,
    tree_count: data.trees.length,
    node_count: nodeCount,
    relation_count: data.relations.length,
    errors: allErrors,
    warnings: allWarnings,
  };
}

function detectFormat(filePath: string): 'json' | 'yaml' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  return 'yaml';
}

export function registerValidateCommands(program: Command): void {
  program
    .command('validate [file]')
    .description('Validate a YAML/JSON file against the T3X schema (local, no server needed)')
    .option('--schema-only', 'Only check Zod structural validation, skip semantic checks', false)
    .option('--stdin', 'Read from stdin')
    .option('--json', 'Output as JSON')
    .action(async (file: string | undefined, options) => {
      let content: string;
      let format: 'json' | 'yaml';

      if (options.stdin) {
        content = await readStdin();
        format = content.trimStart().startsWith('{') ? 'json' : 'yaml';
      } else if (file) {
        const resolvedPath = path.resolve(file);
        if (!fs.existsSync(resolvedPath)) {
          error(`File not found: ${resolvedPath}`);
          process.exit(1);
        }
        content = fs.readFileSync(resolvedPath, 'utf-8');
        format = detectFormat(resolvedPath);
      } else {
        error('Provide a file path or use --stdin');
        process.exit(1);
        return;
      }

      const result = parseAndValidate(content, format, options.schemaOnly);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
        return;
      }

      if (result.valid) {
        success(`Valid: ${result.tree_count} trees, ${result.node_count} nodes, ${result.relation_count} relations`);
        if (result.warnings.length > 0) {
          warn('Warnings:');
          for (const w of result.warnings) {
            info(`  - ${w}`);
          }
        }
      } else {
        error('Validation failed:');
        for (const e of result.errors) {
          info(`  - ${e}`);
        }
        if (result.warnings.length > 0) {
          warn('Warnings:');
          for (const w of result.warnings) {
            info(`  - ${w}`);
          }
        }
        process.exit(1);
      }
    });
}
