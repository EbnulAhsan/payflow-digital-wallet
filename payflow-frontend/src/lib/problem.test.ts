import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { problemMessage, readProblem } from './problem';

function failed(status: number, data: unknown) {
  const headers = new AxiosHeaders();
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data,
  });
}

describe('RFC 9457 Problem Details (SRS 5.3)', () => {
  it('reads code, detail and field errors', () => {
    const error = failed(422, {
      status: 422,
      code: 'VALIDATION_FAILED',
      title: 'Validation failed',
      detail: 'Request validation failed',
      errors: [{ message: 'reason: reason must be a string' }],
    });

    expect(readProblem(error)).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: 'Validation failed',
      detail: 'Request validation failed',
      errors: ['reason: reason must be a string'],
    });
    expect(problemMessage(error)).toBe(
      'Request validation failed: reason: reason must be a string',
    );
  });

  it('explains FORBIDDEN_ROLE in plain words', () => {
    expect(
      problemMessage(failed(403, { code: 'FORBIDDEN_ROLE', errors: [] })),
    ).toBe('Your role is not allowed to do this.');
  });

  it('copes with a body that is not Problem Details', () => {
    expect(problemMessage(failed(502, '<html>Bad gateway</html>'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('says when the server cannot be reached', () => {
    expect(problemMessage(new AxiosError('Network Error'))).toBe(
      'Cannot reach the server. Please try again.',
    );
  });
});
