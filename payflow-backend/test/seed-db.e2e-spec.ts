import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { createValidationPipe } from '../src/common/validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET ??= 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

// Runs against the real database after seed/seed.sql was loaded (WAL-07.2).
// Skipped unless RUN_DB_E2E=true and SEED_PASSWORD (the demo password of the
// seeded accounts) is set.
const enabled =
  process.env.RUN_DB_E2E === 'true' && Boolean(process.env.SEED_PASSWORD);
const describeWithSeed = enabled ? describe : describe.skip;

describeWithSeed('Demo seed data in PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = process.env.SEED_PASSWORD ?? '';

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
    await app.close();
  });

  describe('login with the seeded accounts', () => {
    it.each([
      ['admin@payflow.test', 'ADMIN'],
      ['agent01@payflow.test', 'AGENT'],
      ['customer01@payflow.test', 'CUSTOMER'],
      ['merchant01@payflow.test', 'MERCHANT'],
    ])('%s logs in as %s', async (identifier, role) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier, password })
        .expect(200);

      expect(response.body.user).toMatchObject({ email: identifier, role });
      expect(typeof response.body.accessToken).toBe('string');
    });

    it('logs in with the seeded mobile number too', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: '01710000101', password })
        .expect(200);

      expect(response.body.user.email).toBe('customer01@payflow.test');
    });

    it('refuses a seeded PENDING customer with 403 ACCOUNT_NOT_ACTIVE', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'customer11@payflow.test', password })
        .expect(403);

      expect(response.body.code).toBe('ACCOUNT_NOT_ACTIVE');
    });
  });

  describe('seeded users', () => {
    it('has 29 seeded users: 1 admin, 3 agents, 20 customers, 5 merchants', async () => {
      const rows = await prisma.$queryRaw<{ role: string; total: string }[]>`
        SELECT role::text AS role, COUNT(*)::text AS total
        FROM users
        WHERE email LIKE '%@payflow.test'
        GROUP BY role`;
      const byRole = Object.fromEntries(rows.map((r) => [r.role, r.total]));

      expect(byRole).toEqual({
        ADMIN: '1',
        AGENT: '3',
        CUSTOMER: '20',
        MERCHANT: '5',
      });
    });

    it('stores only Argon2id hashes', async () => {
      const [row] = await prisma.$queryRaw<{ bad: string }[]>`
        SELECT COUNT(*)::text AS bad
        FROM users
        WHERE email LIKE '%@payflow.test'
          AND password_hash NOT LIKE '$argon2id$%'`;

      expect(row.bad).toBe('0');
    });
  });

  describe('ledger reconciliation after the seed', () => {
    it('has exactly one treasury wallet (BR-01)', async () => {
      const [row] = await prisma.$queryRaw<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM wallets WHERE kind = 'TREASURY'`;

      expect(row.total).toBe('1');
    });

    it('has no negative user wallet (BR-01)', async () => {
      const [row] = await prisma.$queryRaw<{ total: string }[]>`
        SELECT COUNT(*)::text AS total
        FROM wallets
        WHERE kind = 'USER' AND balance < 0`;

      expect(row.total).toBe('0');
    });

    it('writes one debit and one credit of the same amount per completed transaction (BR-02)', async () => {
      const rows = await prisma.$queryRaw<{ reference: string }[]>`
        SELECT t.reference
        FROM transactions t
        LEFT JOIN ledger_entries l ON l.transaction_id = t.id
        WHERE t.status = 'COMPLETED'
        GROUP BY t.id, t.reference
        HAVING COUNT(l.id) <> 2
            OR SUM(l.amount) <> 0
            OR COUNT(*) FILTER (WHERE l.amount < 0) <> 1`;

      expect(rows).toEqual([]);
    });

    it('sums every wallet balance, treasury included, to 0.00 (BR-03)', async () => {
      const [row] = await prisma.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM(balance), 0)::text AS total FROM wallets`;

      expect(Number(row.total)).toBe(0);
    });

    it('keeps each wallet balance equal to the sum of its ledger entries (BR-04)', async () => {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT w.id::text AS id
        FROM wallets w
        LEFT JOIN ledger_entries l ON l.wallet_id = w.id
        GROUP BY w.id, w.balance
        HAVING w.balance <> COALESCE(SUM(l.amount), 0)`;

      expect(rows).toEqual([]);
    });
  });
});
