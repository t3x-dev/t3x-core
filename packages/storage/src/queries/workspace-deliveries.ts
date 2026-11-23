import { and, desc, eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { workspaceDeliveries, workspaceDeployments } from '../schema-deliveries';

export type WorkspaceDeliveryReceipt = typeof workspaceDeliveries.$inferSelect;
export async function findWorkspaceDelivery(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  key: string
) {
  const [row] = await db
    .select()
    .from(workspaceDeliveries)
    .where(
      and(
        eq(workspaceDeliveries.projectId, projectId),
        eq(workspaceDeliveries.workspaceId, workspaceId),
        eq(workspaceDeliveries.idempotencyKey, key)
      )
    )
    .limit(1);
  return row ?? null;
}
export async function findWorkspaceDeliveryById(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  id: string
) {
  const [row] = await db
    .select()
    .from(workspaceDeliveries)
    .where(
      and(
        eq(workspaceDeliveries.projectId, projectId),
        eq(workspaceDeliveries.workspaceId, workspaceId),
        eq(workspaceDeliveries.id, id)
      )
    )
    .limit(1);
  return row ?? null;
}
export async function insertWorkspaceDelivery(
  db: AnyDB,
  input: typeof workspaceDeliveries.$inferInsert
) {
  await db
    .insert(workspaceDeliveries)
    .values(input)
    .onConflictDoNothing({
      target: [
        workspaceDeliveries.projectId,
        workspaceDeliveries.workspaceId,
        workspaceDeliveries.idempotencyKey,
      ],
    });
  return (await findWorkspaceDelivery(
    db,
    input.projectId,
    input.workspaceId,
    input.idempotencyKey
  ))!;
}
export async function listWorkspaceDeliveries(db: AnyDB, projectId: string, workspaceId: string) {
  return db
    .select()
    .from(workspaceDeliveries)
    .where(
      and(
        eq(workspaceDeliveries.projectId, projectId),
        eq(workspaceDeliveries.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(workspaceDeliveries.createdAt), desc(workspaceDeliveries.id))
    .limit(50);
}

export type WorkspaceDeployment = typeof workspaceDeployments.$inferSelect;
export async function findWorkspaceDeployment(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  environment: string,
  key: string
) {
  const [row] = await db
    .select()
    .from(workspaceDeployments)
    .where(
      and(
        eq(workspaceDeployments.projectId, projectId),
        eq(workspaceDeployments.workspaceId, workspaceId),
        eq(workspaceDeployments.environment, environment),
        eq(workspaceDeployments.idempotencyKey, key)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function findWorkspaceDeploymentById(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  id: string
) {
  const [row] = await db
    .select()
    .from(workspaceDeployments)
    .where(
      and(
        eq(workspaceDeployments.projectId, projectId),
        eq(workspaceDeployments.workspaceId, workspaceId),
        eq(workspaceDeployments.id, id)
      )
    )
    .limit(1);
  return row ?? null;
}

export function withWorkspaceDeploymentLock<T>(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  environment: string,
  write: (tx: AnyDB) => Promise<T>
) {
  return db.transaction(async (tx) => {
    const key = JSON.stringify([projectId, workspaceId, environment]);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(5458245, hashtext(${key}))`);
    return write(tx);
  });
}

export async function insertWorkspaceDeployment(
  db: AnyDB,
  input: typeof workspaceDeployments.$inferInsert
) {
  await db
    .insert(workspaceDeployments)
    .values({
      ...input,
      // Transaction start can precede the previous lock holder. Order by slot append time.
      createdAt: sql`greatest(clock_timestamp(), (select max(created_at) + interval '1 microsecond'
        from workspace_deployments where project_id = ${input.projectId} and workspace_id = ${input.workspaceId} and environment = ${input.environment}))`,
    })
    .onConflictDoNothing({
      target: [
        workspaceDeployments.projectId,
        workspaceDeployments.workspaceId,
        workspaceDeployments.environment,
        workspaceDeployments.idempotencyKey,
      ],
    });
  return (await findWorkspaceDeployment(
    db,
    input.projectId,
    input.workspaceId,
    input.environment,
    input.idempotencyKey
  ))!;
}

export async function listWorkspaceDeployments(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  environment?: string
) {
  return db
    .select()
    .from(workspaceDeployments)
    .where(
      and(
        eq(workspaceDeployments.projectId, projectId),
        eq(workspaceDeployments.workspaceId, workspaceId),
        environment ? eq(workspaceDeployments.environment, environment) : undefined
      )
    )
    .orderBy(desc(workspaceDeployments.createdAt), desc(workspaceDeployments.id))
    .limit(50);
}
