import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

type FakeRequest = {
  headers: { authorization?: string };
  authUser?: { id: string; role: UserRole };
};

function setup(options: {
  isPublic?: boolean;
  claims?: unknown;
  verifyFails?: boolean;
  user?: { id: bigint; role: UserRole; status: UserStatus } | null;
}) {
  const verifyAsync = jest.fn(() =>
    options.verifyFails
      ? Promise.reject(new Error('bad token'))
      : Promise.resolve(options.claims),
  );
  const findUnique = jest.fn().mockResolvedValue(options.user ?? null);
  const guard = new JwtAuthGuard(
    { getAllAndOverride: () => options.isPublic } as unknown as Reflector,
    { verifyAsync } as unknown as JwtService,
    { user: { findUnique } } as unknown as PrismaService,
  );
  const run = (authorization?: string) => {
    const request: FakeRequest = { headers: { authorization } };
    const context = {
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  };
  return { run, verifyAsync, findUnique };
}

const activeCustomer = {
  id: 7n,
  role: UserRole.CUSTOMER,
  status: UserStatus.ACTIVE,
};

describe('JwtAuthGuard (NFR-SEC-02)', () => {
  it('skips public routes', async () => {
    const { run, verifyAsync } = setup({ isPublic: true });
    await expect(run().result).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'Bearer', 'Basic abc', 'Bearer a b'])(
    'rejects a missing or malformed Authorization header (%s)',
    async (header) => {
      const { run } = setup({});
      await expect(run(header).result).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects a token that fails verification', async () => {
    const { run } = setup({ verifyFails: true });
    await expect(run('Bearer token').result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([undefined, 5, '0', 'abc', '-1'])(
    'rejects a token whose subject is %s',
    async (sub) => {
      const { run } = setup({ claims: { sub } });
      await expect(run('Bearer token').result).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects a token for a user that no longer exists', async () => {
    const { run } = setup({ claims: { sub: '7' }, user: null });
    await expect(run('Bearer token').result).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('rejects a deactivated user (FR-AUTH-03)', async () => {
    const { run } = setup({
      claims: { sub: '7' },
      user: { ...activeCustomer, status: UserStatus.INACTIVE },
    });
    await expect(run('Bearer token').result).rejects.toMatchObject({
      response: { code: 'ACCOUNT_NOT_ACTIVE' },
    });
  });

  it('attaches the active user to the request', async () => {
    const { run, findUnique } = setup({
      claims: { sub: '7' },
      user: activeCustomer,
    });
    const { request, result } = run('Bearer token');

    await expect(result).resolves.toBe(true);
    expect(request.authUser).toEqual({ id: '7', role: UserRole.CUSTOMER });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7n } }),
    );
  });
});
