import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { createValidationPipe } from '../src/common/validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

describe('failed-login lockout', () => {
  let app: INestApplication;
  let passwordHash: string;
  const loginState = {
    failedLogins: 0,
    lockedUntil: null as Date | null,
  };
  const failedAttempts: Date[] = [];
  const activeUser = {
    id: 42n,
    fullName: 'Test User',
    mobile: '01711000001',
    email: 'user@example.com',
    passwordHash: '',
    role: 'CUSTOMER' as const,
    status: 'ACTIVE' as const,
  };
  const transaction = {
    $queryRaw: jest
      .fn()
      .mockImplementation(async () => [
        { lockedUntil: loginState.lockedUntil },
      ]),
    loginFailure: {
      deleteMany: jest.fn().mockImplementation(({ where }) => {
        const remaining = where.failedAt
          ? failedAttempts.filter((failedAt) => failedAt > where.failedAt.lte)
          : [];
        const deleted = failedAttempts.length - remaining.length;
        failedAttempts.splice(0, failedAttempts.length, ...remaining);
        return { count: deleted };
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        failedAttempts.push(data.failedAt);
        return data;
      }),
      count: jest
        .fn()
        .mockImplementation(
          ({ where }) =>
            failedAttempts.filter(
              (failedAt) =>
                failedAt > where.failedAt.gt && failedAt <= where.failedAt.lte,
            ).length,
        ),
    },
    user: {
      update: jest.fn().mockImplementation(({ data }) => {
        Object.assign(loginState, data);
        return loginState;
      }),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
    $transaction: jest.fn(
      (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
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
    Object.assign(loginState, {
      failedLogins: 0,
      lockedUntil: null,
    });
    failedAttempts.splice(0);
    prisma.user.findUnique.mockImplementation(async () => ({
      ...activeUser,
      passwordHash,
      ...loginState,
    }));
    prisma.refreshToken.create.mockResolvedValue({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks after five failures and rejects the sixth attempt, including a correct password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: activeUser.mobile, password: 'Wrong!Pass1' })
        .expect(401);
    }

    expect(loginState.failedLogins).toBe(5);
    expect(loginState.lockedUntil).toBeInstanceOf(Date);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: activeUser.mobile, password: 'Str0ng!Pass' })
      .expect(429);

    expect(response.body.code).toBe('TEMPORARILY_LOCKED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(900);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('counts failures in the rolling 15-minute window', async () => {
    failedAttempts.push(
      new Date(Date.now() - 20 * 60 * 1000),
      ...Array.from(
        { length: 4 },
        (_, index) => new Date(Date.now() - (14 - index) * 60 * 1000),
      ),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: activeUser.mobile, password: 'Wrong!Pass1' })
      .expect(401);

    expect(loginState.failedLogins).toBe(5);
    expect(loginState.lockedUntil).toBeInstanceOf(Date);
    expect(failedAttempts).toHaveLength(5);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: activeUser.mobile, password: 'Str0ng!Pass' })
      .expect(429);

    expect(response.body.code).toBe('TEMPORARILY_LOCKED');
  });

  it('clears the failure window after a successful login', async () => {
    loginState.failedLogins = 3;
    failedAttempts.push(
      ...Array.from(
        { length: 3 },
        (_, index) => new Date(Date.now() - (index + 1) * 60_000),
      ),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: activeUser.mobile, password: 'Str0ng!Pass' })
      .expect(200);

    expect(loginState.failedLogins).toBe(0);
    expect(loginState.lockedUntil).toBeNull();
    expect(failedAttempts).toHaveLength(0);
  });
});
