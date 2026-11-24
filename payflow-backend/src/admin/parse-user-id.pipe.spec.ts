import { NotFoundException } from '@nestjs/common';
import { ParseUserIdPipe } from './parse-user-id.pipe';

describe('ParseUserIdPipe (NFR-SEC-04)', () => {
  const pipe = new ParseUserIdPipe();

  it.each([
    ['1', 1n],
    ['42', 42n],
    ['9223372036854775807', 9_223_372_036_854_775_807n],
  ])('turns %s into a BIGINT', (value, expected) => {
    expect(pipe.transform(value)).toBe(expected);
  });

  it.each([
    '0',
    '-1',
    '01',
    '1.5',
    'abc',
    '1e3',
    ' 1',
    '',
    '9223372036854775808',
    '99999999999999999999',
  ])('answers 404 NOT_FOUND for %p, like a missing user', (value) => {
    expect(() => pipe.transform(value)).toThrow(NotFoundException);
  });
});
