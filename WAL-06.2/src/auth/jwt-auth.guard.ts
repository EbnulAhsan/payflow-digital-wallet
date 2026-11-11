import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

interface AccessTokenClaims {
  sub?: unknown;
}

interface AuthenticatedRequest extends Request {
  authUser?: {
    id: string;
    role: UserRole;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const authorizationParts =
      typeof authorization === 'string'
        ? authorization.trim().split(/\s+/)
        : [];
    const token =
      authorizationParts.length === 2 && authorizationParts[0] === 'Bearer'
        ? authorizationParts[1]
        : undefined;

    if (!token) {
      throw this.unauthorized();
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token);
    } catch {
      throw this.unauthorized();
    }

    if (typeof claims.sub !== 'string' || !/^[1-9]\d*$/.test(claims.sub)) {
      throw this.unauthorized();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(claims.sub) },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw this.unauthorized(
        user ? 'ACCOUNT_NOT_ACTIVE' : 'UNAUTHENTICATED',
        user ? 'Account not active' : 'Unauthenticated',
      );
    }

    request.authUser = { id: user.id.toString(), role: user.role };
    return true;
  }

  private unauthorized(
    code = 'UNAUTHENTICATED',
    detail = 'Unauthenticated',
  ): UnauthorizedException {
    return new UnauthorizedException({ code, title: detail, detail });
  }
}
