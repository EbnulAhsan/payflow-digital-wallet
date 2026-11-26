import { HttpException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import type { AuditContext } from '../audit/audit';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

jest.mock('../auth/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$argon2id$v=19$hash'),
}));

const audit: AuditContext = {
  actorId: 1n,
  ipAddress: '203.0.113.7',
  requestId: '0b6c9f0e-6d1e-4c51-8a7d-2f3b9a1c4e55',
};

const createdAt = new Date('2026-11-10T08:15:02.114Z');
const updatedAt = new Date('2026-11-11T09:00:00.000Z');

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7n,
    fullName: 'Rahim Uddin',
    mobile: '01711000001',
    email: 'rahim@example.com',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    statusReason: null,
    mustResetPw: false,
    createdAt,
    updatedAt,
    wallet: { balance: new Prisma.Decimal('2000') },
    ...overrides,
  };
}

function lockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7n,
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    statusReason: null,
    ...overrides,
  };
}

function setup() {
  const tx = {
    $queryRaw: jest.fn(),
    user: {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue(userRow()),
    },
    wallet: { upsert: jest.fn(), create: jest.fn() },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const service = new AdminService(prisma as unknown as PrismaService);
  // The FOR UPDATE row read that starts every change.
  const locked = (row: Record<string, unknown> | null) =>
    tx.$queryRaw.mockResolvedValueOnce(row ? [row] : []);
  // The cash-out UPDATE ... RETURNING of a deactivation.
  const cancels = (ids: bigint[]) =>
    tx.$queryRaw.mockResolvedValueOnce(ids.map((id) => ({ id })));
  return { service, prisma, tx, locked, cancels };
}

async function problemOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    return {
      status: exception.getStatus(),
      ...(exception.getResponse() as object),
    };
  }
  throw new Error('expected the call to fail');
}

const auditRows = (tx: ReturnType<typeof setup>['tx']) =>
  tx.auditLog.create.mock.calls.map(([{ data }]) => data);
const statusUpdate = (tx: ReturnType<typeof setup>['tx']) =>
  tx.user.update.mock.calls
    .map(([args]) => args.data)
    .find((data) => 'status' in data);

describe('AdminService.listUsers (FR-ADM-04)', () => {
  it('filters by role, status and name or mobile, newest first, with a total', async () => {
    const { service, prisma } = setup();
    prisma.user.count.mockResolvedValue(45);
    prisma.user.findMany.mockResolvedValue([userRow()]);

    const page = await service.listUsers({
      page: 2,
      size: 20,
      q: '0171',
      role: UserRole.CUSTOMER,
      status: UserStatus.PENDING,
    });

    const where = {
      role: UserRole.CUSTOMER,
      status: UserStatus.PENDING,
      OR: [
        { fullName: { contains: '0171', mode: 'insensitive' } },
        { mobile: { contains: '0171' } },
      ],
    };
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 20,
      }),
    );
    expect(page).toEqual({
      items: [
        {
          id: '7',
          fullName: 'Rahim Uddin',
          mobile: '01711000001',
          email: 'rahim@example.com',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          statusReason: null,
          mustResetPw: false,
          balance: '2000.00',
          createdAt: '2026-11-10T08:15:02.114Z',
          updatedAt: '2026-11-11T09:00:00.000Z',
        },
      ],
      page: 2,
      size: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it('shows no balance for an account without a wallet (pending or admin)', async () => {
    const { service, prisma } = setup();
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([userRow({ wallet: null })]);

    const page = await service.listUsers({ page: 1, size: 20 });

    expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
    expect(page.items[0].balance).toBeNull();
  });

  it('never selects the password hash', async () => {
    const { service, prisma } = setup();
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    await service.listUsers({ page: 1, size: 20 });

    const [{ select }] = prisma.user.findMany.mock.calls[0];
    expect(select).not.toHaveProperty('passwordHash');
  });
});

describe('AdminService.getUser', () => {
  it("returns the user's details with the balance as a decimal string", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await expect(service.getUser(7n)).resolves.toMatchObject({
      id: '7',
      mobile: '01711000001',
      balance: '2000.00',
    });
  });

  it('answers 404 NOT_FOUND for an unknown user', async () => {
    const { service } = setup();

    expect(await problemOf(service.getUser(99n))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('AdminService.activate (FR-ADM-01, FR-WAL-01)', () => {
  it('activates a pending customer, ensures one wallet and audits it', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow({ status: UserStatus.PENDING }));
    tx.wallet.upsert.mockResolvedValue({ id: 40n });

    await expect(service.activate(7n, audit)).resolves.toMatchObject({
      id: '7',
    });

    expect(statusUpdate(tx)).toMatchObject({
      status: UserStatus.ACTIVE,
      statusReason: null,
    });
    // upsert: a second activation never creates a second wallet.
    expect(tx.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7n },
        update: {},
        create: { userId: 7n },
      }),
    );
    expect(auditRows(tx)).toEqual([
      {
        actorId: 1n,
        action: 'ACCOUNT_ACTIVATED',
        entityType: 'USER',
        entityId: 7n,
        beforeData: { status: 'PENDING' },
        afterData: { status: 'ACTIVE', walletId: '40' },
        ipAddress: '203.0.113.7',
        requestId: audit.requestId,
      },
    ]);
  });

  it('activates a pending merchant too', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow({ role: UserRole.MERCHANT, status: UserStatus.PENDING }));
    tx.wallet.upsert.mockResolvedValue({ id: 41n });

    await service.activate(7n, audit);

    expect(auditRows(tx)[0]).toMatchObject({ action: 'ACCOUNT_ACTIVATED' });
  });

  it('answers 404 NOT_FOUND for an unknown user', async () => {
    const { service, tx, locked } = setup();
    locked(null);

    expect(await problemOf(service.activate(99n, audit))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.AGENT])(
    'answers 422 TARGET_ROLE_NOT_ALLOWED for an %s',
    async (role) => {
      const { service, tx, locked } = setup();
      locked(lockRow({ role }));

      expect(await problemOf(service.activate(7n, audit))).toMatchObject({
        status: 422,
        code: 'TARGET_ROLE_NOT_ALLOWED',
      });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it.each([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.REJECTED])(
    'answers 409 INVALID_STATUS_TRANSITION for a %s account',
    async (status) => {
      const { service, tx, locked } = setup();
      locked(lockRow({ status }));

      expect(await problemOf(service.activate(7n, audit))).toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
      expect(tx.wallet.upsert).not.toHaveBeenCalled();
    },
  );
});

describe('AdminService.deactivate (FR-ADM-02, FR-AUTH-03, Q9)', () => {
  it('deactivates, revokes sessions, cancels pending cash-outs and audits each change', async () => {
    const { service, tx, locked, cancels } = setup();
    locked(lockRow());
    cancels([5n, 6n]);
    tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    await service.deactivate(7n, { reason: 'Fraud check' }, audit);

    expect(statusUpdate(tx)).toMatchObject({
      status: UserStatus.INACTIVE,
      statusReason: 'Fraud check',
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 7n, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    const [cancelSql, ...cancelValues] = tx.$queryRaw.mock.calls[1];
    expect(cancelSql.join('?')).toContain("SET status = 'CANCELLED'");
    expect(cancelSql.join('?')).toContain(
      "WHERE status = 'PENDING_AUTHORIZATION'",
    );
    expect(cancelValues).toEqual([expect.any(Date), 7n, 7n]);

    expect(auditRows(tx)).toEqual([
      expect.objectContaining({
        actorId: 1n,
        action: 'ACCOUNT_DEACTIVATED',
        entityType: 'USER',
        entityId: 7n,
        beforeData: { status: 'ACTIVE', statusReason: null },
        afterData: {
          status: 'INACTIVE',
          statusReason: 'Fraud check',
          revokedSessions: 2,
          cancelledCashoutRequestIds: ['5', '6'],
        },
      }),
      expect.objectContaining({
        action: 'CASHOUT_CANCELLED',
        entityType: 'CASHOUT_REQUEST',
        entityId: 5n,
        beforeData: { status: 'PENDING_AUTHORIZATION' },
        afterData: { status: 'CANCELLED', cause: 'ACCOUNT_DEACTIVATED' },
      }),
      expect.objectContaining({ action: 'CASHOUT_CANCELLED', entityId: 6n }),
    ]);
  });

  it('never touches the wallet (FR-ADM-02)', async () => {
    const { service, tx, locked, cancels } = setup();
    locked(lockRow());
    cancels([]);

    await service.deactivate(7n, { reason: 'x' }, audit);

    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(tx.wallet.create).not.toHaveBeenCalled();
    for (const [args] of tx.user.update.mock.calls) {
      expect(args.data).not.toHaveProperty('balance');
    }
  });

  it('answers 422 TARGET_ROLE_NOT_ALLOWED for an admin account', async () => {
    const { service, locked } = setup();
    locked(lockRow({ role: UserRole.ADMIN }));

    expect(
      await problemOf(service.deactivate(1n, { reason: 'x' }, audit)),
    ).toMatchObject({ status: 422, code: 'TARGET_ROLE_NOT_ALLOWED' });
  });

  it.each([UserStatus.PENDING, UserStatus.INACTIVE])(
    'answers 409 for a %s account',
    async (status) => {
      const { service, tx, locked } = setup();
      locked(lockRow({ status }));

      expect(
        await problemOf(service.deactivate(7n, { reason: 'x' }, audit)),
      ).toMatchObject({ status: 409, code: 'INVALID_STATUS_TRANSITION' });
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    },
  );
});

describe('AdminService.reactivate (FR-ADM-02)', () => {
  it('reactivates without creating a wallet and audits the old reason', async () => {
    const { service, tx, locked } = setup();
    locked(
      lockRow({
        role: UserRole.AGENT,
        status: UserStatus.INACTIVE,
        statusReason: 'Fraud check',
      }),
    );

    await service.reactivate(7n, audit);

    expect(statusUpdate(tx)).toMatchObject({
      status: UserStatus.ACTIVE,
      statusReason: null,
    });
    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(auditRows(tx)).toEqual([
      expect.objectContaining({
        actorId: 1n,
        action: 'ACCOUNT_REACTIVATED',
        entityId: 7n,
        beforeData: { status: 'INACTIVE', statusReason: 'Fraud check' },
        afterData: { status: 'ACTIVE' },
      }),
    ]);
  });

  it('answers 409 for an account that is not INACTIVE', async () => {
    const { service, locked } = setup();
    locked(lockRow());

    expect(await problemOf(service.reactivate(7n, audit))).toMatchObject({
      status: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  it('answers 422 for an admin account', async () => {
    const { service, locked } = setup();
    locked(lockRow({ role: UserRole.ADMIN, status: UserStatus.INACTIVE }));

    expect(await problemOf(service.reactivate(1n, audit))).toMatchObject({
      status: 422,
      code: 'TARGET_ROLE_NOT_ALLOWED',
    });
  });
});

describe('AdminService.updateUser (admin view/edit screen)', () => {
  it('edits name, email and mobile in one audited change', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow());

    await service.updateUser(
      7n,
      {
        fullName: 'Rahim U.',
        email: 'new@example.com',
        mobile: '01811000009',
      },
      audit,
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: {
        fullName: 'Rahim U.',
        email: 'new@example.com',
        mobile: '01811000009',
        updatedAt: expect.any(Date),
      },
    });
    expect(auditRows(tx)).toEqual([
      expect.objectContaining({
        actorId: 1n,
        action: 'ACCOUNT_UPDATED',
        entityType: 'USER',
        entityId: 7n,
        beforeData: {
          fullName: 'Rahim Uddin',
          email: 'rahim@example.com',
          mobile: '01711000001',
        },
        afterData: {
          fullName: 'Rahim U.',
          email: 'new@example.com',
          mobile: '01811000009',
        },
        ipAddress: '203.0.113.7',
        requestId: audit.requestId,
      }),
    ]);
  });

  it('records only the fields that really changed', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow());

    await service.updateUser(
      7n,
      { fullName: 'Rahim Uddin', email: 'other@example.com' },
      audit,
    );

    expect(auditRows(tx)[0]).toMatchObject({
      beforeData: { email: 'rahim@example.com' },
      afterData: { email: 'other@example.com' },
    });
  });

  it('writes and audits nothing when nothing changed', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow());

    await expect(
      service.updateUser(
        7n,
        { fullName: 'Rahim Uddin', status: UserStatus.ACTIVE },
        audit,
      ),
    ).resolves.toMatchObject({ fullName: 'Rahim Uddin', balance: '2000.00' });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('edits the profile and deactivates in one call, one audit row each', async () => {
    const { service, tx, locked, cancels } = setup();
    locked(lockRow());
    cancels([]);

    await service.updateUser(
      7n,
      {
        email: 'new@example.com',
        status: UserStatus.INACTIVE,
        reason: 'Fraud check',
      },
      audit,
    );

    expect(auditRows(tx).map((row) => row.action)).toEqual([
      'ACCOUNT_UPDATED',
      'ACCOUNT_DEACTIVATED',
    ]);
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('activates a pending user through the status field (FR-WAL-01)', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow({ status: UserStatus.PENDING }));
    tx.wallet.upsert.mockResolvedValue({ id: 40n });

    await service.updateUser(7n, { status: UserStatus.ACTIVE }, audit);

    expect(tx.wallet.upsert).toHaveBeenCalled();
    expect(auditRows(tx)[0]).toMatchObject({ action: 'ACCOUNT_ACTIVATED' });
  });

  it('rejects a pending registration for good (SRS 4.1, Q8)', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow({ status: UserStatus.PENDING }));

    await service.updateUser(
      7n,
      { status: UserStatus.REJECTED, reason: 'Duplicate account' },
      audit,
    );

    expect(statusUpdate(tx)).toMatchObject({
      status: UserStatus.REJECTED,
      statusReason: 'Duplicate account',
    });
    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(auditRows(tx)).toEqual([
      expect.objectContaining({
        action: 'ACCOUNT_REJECTED',
        beforeData: { status: 'PENDING', statusReason: null },
        afterData: { status: 'REJECTED', statusReason: 'Duplicate account' },
      }),
    ]);
  });

  it('answers 422 naming "reason" when deactivating without one', async () => {
    const { service, tx, locked } = setup();
    locked(lockRow());

    expect(
      await problemOf(
        service.updateUser(7n, { status: UserStatus.INACTIVE }, audit),
      ),
    ).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: ['reason: a reason is required to deactivate'],
    });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [UserStatus.ACTIVE, UserStatus.REJECTED],
    [UserStatus.ACTIVE, UserStatus.PENDING],
    [UserStatus.INACTIVE, UserStatus.PENDING],
    [UserStatus.REJECTED, UserStatus.ACTIVE],
    [UserStatus.PENDING, UserStatus.INACTIVE],
  ])(
    'refuses %s -> %s with 409 INVALID_STATUS_TRANSITION',
    async (from, to) => {
      const { service, tx, locked } = setup();
      locked(lockRow({ status: from }));

      expect(
        await problemOf(
          service.updateUser(
            7n,
            {
              status: to,
              ...(to === UserStatus.INACTIVE && { reason: 'x' }),
            },
            audit,
          ),
        ),
      ).toMatchObject({ status: 409, code: 'INVALID_STATUS_TRANSITION' });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it("refuses to change an admin's status (422)", async () => {
    const { service, locked } = setup();
    locked(lockRow({ role: UserRole.ADMIN }));

    expect(
      await problemOf(
        service.updateUser(
          1n,
          { status: UserStatus.INACTIVE, reason: 'x' },
          audit,
        ),
      ),
    ).toMatchObject({ status: 422, code: 'TARGET_ROLE_NOT_ALLOWED' });
  });

  it.each([
    ['role', { role: 'ADMIN' }],
    ['balance', { balance: '999999.00' }],
    ['id', { id: '1' }],
  ])(
    'answers 422 FIELD_IMMUTABLE for %s before touching the database',
    async (field, body) => {
      const { service, prisma } = setup();

      expect(
        await problemOf(
          service.updateUser(7n, { fullName: 'X', ...body }, audit),
        ),
      ).toMatchObject({
        status: 422,
        code: 'FIELD_IMMUTABLE',
        message: [`${field}: ${field} cannot be changed`],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('answers 422 when there is nothing to change', async () => {
    const { service } = setup();

    expect(await problemOf(service.updateUser(7n, {}, audit))).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
    });
  });

  it('answers 422 for a reason without a status that uses one', async () => {
    const { service } = setup();

    expect(
      await problemOf(
        service.updateUser(
          7n,
          { status: UserStatus.ACTIVE, reason: 'why' },
          audit,
        ),
      ),
    ).toMatchObject({
      status: 422,
      message: [
        'reason: a reason is only used when status is INACTIVE or REJECTED',
      ],
    });
  });

  it('answers 404 for an unknown user', async () => {
    const { service, locked } = setup();
    locked(null);

    expect(
      await problemOf(service.updateUser(99n, { fullName: 'X' }, audit)),
    ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it.each([
    [['email'], 'EMAIL_TAKEN'],
    ['users_mobile_key', 'MOBILE_TAKEN'],
  ])('maps a unique-constraint clash on %p to 409 %s', async (target, code) => {
    const { service, tx, locked } = setup();
    locked(lockRow());
    tx.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target },
      }),
    );

    expect(
      await problemOf(
        service.updateUser(7n, { email: 'taken@example.com' }, audit),
      ),
    ).toMatchObject({ status: 409, code });
  });
});

describe('AdminService.createAgent (FR-ADM-03, BR-14)', () => {
  const body = {
    fullName: 'Agent Mirpur',
    mobile: '01811000001',
    email: 'mirpur@example.com',
    password: 'Agent0Pass9x',
  };

  it('creates an ACTIVE agent that must reset the password, with a 0.00 wallet', async () => {
    const { service, tx } = setup();
    tx.user.create.mockResolvedValue(
      userRow({
        id: 30n,
        fullName: body.fullName,
        mobile: body.mobile,
        email: body.email,
        role: UserRole.AGENT,
        mustResetPw: true,
        wallet: null,
      }),
    );
    tx.wallet.create.mockResolvedValue({
      id: 31n,
      balance: new Prisma.Decimal(0),
    });

    const agent = await service.createAgent(body, audit);

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fullName: body.fullName,
          mobile: body.mobile,
          email: body.email,
          passwordHash: '$argon2id$v=19$hash',
          role: UserRole.AGENT,
          status: UserStatus.ACTIVE,
          mustResetPw: true,
        },
      }),
    );
    expect(agent).toMatchObject({
      id: '30',
      role: 'AGENT',
      status: 'ACTIVE',
      mustResetPw: true,
      wallet: { id: '31', balance: '0.00' },
    });
    expect(auditRows(tx)).toEqual([
      expect.objectContaining({
        actorId: 1n,
        action: 'AGENT_CREATED',
        entityId: 30n,
        beforeData: Prisma.DbNull,
        afterData: expect.objectContaining({
          role: 'AGENT',
          status: 'ACTIVE',
          walletId: '31',
        }),
      }),
    ]);
    const written = JSON.stringify(auditRows(tx), (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(written).not.toContain(body.password);
  });

  it.each([
    ['mobile', 'MOBILE_TAKEN'],
    ['email', 'EMAIL_TAKEN'],
  ])(
    'answers 409 when the %s is taken, before hashing',
    async (field, code) => {
      const { service, prisma, tx } = setup();
      prisma.user.findUnique.mockImplementation(
        ({ where }: { where: Record<string, string> }) =>
          Promise.resolve(field in where ? { id: 2n } : null),
      );

      expect(await problemOf(service.createAgent(body, audit))).toMatchObject({
        status: 409,
        code,
      });
      expect(tx.user.create).not.toHaveBeenCalled();
    },
  );

  it('maps a unique-constraint race to 409', async () => {
    const { service, tx } = setup();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['mobile'] },
      }),
    );

    expect(await problemOf(service.createAgent(body, audit))).toMatchObject({
      status: 409,
      code: 'MOBILE_TAKEN',
    });
  });

  it('rethrows any other database error', async () => {
    const { service, tx } = setup();
    const failure = new Error('connection lost');
    tx.user.create.mockRejectedValue(failure);

    await expect(service.createAgent(body, audit)).rejects.toBe(failure);
  });
});
