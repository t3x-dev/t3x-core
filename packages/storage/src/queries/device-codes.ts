import { randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { deviceCodes } from '../schema-trees';

function generateId(): string {
  return `dc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function generateDeviceCode(): string {
  return randomUUID().replace(/-/g, ''); // 32-char hex
}

function generateUserCode(): string {
  // 8-char alphanumeric, easy to type: ABCD-1234
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function insertDeviceCode(
  db: AnyDB,
  input: { clientId: string; expiresInSeconds: number }
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInSeconds * 1000);
  const id = generateId();
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();

  const [row] = await db
    .insert(deviceCodes)
    .values({
      id,
      deviceCode,
      userCode,
      clientId: input.clientId,
      status: 'pending',
      expiresAt,
      createdAt: now,
    })
    .returning();

  return row;
}

export async function findDeviceCodeByUserCode(db: AnyDB, userCode: string) {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(
      and(
        eq(deviceCodes.userCode, userCode),
        eq(deviceCodes.status, 'pending')
      )
    );
  return row ?? null;
}

export async function findDeviceCodeByDeviceCode(db: AnyDB, deviceCode: string) {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.deviceCode, deviceCode));
  return row ?? null;
}

export async function authorizeDeviceCode(
  db: AnyDB,
  id: string,
  userId: string
) {
  const [row] = await db
    .update(deviceCodes)
    .set({ status: 'authorized', userId })
    .where(and(eq(deviceCodes.id, id), eq(deviceCodes.status, 'pending')))
    .returning();
  return row ?? null;
}

export async function markDeviceCodeUsed(
  db: AnyDB,
  id: string,
  apiKeyId: string
) {
  const [row] = await db
    .update(deviceCodes)
    .set({ status: 'used', apiKeyId })
    .where(and(eq(deviceCodes.id, id), eq(deviceCodes.status, 'authorized')))
    .returning();
  return row ?? null;
}

export async function cleanupExpiredDeviceCodes(db: AnyDB) {
  await db
    .update(deviceCodes)
    .set({ status: 'expired' })
    .where(
      and(
        eq(deviceCodes.status, 'pending'),
        lt(deviceCodes.expiresAt, new Date())
      )
    );
}
