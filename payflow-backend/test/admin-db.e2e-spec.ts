import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { createValidationPipe } from '../src/common/validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET ??= 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

// WAL-08 acceptance tests against the real PostgreSQL database (no mocks),
// after migrations and seed/seed.sql (CI job "API tests (PostgreSQL)").
// Skipped unless RUN_DB_E2E=true, because they write rows.
//
// audit_logs is append-only (BR-11), so the users these tests create cannot
// be deleted afterwards. They use @example.test addresses, never
// @payflow.test, so the seed checks in seed-db.e2e-spec.ts still hold, and
// every wallet they create stays at 0.00 so the ledger still reconciles.
const describeWithDb =
  process.env.RUN_DB_E2E === 'true' ? describe : describe.skip;

// A seeded customer with a non-zero balance, borrowed to prove that
// deactivation keeps the balance; it is always left ACTIVE again.
const SEEDED_CUSTOMER = 'customer10@payflow.test';
const PASSWORD = 'Str0ng!Pass-wal08';

const uniqueMobile = () => `019${randomInt(10_000_000, 99_999_999)}`;
const uniqueEmail = (label: string) =>
  `wal08-${label}-${Date.now()}-${randomInt(100_000)}@example.test`;
const refreshCookie = (response: request.Response) =>
  ([] as string[])
    .concat(response.headers['set-cookie'] ?? [])
    .find((cookie) => cookie.startsWith('refresh_token='))
    ?.split(';')[0];

describeWithDb('WAL-08 admin user management against PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: bigint;
  let adminToken: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = (method: 'get' | 'post' | 'patch', path: string) =>
    http()
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const walletsOf = (userId: bigint) =>
    prisma.wallet.findMany({ where: { userId } });
  const auditFor = (userId: bigint, action: string) =>
    prisma.auditLog.findMany({
      where: { entityType: 'USER', entityId: userId, action },
      orderBy: { id: 'asc' },
    });

  async function registerPending(label: string) {
    const email = uniqueEmail(label);
    const response = await http()
      .post('/api/v1/auth/register')
      .send({
        fullName: `WAL-08 ${label}`,
        mobile: uniqueMobile(),
        email,
        password: PASSWORD,
        role: 'CUSTOMER',
      })
      .expect(201);
    return { id: BigInt(response.body.id as string), email };
  }

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

    // An admin whose password the test knows; the seeded admin's password is
    // not in the repository. Admins have no wallet (SRS 1.3).
    const adminEmail = uniqueEmail('admin');
    const admin = await prisma.user.create({
      data: {
        fullName: 'WAL-08 Test Admin',
        mobile: uniqueMobile(),
        email: adminEmail,
        passwordHash: await hashPassword(PASSWORD),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    adminId = admin.id;
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ identifier: adminEmail, password: PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    // Never leave the borrowed seeded customer inactive, even after a failure.
    await prisma.user.updateMany({
      where: { email: SEEDED_CUSTOMER, status: UserStatus.INACTIVE },
      data: { status: UserStatus.ACTIVE, statusReason: null },
    });
    await app.close();
  });

  describe('FR-ADM-04 user search', () => {
    it('filters, pages newest first and reports the total', async () => {
      const response = await asAdmin(
        'get',
        '/admin/users?role=CUSTOMER&status=ACTIVE&size=5',
      ).expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(5);
      expect(response.body.total).toBeGreaterThanOrEqual(
        response.body.items.length,
      );
      for (const user of response.body.items) {
        expect(user).toMatchObject({ role: 'CUSTOMER', status: 'ACTIVE' });
        expect(user).not.toHaveProperty('passwordHash');
      }
      const times = response.body.items.map((user: { createdAt: string }) =>
        Date.parse(user.createdAt),
      );
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('finds a user by part of the mobile number', async () => {
      const seeded = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED_CUSTOMER },
      });
      const response = await asAdmin(
        'get',
        `/admin/users?q=${seeded.mobile.slice(3)}`,
      ).expect(200);

      expect(response.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: SEEDED_CUSTOMER }),
        ]),
      );
    });
  });

  describe('FR-ADM-01, FR-WAL-01 activation', () => {
    it('activates a PENDING user with exactly one 0.00 wallet and audits it', async () => {
      const user = await registerPending('activate');
      expect(await walletsOf(user.id)).toEqual([]);

      const response = await asAdmin(
        'post',
        `/admin/users/${user.id}/activate`,
      ).expect(200);

      expect(response.body).toMatchObject({ status: 'ACTIVE' });
      const wallets = await walletsOf(user.id);
      expect(wallets).toHaveLength(1);
      expect(wallets[0]).toMatchObject({ kind: 'USER' });
      expect(wallets[0].balance.toFixed(2)).toBe('0.00');

      // BR-16
      const [row] = await auditFor(user.id, 'ACCOUNT_ACTIVATED');
      expect(row).toMatchObject({
        actorId: adminId,
        beforeData: { status: 'PENDING' },
        afterData: { status: 'ACTIVE', walletId: wallets[0].id.toString() },
      });
      expect(row.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses to activate the same user twice (409) and keeps one wallet', async () => {
      const user = await registerPending('twice');
      await asAdmin('post', `/admin/users/${user.id}/activate`).expect(200);

      const again = await asAdmin(
        'post',
        `/admin/users/${user.id}/activate`,
      ).expect(409);

      expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
      expect(await walletsOf(user.id)).toHaveLength(1);
    });

    it('answers 404 for a user that does not exist', async () => {
      const response = await asAdmin(
        'post',
        '/admin/users/999999999/activate',
      ).expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('FR-ADM-02, FR-AUTH-03 deactivation and reactivation', () => {
    it('requires a reason (422 naming "reason") and changes nothing without it', async () => {
      const seeded = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED_CUSTOMER },
      });

      for (const body of [{}, { reason: '   ' }]) {
        const response = await asAdmin(
          'post',
          `/admin/users/${seeded.id}/deactivate`,
        )
          .send(body)
          .expect(422);

        expect(response.body.code).toBe('VALIDATION_FAILED');
        expect(
          response.body.errors.some((error: { message: string }) =>
            error.message.startsWith('reason:'),
          ),
        ).toBe(true);
      }
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: seeded.id },
      });
      expect(after.status).toBe(UserStatus.ACTIVE);
    });

    it('signs the user out at once: login 403, old refresh token 401, sessions revoked', async () => {
      const user = await registerPending('signout');
      await asAdmin('post', `/admin/users/${user.id}/activate`).expect(200);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: PASSWORD })
        .expect(200);
      const cookie = refreshCookie(login);
      expect(cookie).toBeDefined();

      await asAdmin('post', `/admin/users/${user.id}/deactivate`)
        .send({ reason: 'WAL-08 acceptance test' })
        .expect(200);

      const relogin = await http()
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: PASSWORD })
        .expect(403);
      expect(relogin.body.code).toBe('ACCOUNT_NOT_ACTIVE');

      const refresh = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie!)
        .expect(401);
      expect(refresh.body.code).toBe('INVALID_REFRESH_TOKEN');

      expect(
        await prisma.refreshToken.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(0);
      const access = await http()
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${login.body.accessToken as string}`)
        .expect(401);
      expect(access.body.code).toBe('ACCOUNT_NOT_ACTIVE');
    });

    it('keeps the one wallet and its balance through deactivate and reactivate, and audits both', async () => {
      const seeded = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED_CUSTOMER },
      });
      const [walletBefore] = await walletsOf(seeded.id);
      expect(walletBefore.balance.greaterThan(0)).toBe(true);

      const deactivated = await asAdmin(
        'post',
        `/admin/users/${seeded.id}/deactivate`,
      )
        .send({ reason: '  Fraud check  ' })
        .expect(200);
      expect(deactivated.body).toMatchObject({
        status: 'INACTIVE',
        statusReason: 'Fraud check',
      });

      const reactivated = await asAdmin(
        'post',
        `/admin/users/${seeded.id}/reactivate`,
      ).expect(200);
      expect(reactivated.body).toMatchObject({
        status: 'ACTIVE',
        statusReason: null,
      });

      const walletsAfter = await walletsOf(seeded.id);
      expect(walletsAfter).toHaveLength(1);
      expect(walletsAfter[0].id).toBe(walletBefore.id);
      expect(walletsAfter[0].balance.toFixed(2)).toBe(
        walletBefore.balance.toFixed(2),
      );

      // BR-16: both changes, by this admin, with before and after.
      const [deactivation] = (
        await auditFor(seeded.id, 'ACCOUNT_DEACTIVATED')
      ).slice(-1);
      expect(deactivation).toMatchObject({
        actorId: adminId,
        beforeData: { status: 'ACTIVE' },
        afterData: { status: 'INACTIVE', statusReason: 'Fraud check' },
      });
      const [reactivation] = (
        await auditFor(seeded.id, 'ACCOUNT_REACTIVATED')
      ).slice(-1);
      expect(reactivation).toMatchObject({
        actorId: adminId,
        beforeData: { status: 'INACTIVE', statusReason: 'Fraud check' },
        afterData: { status: 'ACTIVE' },
      });
    });

    it('refuses to deactivate an administrator (422)', async () => {
      const response = await asAdmin(
        'post',
        `/admin/users/${adminId}/deactivate`,
      )
        .send({ reason: 'test' })
        .expect(422);
      expect(response.body.code).toBe('TARGET_ROLE_NOT_ALLOWED');
    });
  });

  describe('admin user view / edit (GET and PATCH /admin/users/{id})', () => {
    it("shows one user's details with the wallet balance (null without a wallet)", async () => {
      const seeded = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED_CUSTOMER },
        include: { wallet: true },
      });
      const detail = await asAdmin('get', `/admin/users/${seeded.id}`).expect(
        200,
      );
      expect(detail.body).toMatchObject({
        id: seeded.id.toString(),
        email: SEEDED_CUSTOMER,
        role: 'CUSTOMER',
        balance: seeded.wallet!.balance.toFixed(2),
      });
      expect(detail.body).not.toHaveProperty('passwordHash');

      const pending = await registerPending('detail');
      const pendingDetail = await asAdmin(
        'get',
        `/admin/users/${pending.id}`,
      ).expect(200);
      expect(pendingDetail.body).toMatchObject({
        status: 'PENDING',
        balance: null,
      });

      await asAdmin('get', '/admin/users/999999999').expect(404);
    });

    it('edits name, email and mobile, audits it, and the new mobile logs in', async () => {
      const user = await registerPending('profile');
      await asAdmin('post', `/admin/users/${user.id}/activate`).expect(200);
      const newEmail = uniqueEmail('profile-new');
      const newMobile = uniqueMobile();

      const response = await asAdmin('patch', `/admin/users/${user.id}`)
        .send({
          fullName: '  Edited Name  ',
          email: newEmail.toUpperCase(),
          mobile: newMobile,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        fullName: 'Edited Name',
        email: newEmail,
        mobile: newMobile,
        balance: '0.00',
      });
      const [row] = await auditFor(user.id, 'ACCOUNT_UPDATED');
      expect(row).toMatchObject({
        actorId: adminId,
        beforeData: expect.objectContaining({ email: user.email }),
        afterData: {
          fullName: 'Edited Name',
          email: newEmail,
          mobile: newMobile,
        },
      });
      expect(row.requestId).toMatch(/^[0-9a-f-]{36}$/);
      // The mobile number is also the wallet number and the login (Q3).
      await http()
        .post('/api/v1/auth/login')
        .send({ identifier: newMobile, password: PASSWORD })
        .expect(200);
    });

    it.each([
      ['mobile', 'MOBILE_TAKEN'],
      ['email', 'EMAIL_TAKEN'],
    ])(
      'answers 409 when the %s belongs to another user',
      async (field, code) => {
        const seeded = await prisma.user.findUniqueOrThrow({
          where: { email: SEEDED_CUSTOMER },
        });
        const user = await registerPending(`dup-${field}`);

        const response = await asAdmin('patch', `/admin/users/${user.id}`)
          .send({ [field]: seeded[field as 'mobile' | 'email'] })
          .expect(409);
        expect(response.body.code).toBe(code);
      },
    );

    it('answers 422 VALIDATION_FAILED for a mobile in the wrong format', async () => {
      const user = await registerPending('badmobile');
      const response = await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ mobile: '0171100' })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.errors[0].message).toMatch(/^mobile:/);
    });

    it.each([
      ['role', { role: 'ADMIN' }],
      ['balance', { balance: '1000000.00' }],
      ['id', { id: '1' }],
    ])(
      'refuses to change the %s (422 FIELD_IMMUTABLE) and changes nothing',
      async (field, body) => {
        const seeded = await prisma.user.findUniqueOrThrow({
          where: { email: SEEDED_CUSTOMER },
          include: { wallet: true },
        });

        const response = await asAdmin('patch', `/admin/users/${seeded.id}`)
          .send({ fullName: 'Should Not Save', ...body })
          .expect(422);

        expect(response.body.code).toBe('FIELD_IMMUTABLE');
        const after = await prisma.user.findUniqueOrThrow({
          where: { id: seeded.id },
          include: { wallet: true },
        });
        expect(after.fullName).toBe(seeded.fullName);
        expect(after.role).toBe(seeded.role);
        expect(after.wallet!.balance.toFixed(2)).toBe(
          seeded.wallet!.balance.toFixed(2),
        );
      },
    );

    it('moves PENDING -> ACTIVE -> INACTIVE -> ACTIVE with the SRS side effects', async () => {
      const user = await registerPending('status');

      await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(await walletsOf(user.id)).toHaveLength(1);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: PASSWORD })
        .expect(200);

      const noReason = await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ status: 'INACTIVE' })
        .expect(422);
      expect(noReason.body.errors[0].message).toMatch(/^reason:/);

      await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ status: 'INACTIVE', reason: 'Fraud check' })
        .expect(200);
      expect(
        await prisma.refreshToken.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(0);
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie(login)!)
        .expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: PASSWORD })
        .expect(403);

      const back = await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(back.body).toMatchObject({ status: 'ACTIVE', balance: '0.00' });
      expect(await walletsOf(user.id)).toHaveLength(1);

      expect(
        (
          await prisma.auditLog.findMany({
            where: { entityType: 'USER', entityId: user.id },
            orderBy: { id: 'asc' },
          })
        ).map((row) => [row.action, row.actorId]),
      ).toEqual([
        ['ACCOUNT_ACTIVATED', adminId],
        ['ACCOUNT_DEACTIVATED', adminId],
        ['ACCOUNT_REACTIVATED', adminId],
      ]);
    });

    it('rejects a pending registration for good (SRS 4.1)', async () => {
      const user = await registerPending('reject');

      const response = await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ status: 'REJECTED', reason: 'Duplicate account' })
        .expect(200);
      expect(response.body).toMatchObject({
        status: 'REJECTED',
        statusReason: 'Duplicate account',
        balance: null,
      });
      expect(await walletsOf(user.id)).toEqual([]);
      const [row] = await auditFor(user.id, 'ACCOUNT_REJECTED');
      expect(row).toMatchObject({
        actorId: adminId,
        beforeData: { status: 'PENDING' },
        afterData: { status: 'REJECTED' },
      });

      const again = await asAdmin('patch', `/admin/users/${user.id}`)
        .send({ status: 'ACTIVE' })
        .expect(409);
      expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
      await http()
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: PASSWORD })
        .expect(403);
    });
  });

  describe('FR-ADM-03, BR-14 agents', () => {
    it('creates an ACTIVE agent that must reset the password, with a 0.00 wallet, and audits it', async () => {
      const email = uniqueEmail('agent');
      const mobile = uniqueMobile();
      const response = await asAdmin('post', '/admin/agents')
        .send({
          fullName: 'Agent Mirpur',
          mobile,
          email,
          password: 'Agent0Pass9x',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        role: 'AGENT',
        status: 'ACTIVE',
        mustResetPw: true,
        wallet: { balance: '0.00' },
      });
      const agent = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(agent).toMatchObject({
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
        mustResetPw: true,
      });
      expect(agent.passwordHash).toMatch(/^\$argon2id\$/);
      const wallets = await walletsOf(agent.id);
      expect(wallets).toHaveLength(1);
      expect(wallets[0].balance.toFixed(2)).toBe('0.00');

      const [row] = await auditFor(agent.id, 'AGENT_CREATED');
      expect(row).toMatchObject({
        actorId: adminId,
        beforeData: null,
        afterData: expect.objectContaining({
          role: 'AGENT',
          status: 'ACTIVE',
          mobile,
          email,
        }),
      });
      expect(JSON.stringify(row.afterData)).not.toContain('Agent0Pass9x');

      // The duplicate checks run against the stored agent.
      const sameMobile = await asAdmin('post', '/admin/agents')
        .send({
          fullName: 'Copy',
          mobile,
          email: uniqueEmail('copy'),
          password: 'Agent0Pass9x',
        })
        .expect(409);
      expect(sameMobile.body.code).toBe('MOBILE_TAKEN');
      const sameEmail = await asAdmin('post', '/admin/agents')
        .send({
          fullName: 'Copy',
          mobile: uniqueMobile(),
          email,
          password: 'Agent0Pass9x',
        })
        .expect(409);
      expect(sameEmail.body.code).toBe('EMAIL_TAKEN');
    });

    it.each(['CUSTOMER', 'MERCHANT', 'ADMIN'])(
      'creates only agents: a role of %s in the body is refused (422)',
      async (role) => {
        const email = uniqueEmail('notagent');
        const response = await asAdmin('post', '/admin/agents')
          .send({
            fullName: 'Not An Agent',
            mobile: uniqueMobile(),
            email,
            password: PASSWORD,
            role,
          })
          .expect(422);

        expect(response.body.code).toBe('VALIDATION_FAILED');
        expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      },
    );

    it('does not let anyone self-register as an AGENT (422 naming "role")', async () => {
      const email = uniqueEmail('selfagent');
      const response = await http()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Self Agent',
          mobile: uniqueMobile(),
          email,
          password: PASSWORD,
          role: 'AGENT',
        })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(
        response.body.errors.some((error: { message: string }) =>
          error.message.startsWith('role:'),
        ),
      ).toBe(true);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });
  });
});
