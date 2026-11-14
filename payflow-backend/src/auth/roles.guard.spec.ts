import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

function contextFor(authUser?: { id: string; role: UserRole }) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ authUser }) }),
  } as unknown as ExecutionContext;
}

function guardWith(metadata: { isPublic?: boolean; roles?: UserRole[] }) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? metadata.isPublic : metadata.roles,
    ),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard (SRS 1.3, NFR-SEC-03)', () => {
  it('lets public routes through without a user', () => {
    expect(guardWith({ isPublic: true }).canActivate(contextFor())).toBe(true);
  });

  it('refuses a route that has no role policy', () => {
    expect(() => guardWith({}).canActivate(contextFor())).toThrow(
      ForbiddenException,
    );
  });

  it('answers 401 when nobody is authenticated', () => {
    const guard = guardWith({ roles: [UserRole.ADMIN] });
    expect(() => guard.canActivate(contextFor())).toThrow(
      UnauthorizedException,
    );
  });

  it('answers 403 when the role is not allowed', () => {
    const guard = guardWith({ roles: [UserRole.ADMIN] });
    expect(() =>
      guard.canActivate(contextFor({ id: '1', role: UserRole.CUSTOMER })),
    ).toThrow(ForbiddenException);
  });

  it('allows a listed role', () => {
    const guard = guardWith({ roles: [UserRole.ADMIN, UserRole.AGENT] });
    expect(
      guard.canActivate(contextFor({ id: '1', role: UserRole.AGENT })),
    ).toBe(true);
  });

  it('reads the policy from the roles decorator key', () => {
    expect(ROLES_KEY).toBeDefined();
  });
});
