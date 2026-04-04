/**
 * Schema Command
 *
 * Print the T3X JSON Schema to stdout or write to a file.
 * Pure local — no API server needed.
 */

import * as fs from 'node:fs';
import { getSemanticContentJsonSchema, getTreeNodeJsonSchema } from '@t3x-dev/core';
import type { Command } from 'commander';
import { success } from '../utils.js';

export function registerSchemaCommands(program: Command): void {
  program
    .command('schema')
    .description('Print the T3X JSON Schema (local, no server needed)')
    .option('--type <type>', 'Schema type: content or tree', 'content')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action((options) => {
      let schema: unknown;
      switch (options.type) {
        case 'tree':
          schema = getTreeNodeJsonSchema();
          break;
        default:
          schema = getSemanticContentJsonSchema();
          break;
      }

      const json = JSON.stringify(schema, null, 2);

      if (options.output) {
        fs.writeFileSync(options.output, json, 'utf-8');
        success(`Schema written to ${options.output}`);
      } else {
        console.log(json);
      }
    });
}
