/**
 * commands/projects — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: mixed (see errors.ts for per-verb details).
 * Error surface: ProjectPersistenceError (extends CommandError).
 */

export { createProject } from './createProject';
export { type DeleteProjectResponse, deleteProject } from './deleteProject';
export { ensureDemoProject } from './ensureDemoProject';
export { ProjectPersistenceError } from './errors';
export { type UpdateProjectPayload, updateProject } from './updateProject';
