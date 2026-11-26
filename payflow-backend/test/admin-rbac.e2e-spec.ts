import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { createValidationPipe } from '../src/common/validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

interface Route {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
}

const VERBS: Partial<Record<RequestMethod, Route['method']>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

const joinPath = (...parts: (string | undefined)[]) =>
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .filter(Boolean)
    .join('/');

/**
 * NFR-SEC-03 asks for a generated matrix: every route the app registers under
 * /admin is read from the Nest metadata, so an admin endpoint added later is
 * covered without editing this file. Path parameters become "1".
 */
function adminRoutes(app: INestApplication): Route[] {
  const routes: Route[] = [];
  for (const moduleRef of app.get(ModulesContainer).values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const controller = wrapper.metatype as (new () => unknown) | null;
      if (!controller) continue;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as
        string | undefined;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          string | undefined;
        const verb =
          VERBS[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        if (path === undefined || !verb) continue;
        const full = joinPath(base, path);
        if (full === 'admin' || full.startsWith('admin/')) {
          routes.push({
            method: verb,
            path: `/api/v1/${full.replace(/:[^/]+/g, '1')}`,
          });
        }
      }
    }
  }
  return routes;
}

describe('Admin RBAC matrix (SRS 1.3, NFR-SEC-03)', () => {
  let app: INestApplication;
  let routes: Route[];
  const prisma = {
    user: { findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const tokenFor = (role: UserRole) =>
    app.get(JwtService).signAsync({ role }, { subject: '42' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    routes = adminRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finds every WAL-08 admin endpoint', () => {
    expect(routes).toEqual(
      expect.arrayContaining([
        { method: 'get', path: '/api/v1/admin/users' },
        { method: 'post', path: '/api/v1/admin/users/1/activate' },
        { method: 'post', path: '/api/v1/admin/users/1/deactivate' },
        { method: 'post', path: '/api/v1/admin/users/1/reactivate' },
        { method: 'post', path: '/api/v1/admin/agents' },
        { method: 'get', path: '/api/v1/admin/users/1' },
        { method: 'patch', path: '/api/v1/admin/users/1' },
      ]),
    );
  });

  // FR-ADM-02, BR-11: accounts and their history are never deleted.
  // SRS 1.3: a role is never reassigned. FR-ADM-03, BR-14: admins create
  // agents only.
  it('has no delete, role-change or create-user endpoint', async () => {
    expect(
      routes.filter(
        (route) =>
          route.method === 'delete' ||
          route.method === 'put' ||
          /\/role\b/.test(route.path) ||
          (route.method === 'post' && route.path === '/api/v1/admin/users'),
      ),
    ).toEqual([]);

    prisma.user.findUnique.mockResolvedValue({
      id: 42n,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    const token = await tokenFor(UserRole.ADMIN);
    for (const [method, path] of [
      ['delete', '/api/v1/admin/users/1'],
      ['put', '/api/v1/admin/users/1'],
      ['patch', '/api/v1/admin/users/1/role'],
      ['post', '/api/v1/admin/users'],
    ] as const) {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: UserRole.ADMIN });
      expect({ method, path, status: response.status }).toEqual({
        method,
        path,
        status: 404,
      });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe.each([UserRole.CUSTOMER, UserRole.AGENT, UserRole.MERCHANT])(
    'as an ACTIVE %s',
    (role) => {
      it('answers 403 FORBIDDEN_ROLE on every admin endpoint and changes nothing', async () => {
        prisma.user.findUnique.mockResolvedValue({
          id: 42n,
          role,
          status: UserStatus.ACTIVE,
        });
        const token = await tokenFor(role);

        for (const route of routes) {
          // A valid-looking body, so a 403 cannot come from validation.
          const response = await request(app.getHttpServer())
            [route.method](route.path)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'test' });

          expect({ route, status: response.status }).toEqual({
            route,
            status: 403,
          });
          expect(response.headers['content-type']).toContain(
            'application/problem+json',
          );
          expect(response.body).toMatchObject({
            type: 'https://payflow.local/errors/forbidden-role',
            status: 403,
            code: 'FORBIDDEN_ROLE',
          });
        }

        // The role guard stopped every call before the admin service ran.
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.user.count).not.toHaveBeenCalled();
        expect(prisma.user.findMany).not.toHaveBeenCalled();
      });
    },
  );

  it('answers 401 UNAUTHENTICATED on every admin endpoint without a token', async () => {
    for (const route of routes) {
      const response = await request(app.getHttpServer())[route.method](
        route.path,
      );

      expect({ route, status: response.status }).toEqual({
        route,
        status: 401,
      });
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lets an ADMIN through the role guard', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 42n,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    prisma.$transaction.mockResolvedValue([0, []]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${await tokenFor(UserRole.ADMIN)}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      page: 1,
      size: 20,
      total: 0,
      totalPages: 0,
    });
  });
});
