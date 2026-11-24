import { Prisma } from '@prisma/client';
import { normalizeIp, writeAudit } from './audit';

describe('writeAudit (BR-16)', () => {
  it('inserts one row with actor, action, entity, before, after, IP and request ID', async () => {
    const create = jest.fn().mockResolvedValue({});
    const transaction = {
      auditLog: { create },
    } as unknown as Prisma.TransactionClient;

    await writeAudit(
      transaction,
      {
        actorId: 1n,
        ipAddress: '::ffff:203.0.113.7',
        requestId: '0b6c9f0e-6d1e-4c51-8a7d-2f3b9a1c4e55',
      },
      {
        action: 'ACCOUNT_ACTIVATED',
        entityType: 'USER',
        entityId: 7n,
        before: { status: 'PENDING' },
        after: { status: 'ACTIVE' },
      },
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 1n,
        action: 'ACCOUNT_ACTIVATED',
        entityType: 'USER',
        entityId: 7n,
        beforeData: { status: 'PENDING' },
        afterData: { status: 'ACTIVE' },
        ipAddress: '203.0.113.7',
        requestId: '0b6c9f0e-6d1e-4c51-8a7d-2f3b9a1c4e55',
      },
    });
  });

  it('stores SQL NULL, not JSON null, when there is no before or after', async () => {
    const create = jest.fn().mockResolvedValue({});
    const transaction = {
      auditLog: { create },
    } as unknown as Prisma.TransactionClient;

    await writeAudit(
      transaction,
      { actorId: null, ipAddress: null, requestId: 'r' },
      { action: 'AGENT_CREATED', entityType: 'USER', entityId: 3n },
    );

    expect(create.mock.calls[0][0].data).toMatchObject({
      actorId: null,
      beforeData: Prisma.DbNull,
      afterData: Prisma.DbNull,
      ipAddress: null,
    });
  });
});

describe('normalizeIp (audit_logs.ip_address is INET)', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::1', '::1'],
    ['2001:db8::1', '2001:db8::1'],
  ])('keeps a valid address: %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([undefined, null, '', 'unknown', '1.2.3'])(
    'stores nothing for %p instead of failing the change',
    (input) => {
      expect(normalizeIp(input)).toBeNull();
    },
  );
});
