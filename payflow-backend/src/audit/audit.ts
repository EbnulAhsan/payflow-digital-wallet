import { Prisma } from '@prisma/client';
import { isIP } from 'node:net';

/** Who made a change, from where, and in which request (BR-16). */
export interface AuditContext {
  actorId: bigint | null;
  ipAddress: string | null;
  requestId: string;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: bigint;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/**
 * Writes one audit row inside the caller's transaction, so the change and its
 * audit row commit or roll back together (BR-16). audit_logs is append-only
 * (BR-11): rows are only ever inserted.
 */
export async function writeAudit(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  entry: AuditEntry,
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorId: context.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeData: entry.before ?? Prisma.DbNull,
      afterData: entry.after ?? Prisma.DbNull,
      ipAddress: normalizeIp(context.ipAddress),
      requestId: context.requestId,
    },
  });
}

/**
 * audit_logs.ip_address is INET. Express can report an IPv4 client as
 * "::ffff:1.2.3.4"; store the plain IPv4 form, and store nothing rather than
 * fail the whole change when the address is not a valid IP.
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }
  const plain = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
  return isIP(plain) ? plain : null;
}
