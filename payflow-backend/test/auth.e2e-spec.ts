import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { createValidationPipe } from '../src/common/validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

describe('POST /api/v1/auth/login', () => {
  let app: INestApplication;
  let passwordHash: string;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
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
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a pending customer with an Argon2id password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 43n, ...data, status: 'PENDING' }),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: ' Rahim ',
        mobile: '01711000001',
        email: 'RAHIM@example.com',
        password: 'Str0ng!Pass',
        role: 'CUSTOMER',
      })
      .expect(201);

    expect(response.body).toEqual({
      id: '43',
      fullName: 'Rahim',
      mobile: '01711000001',
      email: 'rahim@example.com',
      role: 'CUSTOMER',
      status: 'PENDING',
    });
    const storedUser = prisma.user.create.mock.calls[0][0].data;
    expect(storedUser.passwordHash).not.toBe('Str0ng!Pass');
    expect(storedUser.passwordHash).toContain('$argon2id$');
    expect(await argon2.verify(storedUser.passwordHash, 'Str0ng!Pass')).toBe(
      true,
    );

    prisma.user.findUnique.mockResolvedValue({
      id: 43n,
      ...storedUser,
      status: 'PENDING',
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: '01711000001', password: 'Str0ng!Pass' })
      .expect(403);
  });

  it('allows merchant self-registration as a pending account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 44n, ...data, status: 'PENDING' }),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Test Merchant',
        mobile: '01711000002',
        email: 'merchant@example.com',
        password: 'Merch4nt!Pass',
        role: 'MERCHANT',
      })
      .expect(201);

    expect(response.body.role).toBe('MERCHANT');
    expect(response.body.status).toBe('PENDING');
  });

  it('rejects duplicate mobile numbers with MOBILE_TAKEN', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 42n });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Rahim',
        mobile: '01711000001',
        email: 'rahim@example.com',
        password: 'Str0ng!Pass',
        role: 'CUSTOMER',
      })
      .expect(409);

    expect(response.body.code).toBe('MOBILE_TAKEN');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate email addresses with EMAIL_TAKEN', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 42n });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Rahim',
        mobile: '01711000001',
        email: 'rahim@example.com',
        password: 'Str0ng!Pass',
        role: 'CUSTOMER',
      })
      .expect(409);

    expect(response.body.code).toBe('EMAIL_TAKEN');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['mobile', '0171100'],
    ['email', 'rahim@'],
    ['password', 'short1'],
    ['password', '1qaz2wsx'],
    ['role', 'AGENT'],
  ])('returns 422 naming invalid %s input', async (field, value) => {
    const registration = {
      fullName: 'Rahim',
      mobile: '01711000001',
      email: 'rahim@example.com',
      password: 'Str0ng!Pass',
      role: 'CUSTOMER',
      [field]: value,
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(422);

    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining(field) }),
      ]),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
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
      .send({ identifier: '01711000002', password: 'Str0ng!Pass' })
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
