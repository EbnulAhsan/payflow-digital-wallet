import type { Response } from 'express';
import { RequestIdMiddleware, RequestWithId } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('stamps the request and the X-Request-Id header with one UUID', () => {
    const request = {} as RequestWithId;
    const setHeader = jest.fn();
    const next = jest.fn();

    new RequestIdMiddleware().use(
      request,
      { setHeader } as unknown as Response,
      next,
    );

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', request.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('gives every request its own id', () => {
    const middleware = new RequestIdMiddleware();
    const a = {} as RequestWithId;
    const b = {} as RequestWithId;
    const response = { setHeader: jest.fn() } as unknown as Response;

    middleware.use(a, response, jest.fn());
    middleware.use(b, response, jest.fn());

    expect(a.requestId).not.toBe(b.requestId);
  });
});
