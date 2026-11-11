import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

describe('POST /api/v1/auth/login', () => {
  let app: INestApplication;
  let passwordHash: string;
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  };
  const activeUser = {
    id: 42n,
    fullName: 'Test User',
    mobile: '01711000001',
    email: 'user@example.com',
    passwordHash: '',
    role: 'CUSTOMER' as const,
    status: 'ACTIVE' as const,
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash('Str0ng!Pass', {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
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

  it('issues a 15-minute JWT and stores only the refresh-token hash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      passwordHash,
    });
    prisma.refreshToken.create.mockResolvedValue({});

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: activeUser.mobile, password: 'Str0ng!Pass' })
      .expect(200);

    expect(response.body.user).toEqual({
      id: '42',
      fullName: activeUser.fullName,
      mobile: activeUser.mobile,
      email: activeUser.email,
      role: activeUser.role,
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.headers['x-request-id']).toBeDefined();

    const claims = await app
      .get(JwtService)
      .verifyAsync<{ sub: string; role: string; iat: number; exp: number }>(
        response.body.accessToken,
      );
    expect(claims.sub).toBe('42');
    expect(claims.role).toBe('CUSTOMER');
    expect(claims.exp - claims.iat).toBe(900);

    const cookieHeader = response.headers['set-cookie'];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    if (!cookie) {
      throw new Error('Refresh cookie was not set');
    }
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth');

    const refreshToken = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
    const storedData = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(storedData.tokenHash).toBe(
      createHash('sha256').update(refreshToken).digest('hex'),
    );
    expect(storedData.tokenHash).not.toBe(refreshToken);
    expect(storedData.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('uses the same 401 error for an unknown account and a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...activeUser,
      passwordHash,
    });

    const unknownAccount = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'unknown@example.com', password: 'Str0ng!Pass' })
      .expect(401);
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: activeUser.email, password: 'Wrong!Pass1' })
      .expect(401);

    expect(unknownAccount.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknownAccount.body.title).toBe('Invalid credentials');
    expect(unknownAccount.body.detail).toBe('Invalid credentials');
    expect(wrongPassword.body.code).toBe(unknownAccount.body.code);
    expect(wrongPassword.body.title).toBe(unknownAccount.body.title);
    expect(wrongPassword.body.detail).toBe(unknownAccount.body.detail);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'INACTIVE'] as const)(
    'refuses a correctly authenticated %s account',
    async (status) => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        passwordHash,
        status,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: activeUser.email, password: 'Str0ng!Pass' })
        .expect(403);

      expect(response.body.code).toBe('ACCOUNT_NOT_ACTIVE');
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    },
  );

  it('normalizes email identifiers before lookup', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      passwordHash,
    });
    prisma.refreshToken.create.mockResolvedValue({});

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'USER@EXAMPLE.COM', password: 'Str0ng!Pass' })
      .expect(200);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
  });
});
