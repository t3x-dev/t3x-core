import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type Project,
  type ProjectVisibilityEvent,
  projects,
  projectVisibilityEvents,
} from '../schema';

export type ProjectVisibility = 'private' | 'unlisted' | 'public';
export type ProjectVisibilityActorKind = 'human' | 'agent' | 'service' | 'local';

export interface ChangeProjectVisibilityInput {
  projectId: string;
  namespaceId: string;
  visibility: ProjectVisibility;
  actor: { kind: ProjectVisibilityActorKind; id: string };
  publicationConfirmed: boolean;
}

export interface ChangeProjectVisibilityResult {
  project: Project;
  event: ProjectVisibilityEvent | null;
}

/**
 * Change one canonical project's visibility and append its evidence atomically.
 * Authorization and deployment capacity are application concerns and must run
 * before this storage command. The exact namespace predicate prevents a caller
 * from mutating a project through stale cross-tenant facts.
 */
export async function changeProjectVisibility(
  db: AnyDB,
  input: ChangeProjectVisibilityInput
): Promise<ChangeProjectVisibilityResult | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.projectId, input.projectId),
          eq(projects.namespaceId, input.namespaceId),
          isNull(projects.deletedAt)
        )
      )
      .for('update')
      .limit(1);
    if (!current) return null;
    if (current.visibility === input.visibility) return { project: current, event: null };

    if (input.visibility === 'public' && !input.publicationConfirmed) {
      throw new Error('Public visibility requires explicit publication confirmation');
    }

    const [project] = await tx
      .update(projects)
      .set({ visibility: input.visibility })
      .where(
        and(
          eq(projects.projectId, current.projectId),
          eq(projects.namespaceId, input.namespaceId),
          eq(projects.visibility, current.visibility)
        )
      )
      .returning();
    if (!project) throw new Error('Project visibility changed concurrently');

    const [event] = await tx
      .insert(projectVisibilityEvents)
      .values({
        eventId: `pve_${randomUUID().replaceAll('-', '')}`,
        projectId: project.projectId,
        namespaceId: input.namespaceId,
        fromVisibility: current.visibility,
        toVisibility: input.visibility,
        actorKind: input.actor.kind,
        actorId: input.actor.id,
        publicationConfirmed: input.publicationConfirmed,
      })
      .returning();
    if (!event) throw new Error('Project visibility evidence was not recorded');
    return { project, event };
  });
}

export async function listProjectVisibilityEvents(
  db: AnyDB,
  projectId: string
): Promise<ProjectVisibilityEvent[]> {
  return db
    .select()
    .from(projectVisibilityEvents)
    .where(eq(projectVisibilityEvents.projectId, projectId))
    .orderBy(asc(projectVisibilityEvents.createdAt), asc(projectVisibilityEvents.eventId));
}
