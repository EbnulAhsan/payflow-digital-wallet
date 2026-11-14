import { UnprocessableEntityException } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { createValidationPipe } from './validation.pipe';

class Body {
  @IsString()
  @MinLength(3)
  name!: string;
}

const metadata = { type: 'body' as const, metatype: Body };

describe('createValidationPipe (RFC 9457, FR-AUTH-01)', () => {
  const pipe = createValidationPipe();

  it('passes valid input through as a class instance', async () => {
    const value = await pipe.transform({ name: 'Rahim' }, metadata);
    expect(value).toBeInstanceOf(Body);
    expect(value).toEqual({ name: 'Rahim' });
  });

  it('answers 422 VALIDATION_FAILED and names the field', async () => {
    const error = await pipe
      .transform({ name: 'ab' }, metadata)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const body = (error as UnprocessableEntityException).getResponse() as {
      code: string;
      message: string[];
    };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.message[0]).toContain('name:');
  });

  it('rejects fields that are not in the DTO (role escalation guard)', async () => {
    await expect(
      pipe.transform({ name: 'Rahim', role: 'ADMIN' }, metadata),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
