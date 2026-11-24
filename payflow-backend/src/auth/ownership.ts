import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: UserRole;
}

type OwnerId = bigint | string | null | undefined;

/**
 * BR-15 and NFR-SEC-04: users see only their own resources; admins see all.
 *
 * Load the resource first, then pass the user ID (or IDs, for a transaction
 * with two parties) that may see it, or null when nothing was found. A
 * missing resource and another user's resource both answer 404 NOT_FOUND, so
 * an ID that belongs to someone else cannot be told apart from one that does
 * not exist.
 */
export function assertOwnerOrAdmin(
  user: AuthUser,
  owners: OwnerId | readonly OwnerId[],
): void {
  const ownerIds = (Array.isArray(owners) ? owners : [owners]).filter(
    (ownerId): ownerId is bigint | string => ownerId != null,
  );

  if (ownerIds.length === 0) {
    throw notFound();
  }

  if (user.role === UserRole.ADMIN) {
    return;
  }

  if (!ownerIds.some((ownerId) => ownerId.toString() === user.id)) {
    throw notFound();
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'NOT_FOUND',
    title: 'Not found',
    detail: 'Resource not found',
  });
}
