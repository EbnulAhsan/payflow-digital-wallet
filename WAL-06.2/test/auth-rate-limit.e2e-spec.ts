import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_ACCESS_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
process.env.NODE_ENV = 'test';

describe('login rate limit', () => {
  let app: INestApplication;
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    refreshToken: {
      create: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows ten attempts per minute per IP and rejects the eleventh', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'unknown@example.com', password: 'Str0ng!Pass' })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'unknown@example.com', password: 'Str0ng!Pass' })
      .expect(429);

    expect(response.headers['retry-after']).toBe('60');
    expect(response.body.code).toBe('RATE_LIMITED');
  });
});
