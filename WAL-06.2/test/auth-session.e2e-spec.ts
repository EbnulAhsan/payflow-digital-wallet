import {
  Controller,
  Get,
  INestApplication,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

@Controller('_test')
class ProtectedProbeController {
  @Get('protected')
  getSession(
    @Req() request: Request & {
      authUser?: { id: string; role: UserRole };
    },
  ): { id: string; role: UserRole } | undefined {
    return request.authUser;
  }
}

describe('FR-AUTH-03 session refresh and logout', () => {
  let app: INestApplication;
  const activeUser = {
    id: 42n,
    fullName: 'Test User',
    mobile: '01711000001',
    email: 'user@example.com',
    role: 'CUSTOMER' as const,
    status: 'ACTIVE' as const,
  };
  const refreshToken = 'a'.repeat(43);
  const tx = {
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: tx.refreshToken,
    $transaction: jest.fn(
      (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rotates a valid refresh token and rejects its reuse', async () => {
    const current = {
      id: 1n,
      userId: activeUser.id,
      tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser,
    };
    tx.refreshToken.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, revokedAt: new Date() });
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue({});

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(200);

    expect(response.body.expiresIn).toBe(900);
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: current.id }),
        data: { revokedAt: expect.any(Date) },
      }),
    );
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: activeUser.id,
        expiresAt: expect.any(Date),
      }),
    });

    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!cookie) {
      throw new Error('Rotated refresh cookie was not set');
    }
    const nextToken = cookie.split(';')[0].split('=')[1];
    expect(nextToken).not.toBe(refreshToken);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');

    expect(cookie).toContain('SameSite=Strict');

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(401);
  });

  it('revokes the refresh token and clears its cookie at logout', async () => {
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(204);

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toContain('refresh_token=;');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');

    tx.refreshToken.findUnique.mockResolvedValue({
      id: 1n,
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: activeUser,
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(401);
  });

  it('refuses to refresh an inactive account and revokes its token', async () => {
    tx.refreshToken.findUnique.mockResolvedValue({
      id: 1n,
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { ...activeUser, status: 'INACTIVE' },
    });
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(401);

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: activeUser.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('blocks protected API calls for a deactivated user', async () => {
    const accessToken = await app.get(JwtService).signAsync(
      { role: activeUser.role },
      { subject: activeUser.id.toString() },
    );
    prisma.user.findUnique.mockResolvedValueOnce({
      id: activeUser.id,
      role: activeUser.role,
      status: 'ACTIVE',
    }).mockResolvedValueOnce({
      id: activeUser.id,
      role: activeUser.role,
      status: 'INACTIVE',
    });

    const activeResponse = await request(app.getHttpServer())
      .get('/api/v1/_test/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(activeResponse.body).toEqual({
      id: activeUser.id.toString(),
      role: activeUser.role,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/_test/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(response.body.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: activeUser.id },
      select: { id: true, role: true, status: true },
    });
  });
});
