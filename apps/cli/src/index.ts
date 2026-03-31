#!/usr/bin/env node
/**
 * T3X CLI
 *
 * Command-line interface for T3X semantic version control.
 */
import { Command } from 'commander';
import { registerBranchCommands } from './commands/branches.js';
import { registerCommitCommands } from './commands/commits.js';
import { registerExportCommands } from './commands/export.js';
import { registerExtractCommands } from './commands/extract.js';
import { registerGateCommands } from './commands/gate.js';
import { registerImportCommands } from './commands/import.js';
import { registerLeafCommands } from './commands/leaves.js';
import { registerProjectCommands } from './commands/projects.js';
import { registerShareCommands } from './commands/share.js';
import { registerSchemaCommands } from './commands/schema.js';
import { registerShowCommands } from './commands/show.js';
import { registerStatusCommands } from './commands/status.js';
import { registerValidateCommands } from './commands/validate.js';

const program = new Command();

program
  .name('t3x')
  .description('T3X CLI - Semantic version control for AI conversations')
  .version('0.1.0')
  .option('--api-url <url>', 'API base URL (default: http://localhost:8000/api)')
  .option('--api-key <key>', 'API key for authentication (or set T3X_API_KEY env var)');

// Register command groups
registerStatusCommands(program);
registerProjectCommands(program);
registerCommitCommands(program);
registerBranchCommands(program);
registerLeafCommands(program);
registerExtractCommands(program);
registerShareCommands(program);
registerGateCommands(program);
registerExportCommands(program);
registerImportCommands(program);
registerSchemaCommands(program);
registerValidateCommands(program);
registerShowCommands(program);

// Parse arguments
program.parse();
