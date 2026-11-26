import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';

describe('AdminController', () => {
  const service = {
    listUsers: jest.fn().mockResolvedValue('page'),
    activate: jest.fn().mockResolvedValue('activated'),
    deactivate: jest.fn().mockResolvedValue('deactivated'),
    reactivate: jest.fn().mockResolvedValue('reactivated'),
    createAgent: jest.fn().mockResolvedValue('agent'),
    getUser: jest.fn().mockResolvedValue('user'),
    updateUser: jest.fn().mockResolvedValue('updated'),
  };
  const controller = new AdminController(service as unknown as AdminService);
  const request = {
    authUser: { id: '1', role: UserRole.ADMIN },
    ip: '203.0.113.7',
    requestId: '0b6c9f0e-6d1e-4c51-8a7d-2f3b9a1c4e55',
  } as never;
  const context = {
    actorId: 1n,
    ipAddress: '203.0.113.7',
    requestId: '0b6c9f0e-6d1e-4c51-8a7d-2f3b9a1c4e55',
  };

  it('is admin-only as a whole (SRS 1.3)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('passes the list query through', async () => {
    const query = { page: 1, size: 20 };
    await expect(controller.listUsers(query)).resolves.toBe('page');
    expect(service.listUsers).toHaveBeenCalledWith(query);
  });

  it('reads one user', async () => {
    await expect(controller.getUser(7n)).resolves.toBe('user');
    expect(service.getUser).toHaveBeenCalledWith(7n);
  });

  it('records the acting admin, IP and request ID for every change (BR-16)', async () => {
    await controller.activate(7n, request);
    await controller.deactivate(7n, { reason: 'Fraud check' }, request);
    await controller.reactivate(7n, request);
    const body = {
      fullName: 'A',
      mobile: '01811000001',
      email: 'a@example.com',
      password: 'Agent0Pass9x',
    };
    await controller.createAgent(body, request);
    await controller.updateUser(7n, { fullName: 'B' }, request);

    expect(service.activate).toHaveBeenCalledWith(7n, context);
    expect(service.deactivate).toHaveBeenCalledWith(
      7n,
      { reason: 'Fraud check' },
      context,
    );
    expect(service.reactivate).toHaveBeenCalledWith(7n, context);
    expect(service.createAgent).toHaveBeenCalledWith(body, context);
    expect(service.updateUser).toHaveBeenCalledWith(
      7n,
      { fullName: 'B' },
      context,
    );
  });

  it('still produces a request ID when the middleware did not run', async () => {
    await controller.activate(7n, { authUser: undefined } as never);

    expect(service.activate).toHaveBeenLastCalledWith(7n, {
      actorId: null,
      ipAddress: null,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
});
