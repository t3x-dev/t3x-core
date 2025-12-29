#!/usr/bin/env node
/**
 * T3X CLI
 *
 * Command-line interface for T3X semantic version control.
 */
import { Command } from 'commander';
import { registerBranchCommands } from './commands/branches.js';
import { registerCommitCommands } from './commands/commits.js';
import { registerProjectCommands } from './commands/projects.js';
import { registerStatusCommands } from './commands/status.js';

const program = new Command();

program
  .name('t3x')
  .description('T3X CLI - Semantic version control for AI conversations')
  .version('0.1.0')
  .option('--api-url <url>', 'API base URL (default: http://localhost:8000/api)');

// Register command groups
registerStatusCommands(program);
registerProjectCommands(program);
registerCommitCommands(program);
registerBranchCommands(program);

// Parse arguments
program.parse();
