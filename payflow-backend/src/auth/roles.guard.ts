import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

interface AuthenticatedRequest extends Request {
  authUser?: {
    id: string;
    role: UserRole;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      controller,
    ]);

    if (isPublic) {
      return true;
    }

    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [handler, controller],
    );

    if (!allowedRoles) {
      throw new ForbiddenException({
        code: 'ROLE_POLICY_NOT_DEFINED',
        title: 'Forbidden',
        detail: 'Role access policy is not defined for this route',
      });
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authUser) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        title: 'Unauthenticated',
        detail: 'Unauthenticated',
      });
    }

    if (!allowedRoles.includes(request.authUser.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        title: 'Forbidden',
        detail: 'Insufficient role',
      });
    }

    return true;
  }
}
