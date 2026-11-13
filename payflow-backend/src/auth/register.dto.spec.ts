import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

const valid = {
  fullName: 'Rahim',
  mobile: '01711000001',
  email: 'rahim@example.com',
  password: 'Str0ng!Pass',
  role: 'CUSTOMER',
};

async function failedFields(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(RegisterDto, input));
  return errors.map((error) => error.property);
}

// FR-AUTH-01 Scenario Outline: invalid input is rejected.
describe('RegisterDto (FR-AUTH-01, NFR-SEC-01)', () => {
  it('accepts a valid registration', async () => {
    expect(await failedFields(valid)).toEqual([]);
  });

  it('trims the name and mobile and lower-cases the email', () => {
    const dto = plainToInstance(RegisterDto, {
      ...valid,
      fullName: '  Rahim  ',
      mobile: ' 01711000001 ',
      email: ' Rahim@Example.COM ',
    });
    expect([dto.fullName, dto.mobile, dto.email]).toEqual([
      'Rahim',
      '01711000001',
      'rahim@example.com',
    ]);
  });

  it.each([
    ['mobile', '0171100'],
    ['mobile', '01211000001'],
    ['email', 'rahim@'],
    ['password', 'short1'],
    ['password', 'onlyletters'],
    ['password', '12345678'],
    ['password', 'password1'],
    ['role', 'AGENT'],
    ['role', 'ADMIN'],
  ])('rejects %s = %s', async (field, value) => {
    expect(await failedFields({ ...valid, [field]: value })).toContain(field);
  });

  it('rejects a password longer than 64 characters', async () => {
    expect(
      await failedFields({ ...valid, password: 'a1'.repeat(33) }),
    ).toContain('password');
  });
});

describe('LoginDto', () => {
  it('needs an identifier and a password', async () => {
    const errors = await validate(plainToInstance(LoginDto, {}));
    expect(errors.map((e) => e.property).sort()).toEqual([
      'identifier',
      'password',
    ]);
  });

  it('accepts a mobile or email identifier', async () => {
    const dto = plainToInstance(LoginDto, {
      identifier: '01711000001',
      password: 'x',
    });
    expect(await validate(dto)).toEqual([]);
  });
});
