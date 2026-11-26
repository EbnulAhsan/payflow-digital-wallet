import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { assertOwnerOrAdmin, type AuthUser } from './ownership';

const customer: AuthUser = { id: '7', role: UserRole.CUSTOMER };
const admin: AuthUser = { id: '1', role: UserRole.ADMIN };

function notFoundBody(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundException);
    return (error as NotFoundException).getResponse();
  }
  throw new Error('expected NotFoundException');
}

describe('assertOwnerOrAdmin (BR-15, NFR-SEC-04)', () => {
  it('lets the owner through, whether the ID is a bigint or a string', () => {
    expect(() => assertOwnerOrAdmin(customer, 7n)).not.toThrow();
    expect(() => assertOwnerOrAdmin(customer, '7')).not.toThrow();
  });

  it('lets either party of a two-party resource through', () => {
    expect(() => assertOwnerOrAdmin(customer, [3n, 7n])).not.toThrow();
  });

  it.each([UserRole.CUSTOMER, UserRole.AGENT, UserRole.MERCHANT])(
    'answers 404 NOT_FOUND when a %s opens another user’s resource',
    (role) => {
      expect(
        notFoundBody(() => assertOwnerOrAdmin({ id: '7', role }, 8n)),
      ).toMatchObject({ code: 'NOT_FOUND' });
    },
  );

  it('answers the same 404 for a missing resource as for a foreign one', () => {
    const foreign = notFoundBody(() => assertOwnerOrAdmin(customer, 8n));
    const missing = notFoundBody(() => assertOwnerOrAdmin(customer, null));
    expect(missing).toEqual(foreign);
  });

  it('lets an admin open any existing resource', () => {
    expect(() => assertOwnerOrAdmin(admin, 8n)).not.toThrow();
    expect(() => assertOwnerOrAdmin(admin, [3n, 8n])).not.toThrow();
  });

  it.each([null, undefined, [] as const, [null, undefined]])(
    'answers 404 to an admin when the resource does not exist (%p)',
    (owners) => {
      expect(
        notFoundBody(() => assertOwnerOrAdmin(admin, owners)),
      ).toMatchObject({ code: 'NOT_FOUND' });
    },
  );

  it('does not match a user ID by prefix', () => {
    expect(() =>
      assertOwnerOrAdmin({ id: '7', role: UserRole.CUSTOMER }, 77n),
    ).toThrow(NotFoundException);
  });
});
