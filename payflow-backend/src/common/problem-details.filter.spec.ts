import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { ProblemDetailsFilter } from './problem-details.filter';

function run(exception: unknown, requestId?: string) {
  const json = jest.fn();
  const type = jest.fn(() => ({ json }));
  const status = jest.fn(() => ({ type }));
  const setHeader = jest.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId }),
      getResponse: () => ({ status, setHeader }),
    }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter().catch(exception, host);

  return {
    status,
    type,
    setHeader,
    body: json.mock.calls[0]?.[0] as Record<string, unknown>,
  };
}

describe('ProblemDetailsFilter (SRS 5.3, RFC 9457)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the code, title and detail the service supplied', () => {
    const { status, type, body } = run(
      new HttpException(
        {
          code: 'INSUFFICIENT_BALANCE',
          title: 'Insufficient balance',
          detail: 'Too low',
        },
        422,
      ),
      'req-1',
    );

    expect(status).toHaveBeenCalledWith(422);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(body).toEqual({
      type: 'https://payflow.local/errors/insufficient-balance',
      title: 'Insufficient balance',
      status: 422,
      code: 'INSUFFICIENT_BALANCE',
      detail: 'Too low',
      requestId: 'req-1',
      errors: [],
    });
  });

  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [422, 'VALIDATION_FAILED'],
    [429, 'RATE_LIMITED'],
    [418, 'INTERNAL_SERVER_ERROR'],
  ])('falls back to a default code for %i', (httpStatus, code) => {
    expect(run(new HttpException('x', httpStatus)).body.code).toBe(code);
  });

  it('hides the cause of an unexpected error (no stack trace in the body)', () => {
    const { status, body } = run(new Error('secret db detail'));

    expect(status).toHaveBeenCalledWith(500);
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.detail).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('collects validation messages into errors[]', () => {
    const { body } = run(
      new HttpException({ message: ['mobile: bad', 5, 'email: bad'] }, 422),
    );
    expect(body.errors).toEqual([
      { message: 'mobile: bad' },
      { message: 'email: bad' },
    ]);
  });

  it('generates a request id when the middleware did not set one', () => {
    expect(run(new Error('x')).body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets Retry-After from retryAfterSeconds on 429 (FR-AUTH-06)', () => {
    const { setHeader } = run(
      new HttpException(
        { code: 'TEMPORARILY_LOCKED', retryAfterSeconds: 90.2 },
        429,
      ),
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '91');
  });

  it('defaults Retry-After to 60 seconds on a plain 429', () => {
    const { setHeader } = run(new HttpException('x', 429));
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });
});
