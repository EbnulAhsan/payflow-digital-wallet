import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { createValidationPipe } from '../src/common/validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';
import { Test } from '@nestjs/testing';

process.env.JWT_ACCESS_SECRET ??= 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

// These tests use the real PostgreSQL database (no mocks). They run in CI
// against a service container (WAL-07.2). Locally they are skipped unless
// RUN_DB_E2E=true, because they write rows to the database in DATABASE_URL.
const describeWithDb =
  process.env.RUN_DB_E2E === 'true' ? describe : describe.skip;

describeWithDb('Auth API against PostgreSQL (FR-AUTH-01, FR-AUTH-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Random values so a re-run never collides with an earlier run.
  const suffix = `${Date.now()}${randomInt(1000)}`;
  const mobile = `017${randomInt(10_000_000, 99_999_999)}`;
  const email = `e2e-${suffix}@example.test`;
  const password = 'Str0ng!Pass-e2e';
  const registration = {
    fullName: 'E2E Customer',
    mobile,
    email,
    password,
    role: 'CUSTOMER',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('registers a pending account and stores it in the database', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);

    expect(response.body).toMatchObject({
      email,
      mobile,
      role: 'CUSTOMER',
      status: 'PENDING',
    });
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored?.status).toBe('PENDING');
    // The password is stored as an Argon2id hash, never as plain text.
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a duplicate mobile with 409 MOBILE_TAKEN', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...registration, email: `other-${email}` })
      .expect(409);

    expect(response.body.code).toBe('MOBILE_TAKEN');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...registration,
        mobile: `018${randomInt(10_000_000, 99_999_999)}`,
      })
      .expect(409);

    expect(response.body.code).toBe('EMAIL_TAKEN');
  });

  it('does not let a pending account log in (403 ACCOUNT_NOT_ACTIVE)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: mobile, password })
      .expect(403);

    expect(response.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('gives the same 401 for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: mobile, password: 'Wrong!Pass123' })
      .expect(401);
    const unknownAccount = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: '01600000000', password })
      .expect(401);

    expect(wrongPassword.body.detail).toBe(unknownAccount.body.detail);
  });

  it('logs in after activation: access token and a refresh cookie', async () => {
    await prisma.user.update({ where: { email }, data: { status: 'ACTIVE' } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(200);

    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { email, role: 'CUSTOMER' },
    });
    expect(typeof response.body.accessToken).toBe('string');

    const cookies = ([] as string[]).concat(
      response.headers['set-cookie'] ?? [],
    );
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.join(';')).toMatch(/HttpOnly/i);
  });
});
