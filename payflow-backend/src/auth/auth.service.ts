import { HttpException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ARGON2_OPTIONS: argon2.Options & { type: number } = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: string;
    fullName: string;
    mobile: string;
    email: string;
    role: UserRole;
  };
}

export interface LoginResult {
  response: LoginResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RegisterResponse {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(
      randomBytes(32).toString('hex'),
      ARGON2_OPTIONS,
    );
  }

  async register(registration: RegisterDto): Promise<RegisterResponse> {
    const mobile = registration.mobile.trim();
    const email = registration.email.trim().toLowerCase();

    if (await this.prisma.user.findUnique({ where: { mobile } })) {
      throw this.problem(
        409,
        'MOBILE_TAKEN',
        'Mobile number is already in use',
      );
    }

    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw this.problem(409, 'EMAIL_TAKEN', 'Email address is already in use');
    }

    const passwordHash = await argon2.hash(
      registration.password,
      ARGON2_OPTIONS,
    );

    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: registration.fullName.trim(),
          mobile,
          email,
          passwordHash,
          role: registration.role,
          status: UserStatus.PENDING,
        },
      });

      return {
        id: user.id.toString(),
        fullName: user.fullName,
        mobile: user.mobile,
        email: user.email,
        role: user.role,
        status: user.status,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const targetFields = Array.isArray(target) ? target : [target];

        if (targetFields.some((field) => field === 'mobile')) {
          throw this.problem(
            409,
            'MOBILE_TAKEN',
            'Mobile number is already in use',
          );
        }

        if (targetFields.some((field) => field === 'email')) {
          throw this.problem(
            409,
            'EMAIL_TAKEN',
            'Email address is already in use',
          );
        }
      }

      throw error;
    }
  }

  async login(credentials: LoginDto): Promise<LoginResult> {
    const identifier = credentials.identifier.trim();
    const where = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { mobile: identifier };
    const user = await this.prisma.user.findUnique({ where });
    const passwordHash = user?.passwordHash ?? this.dummyPasswordHash;

    if (!passwordHash) {
      throw new Error('Dummy password hash was not initialized');
    }

    const passwordMatches = await argon2.verify(
      passwordHash,
      credentials.password,
    );

    if (!user || !passwordMatches) {
      throw this.problem(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw this.problem(403, 'ACCOUNT_NOT_ACTIVE', 'Account not active');
    }

    const accessToken = await this.createAccessToken(user.id, user.role);
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: {
          id: user.id.toString(),
          fullName: user.fullName,
          mobile: user.mobile,
          email: user.email,
          role: user.role,
        },
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  async refresh(refreshToken: string | undefined): Promise<LoginResult> {
    if (!refreshToken || !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) {
      throw this.problem(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }

    const now = new Date();
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const rotated = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!current || current.revokedAt || current.expiresAt <= now) {
        return null;
      }

      if (current.user.status !== UserStatus.ACTIVE) {
        await transaction.refreshToken.updateMany({
          where: { userId: current.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return null;
      }

      const revoked = await transaction.refreshToken.updateMany({
        where: {
          id: current.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (revoked.count !== 1) {
        return null;
      }

      const nextRefreshToken = randomBytes(32).toString('base64url');
      const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
      const nextTokenHash = createHash('sha256')
        .update(nextRefreshToken)
        .digest('hex');

      await transaction.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: nextTokenHash,
          expiresAt: refreshExpiresAt,
        },
      });

      return {
        user: current.user,
        refreshToken: nextRefreshToken,
        refreshExpiresAt,
      };
    });

    if (!rotated) {
      throw this.problem(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }

    return {
      response: {
        accessToken: await this.createAccessToken(
          rotated.user.id,
          rotated.user.role,
        ),
        tokenType: 'Bearer',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: {
          id: rotated.user.id.toString(),
          fullName: rotated.user.fullName,
          mobile: rotated.user.mobile,
          email: rotated.user.email,
          role: rotated.user.role,
        },
      },
      refreshToken: rotated.refreshToken,
      refreshExpiresAt: rotated.refreshExpiresAt,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken || !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) {
      return;
    }

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createAccessToken(
    userId: bigint,
    role: UserRole,
  ): Promise<string> {
    const jwtSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
      throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
    }

    return this.jwtService.signAsync(
      { role },
      {
        algorithm: 'HS256',
        expiresIn: '15m',
        secret: jwtSecret,
        subject: userId.toString(),
      },
    );
  }

  private problem(status: number, code: string, detail: string): HttpException {
    return new HttpException(
      {
        code,
        title: detail,
        detail,
      },
      status,
    );
  }
}
