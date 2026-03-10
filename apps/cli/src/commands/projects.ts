/**
 * Project Commands
 */

import { createClient } from '@t3x-dev/api-client';
import type { Command } from 'commander';
import { createSpinner, error, formatDate, getApiUrl, printTable, success } from '../utils.js';

export function registerProjectCommands(program: Command): void {
  const projects = program.command('projects').alias('p').description('Manage projects');

  // List projects
  projects
    .command('list')
    .alias('ls')
    .description('List all projects')
    .option('-l, --limit <number>', 'Maximum number of projects', '100')
    .option('-o, --offset <number>', 'Offset for pagination', '0')
    .action(async (options) => {
      const spinner = createSpinner('Fetching projects...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const result = await client.listProjects({
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
        });

        spinner.stop();

        if (result.projects.length === 0) {
          console.log('No projects found.');
          return;
        }

        printTable({
          columns: ['ID', 'Name', 'Created'],
          rows: result.projects.map((p) => [p.project_id, p.name, formatDate(p.created_at)]),
        });
      } catch (err) {
        spinner.stop();
        error(`Failed to list projects: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Get project
  projects
    .command('get <id>')
    .description('Get project details')
    .action(async (id: string) => {
      const spinner = createSpinner('Fetching project...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const project = await client.getProject(id);

        spinner.stop();

        console.log();
        console.log(`Project: ${project.name}`);
        console.log(`ID: ${project.project_id}`);
        console.log(`Created: ${formatDate(project.created_at)}`);
        console.log();
        console.log('Stats:');
        console.log(`  Conversations: ${project.conversations_count}`);
        console.log(`  Turns: ${project.turns_count}`);
        console.log(`  Commits: ${project.commits_count}`);
        console.log(`  Branches: ${project.branches_count}`);
        console.log(`  Drafts: ${project.drafts_count}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to get project: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Create project
  projects
    .command('create <name>')
    .description('Create a new project')
    .action(async (name: string) => {
      const spinner = createSpinner('Creating project...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        const project = await client.createProject({ name });

        spinner.stop();
        success(`Project created: ${project.project_id}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Delete project
  projects
    .command('delete <id>')
    .description('Delete a project')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (id: string, options) => {
      if (!options.force) {
        console.log('Use --force to confirm deletion');
        process.exit(1);
      }

      const spinner = createSpinner('Deleting project...');
      spinner.start();

      try {
        const client = createClient({ baseUrl: getApiUrl() });
        await client.deleteProject(id);

        spinner.stop();
        success(`Project deleted: ${id}`);
      } catch (err) {
        spinner.stop();
        error(`Failed to delete project: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
