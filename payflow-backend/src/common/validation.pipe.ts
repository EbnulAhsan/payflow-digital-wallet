import {
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        detail: 'Request validation failed',
        message: errors.flatMap((error) =>
          Object.values(error.constraints ?? {}).map(
            (message) => `${error.property}: ${message}`,
          ),
        ),
      }),
  });
}
