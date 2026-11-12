import { dictionary } from '@zxcvbn-ts/language-common';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const TOP_BREACHED_PASSWORD_COUNT = 10_000;
const TOP_BREACHED_PASSWORDS = new Set(
  dictionary['passwords-common']
    .slice(0, TOP_BREACHED_PASSWORD_COUNT)
    .map((password) => password.toLowerCase()),
);

@ValidatorConstraint({ name: 'notCommonBreachedPassword', async: false })
export class NotCommonBreachedPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value !== 'string' ||
      !TOP_BREACHED_PASSWORDS.has(value.toLowerCase())
    );
  }

  defaultMessage(): string {
    return 'password must not be one of the 10,000 most common breached passwords';
  }
}
