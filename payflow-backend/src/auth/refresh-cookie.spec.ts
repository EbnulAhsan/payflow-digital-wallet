import type { Request } from 'express';
import { readCookie } from './refresh-cookie';

const requestWith = (cookie?: string) =>
  ({ headers: { cookie } }) as unknown as Request;

describe('readCookie', () => {
  it('returns undefined when there is no cookie header', () => {
    expect(readCookie(requestWith(), 'refresh_token')).toBeUndefined();
  });

  it('reads one cookie out of several', () => {
    const request = requestWith('a=1; refresh_token=abc; b=2');
    expect(readCookie(request, 'refresh_token')).toBe('abc');
  });

  it('keeps "=" characters inside the value', () => {
    expect(readCookie(requestWith('refresh_token=a=b'), 'refresh_token')).toBe(
      'a=b',
    );
  });

  it('ignores parts without "=" and cookies with other names', () => {
    expect(readCookie(requestWith('junk; other=1'), 'refresh_token')).toBe(
      undefined,
    );
  });
});
