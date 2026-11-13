import { describe, expect, it } from 'vitest';
import { formatBdt } from './money';

describe('formatBdt', () => {
  it.each([
    ['0', '৳ 0.00'],
    ['2000.00', '৳ 2,000.00'],
    ['100000', '৳ 100,000.00'],
    ['25000.5', '৳ 25,000.50'],
    ['999.99', '৳ 999.99'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatBdt(input)).toBe(expected);
  });
});
