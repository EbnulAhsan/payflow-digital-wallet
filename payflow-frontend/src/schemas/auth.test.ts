import { describe, expect, it } from 'vitest';
import { loginSchema } from './auth';

// SRS FR-AUTH-02: a user logs in with mobile or email and a password.
describe('loginSchema', () => {
  const valid = { identifier: '01711000001', password: 'Str0ng!Pass' };

  it('accepts an 11-digit mobile number', () => {
    expect(loginSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an email address', () => {
    const result = loginSchema.safeParse({
      ...valid,
      identifier: 'rahim@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('trims spaces around the identifier', () => {
    const result = loginSchema.safeParse({
      ...valid,
      identifier: '  01711000001  ',
    });
    expect(result.success && result.data.identifier).toBe('01711000001');
  });

  it.each(['0171100', '02711000001', '01711000001234', 'rahim@', 'rahim'])(
    'rejects the invalid identifier %s',
    (identifier) => {
      expect(loginSchema.safeParse({ ...valid, identifier }).success).toBe(
        false,
      );
    },
  );

  it('requires an identifier', () => {
    const result = loginSchema.safeParse({ ...valid, identifier: '' });
    expect(result.success).toBe(false);
  });

  it('requires a password', () => {
    const result = loginSchema.safeParse({ ...valid, password: '' });
    expect(result.success).toBe(false);
  });
});
