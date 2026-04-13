/**
 * L3 — typed errors for the projects aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE. Project metadata writes (name / model selection /
 * description / autopilot) carry no LLMSource / HumanSource concept.
 *
 * Optimistic-update style: mixed.
 *   - createProject: all-or-nothing; the calling hook (useProjectCrud.add)
 *     detects network failures via `err.cause instanceof TypeError` and
 *     transparently falls back to a local-only project entry.
 *   - deleteProject: caller-rollback. The hook removes from local state
 *     first; on non-404 server failure it re-inserts the snapshot.
 *   - updateProject: all-or-nothing; failure rethrows.
 */

import { CommandError } from '../CommandError';

export class ProjectPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('project_persistence', message, cause);
    this.name = 'ProjectPersistenceError';
  }
}
