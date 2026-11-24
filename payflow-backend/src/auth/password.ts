import * as argon2 from 'argon2';

// NFR-SEC-01: Argon2id, 19 MiB memory, 2 iterations.
export const ARGON2_OPTIONS: argon2.Options & { type: number } = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}
