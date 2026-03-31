#!/usr/bin/env node
/**
 * T3X CLI
 *
 * Command-line interface for T3X semantic version control.
 *
 * Action-first command style (kubectl-like):
 *   t3x list projects      t3x show commit <hash>
 *   t3x create project      t3x delete project <id>
 *   t3x commit <file>       t3x generate leaf <id>
 */
import { Command } from 'commander';

// Action-group handlers (refactored from resource-first)
import { registerListBranches, registerCreateBranch, registerSwitchBranch, registerCurrentBranch } from './commands/branches.js';
import { registerListCommits, registerShowCommit } from './commands/commits.js';
import { registerListLeaves, registerShowLeaf, registerCreateLeaf, registerGenerateLeaf, registerDeleteLeaf } from './commands/leaves.js';
import { registerListProjects, registerShowProject, registerCreateProject, registerDeleteProject } from './commands/projects.js';
import { registerShowContent } from './commands/show.js';

// New commit command
import { registerCommitCommand } from './commands/commit.js';

// Independent commands (unchanged)
import { registerExportCommands } from './commands/export.js';
import { registerExtractCommands } from './commands/extract.js';
import { registerGateCommands } from './commands/gate.js';
import { registerImportCommands } from './commands/import.js';
import { registerShareCommands } from './commands/share.js';
import { registerSchemaCommands } from './commands/schema.js';
import { registerStatusCommands } from './commands/status.js';
import { registerValidateCommands } from './commands/validate.js';

const program = new Command();

program
  .name('t3x')
  .description('T3X CLI - Semantic version control for AI conversations')
  .version('0.1.0')
  .option('--api-url <url>', 'API base URL (default: http://localhost:8000/api)')
  .option('--api-key <key>', 'API key for authentication (or set T3X_API_KEY env var)');

// ── Action-group commands (kubectl-style) ──────────────────────────

// t3x list <resource>
const listCmd = program.command('list').description('List resources');
registerListProjects(listCmd);
registerListCommits(listCmd);
registerListBranches(listCmd);
registerListLeaves(listCmd);

// t3x show <resource>
const showCmd = program.command('show').description('Show resource details');
registerShowProject(showCmd);
registerShowCommit(showCmd);
registerShowLeaf(showCmd);
registerShowContent(showCmd);

// t3x create <resource>
const createCmd = program.command('create').description('Create a resource');
registerCreateProject(createCmd);
registerCreateBranch(createCmd);
registerCreateLeaf(createCmd);

// t3x delete <resource>
const deleteCmd = program.command('delete').description('Delete a resource');
registerDeleteProject(deleteCmd);
registerDeleteLeaf(deleteCmd);

// t3x generate <resource>
const generateCmd = program.command('generate').description('Generate output');
registerGenerateLeaf(generateCmd);

// ── Top-level commands ─────────────────────────────────────────────

// t3x commit [file]
registerCommitCommand(program);

// t3x switch-branch / current-branch
registerSwitchBranch(program);
registerCurrentBranch(program);

// Independent commands (no rename needed)
registerStatusCommands(program);
registerExtractCommands(program);
registerShareCommands(program);
registerGateCommands(program);
registerExportCommands(program);
registerImportCommands(program);
registerSchemaCommands(program);
registerValidateCommands(program);

// Parse arguments
program.parse();
