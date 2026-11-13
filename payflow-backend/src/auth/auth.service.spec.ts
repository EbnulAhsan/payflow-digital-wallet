import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const SECRET = 'unit-test-secret-with-at-least-32-bytes';
const PASSWORD = 'Str0ng!Pass';
const VALID_REFRESH = 'A'.repeat(43);

type Mock = jest.Mock;

function makePrisma() {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    loginFailure: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  // The service runs its transactions through the same mock client.
  prisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
    work(prisma),
  );
  return prisma;
}

async function setup(secret: string | undefined = SECRET) {
  const prisma = makePrisma();
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
  const config = { get: jest.fn().mockReturnValue(secret) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );
  await service.onModuleInit();
  return { service, prisma, jwt };
}

const failure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  return {
    status: http.getStatus(),
    code: (http.getResponse() as { code: string }).code,
    body: http.getResponse() as Record<string, unknown>,
  };
};

const registration = {
  fullName: ' Rahim ',
  mobile: ' 01711000001 ',
  email: ' Rahim@Example.com ',
  password: PASSWORD,
  role: 'CUSTOMER' as const,
};

const createdUser = {
  id: 1n,
  fullName: 'Rahim',
  mobile: '01711000001',
  email: 'rahim@example.com',
  role: UserRole.CUSTOMER,
  status: UserStatus.PENDING,
};

describe('AuthService.register (FR-AUTH-01)', () => {
  it('creates a PENDING account with an Argon2id hash', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(createdUser);

    await expect(service.register(registration)).resolves.toEqual({
      id: '1',
      fullName: 'Rahim',
      mobile: '01711000001',
      email: 'rahim@example.com',
      role: 'CUSTOMER',
      status: 'PENDING',
    });

    const data = (
      prisma.user.create.mock.calls[0][0] as { data: Record<string, string> }
    ).data;
    expect(data.status).toBe(UserStatus.PENDING);
    expect(data.email).toBe('rahim@example.com');
    expect(data.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await argon2.verify(data.passwordHash, PASSWORD)).toBe(true);
  });

  it('answers 409 MOBILE_TAKEN for a used mobile', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValueOnce(createdUser);

    expect(await failure(service.register(registration))).toMatchObject({
      status: 409,
      code: 'MOBILE_TAKEN',
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('answers 409 EMAIL_TAKEN for a used email', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdUser);

    expect(await failure(service.register(registration))).toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });
  });

  const uniqueViolation = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target },
    });

  it.each([
    [['mobile'], 'MOBILE_TAKEN'],
    [['email'], 'EMAIL_TAKEN'],
    ['mobile', 'MOBILE_TAKEN'],
  ])('maps a race on unique %s to %s', async (target, code) => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(uniqueViolation(target));

    expect(await failure(service.register(registration))).toMatchObject({
      status: 409,
      code,
    });
  });

  it('rethrows any other database error', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(uniqueViolation(['something_else']));

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});

describe('AuthService.login (FR-AUTH-02, FR-AUTH-06)', () => {
  let passwordHash: string;
  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
  });

  const activeUser = () => ({
    ...createdUser,
    status: UserStatus.ACTIVE,
    passwordHash,
    lockedUntil: null as Date | null,
  });

  // Lets the lock-state SELECT ... FOR UPDATE return a row.
  const unlockedState = (prisma: ReturnType<typeof makePrisma>) =>
    prisma.$queryRaw.mockResolvedValue([{ lockedUntil: null }]);

  it('logs in an active user with a mobile number', async () => {
    const { service, prisma, jwt } = await setup();
    prisma.user.findUnique.mockResolvedValue(activeUser());
    unlockedState(prisma);

    const result = await service.login({
      identifier: ' 01711000001 ',
      password: PASSWORD,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { mobile: '01711000001' },
    });
    expect(result.response).toMatchObject({
      accessToken: 'signed-jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { id: '1', role: 'CUSTOMER' },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { role: 'CUSTOMER' },
      expect.objectContaining({
        algorithm: 'HS256',
        expiresIn: '15m',
        subject: '1',
      }),
    );
    // The refresh token is stored only as its SHA-256 hash (NFR-SEC-02).
    const stored = (
      prisma.refreshToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      }
    ).data;
    expect(stored.tokenHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLogins: 0, lockedUntil: null } }),
    );
  });

  it('looks an email identifier up in lower case', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(activeUser());
    unlockedState(prisma);

    await service.login({
      identifier: 'Rahim@Example.com',
      password: PASSWORD,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'rahim@example.com' },
    });
  });

  it('gives the same 401 for an unknown user and a wrong password', async () => {
    const unknown = await setup();
    unknown.prisma.user.findUnique.mockResolvedValue(null);
    const wrong = await setup();
    wrong.prisma.user.findUnique.mockResolvedValue(activeUser());
    wrong.prisma.$queryRaw.mockResolvedValue([{ lockedUntil: null }]);
    wrong.prisma.loginFailure.count.mockResolvedValue(1);

    const a = await failure(
      unknown.service.login({ identifier: '01700000000', password: 'x' }),
    );
    const b = await failure(
      wrong.service.login({ identifier: '01711000001', password: 'wrong' }),
    );

    expect(a).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(b.body).toEqual(a.body);
  });

  it('counts a failed login and locks nothing before the 5th', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(activeUser());
    unlockedState(prisma);
    prisma.loginFailure.count.mockResolvedValue(4);

    await failure(
      service.login({ identifier: '01711000001', password: 'wrong' }),
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLogins: 4, lockedUntil: null } }),
    );
  });

  it('locks the account for 15 minutes on the 5th failure', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(activeUser());
    unlockedState(prisma);
    prisma.loginFailure.count.mockResolvedValue(5);

    await failure(
      service.login({ identifier: '01711000001', password: 'wrong' }),
    );

    const data = (
      prisma.user.update.mock.calls[0][0] as {
        data: { failedLogins: number; lockedUntil: Date };
      }
    ).data;
    expect(data.failedLogins).toBe(5);
    const minutes = (data.lockedUntil.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it('answers 429 with Retry-After seconds while locked, even with the right password', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser(),
      lockedUntil: new Date(Date.now() + 120_000),
    });

    const error = await failure(
      service.login({ identifier: '01711000001', password: PASSWORD }),
    );

    expect(error).toMatchObject({ status: 429, code: 'TEMPORARILY_LOCKED' });
    expect(error.body.retryAfterSeconds).toBeGreaterThanOrEqual(119);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('answers 429 when another request locked the account meanwhile', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(activeUser());
    prisma.$queryRaw.mockResolvedValue([
      { lockedUntil: new Date(Date.now() + 60_000) },
    ]);

    expect(
      await failure(
        service.login({ identifier: '01711000001', password: 'wrong' }),
      ),
    ).toMatchObject({ status: 429, code: 'TEMPORARILY_LOCKED' });
  });

  it('refuses a pending or inactive account with 403 (after the password check)', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser(),
      status: UserStatus.PENDING,
    });

    expect(
      await failure(
        service.login({ identifier: '01711000001', password: PASSWORD }),
      ),
    ).toMatchObject({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('fails when the lock state row cannot be loaded', async () => {
    const { service, prisma } = await setup();
    prisma.user.findUnique.mockResolvedValue(activeUser());
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      service.login({ identifier: '01711000001', password: 'wrong' }),
    ).rejects.toThrow('Unable to load login state');
  });

  it('refuses to sign tokens with a short secret (NFR-SEC-02)', async () => {
    const { service, prisma } = await setup('too-short');
    prisma.user.findUnique.mockResolvedValue(activeUser());
    unlockedState(prisma);

    await expect(
      service.login({ identifier: '01711000001', password: PASSWORD }),
    ).rejects.toThrow('JWT_ACCESS_SECRET must contain at least 32 bytes');
  });
});

describe('AuthService.refresh (FR-AUTH-03, NFR-SEC-02)', () => {
  const future = () => new Date(Date.now() + 3_600_000);
  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 10n,
    userId: 1n,
    familyId: 'family-1',
    revokedAt: null,
    expiresAt: future(),
    user: { ...createdUser, status: UserStatus.ACTIVE },
    ...overrides,
  });

  it.each([undefined, '', 'short', `${'A'.repeat(42)}!`])(
    'rejects a malformed token (%s) without touching the database',
    async (token) => {
      const { service, prisma } = await setup();

      expect(await failure(service.refresh(token))).toMatchObject({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rotates the token inside the same family', async () => {
    const { service, prisma } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored());
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.refresh(VALID_REFRESH);

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256').update(VALID_REFRESH).digest('hex'),
        },
      }),
    );
    expect(result.refreshToken).not.toBe(VALID_REFRESH);
    expect(result.response.user.id).toBe('1');
    const created = (
      prisma.refreshToken.create.mock.calls[0][0] as {
        data: { familyId: string; userId: bigint };
      }
    ).data;
    expect(created).toMatchObject({ familyId: 'family-1', userId: 1n });
  });

  it('rejects an unknown token', async () => {
    const { service, prisma } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    expect(await failure(service.refresh(VALID_REFRESH))).toMatchObject({
      status: 401,
    });
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const { service, prisma } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(
      stored({ revokedAt: new Date() }),
    );

    await failure(service.refresh(VALID_REFRESH));

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', revokedAt: null },
      }),
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, prisma } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(
      stored({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await failure(service.refresh(VALID_REFRESH));

    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes every session of a deactivated user at once (FR-AUTH-03)', async () => {
    const { service, prisma } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(
      stored({ user: { ...createdUser, status: UserStatus.INACTIVE } }),
    );

    await failure(service.refresh(VALID_REFRESH));

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1n, revokedAt: null } }),
    );
  });

  it('revokes the family when two requests race on one token', async () => {
    const { service, prisma } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored());
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await failure(service.refresh(VALID_REFRESH));

    expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', revokedAt: null },
      }),
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout (FR-AUTH-03)', () => {
  it('revokes the presented refresh token', async () => {
    const { service, prisma } = await setup();

    await service.logout(VALID_REFRESH);

    const call = (prisma.refreshToken.updateMany as Mock).mock.calls[0][0] as {
      where: { tokenHash: string; revokedAt: null };
    };
    expect(call.where.tokenHash).toBe(
      createHash('sha256').update(VALID_REFRESH).digest('hex'),
    );
    expect(call.where.revokedAt).toBeNull();
  });

  it.each([undefined, 'not-a-token'])('ignores %s quietly', async (token) => {
    const { service, prisma } = await setup();

    await expect(service.logout(token)).resolves.toBeUndefined();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
