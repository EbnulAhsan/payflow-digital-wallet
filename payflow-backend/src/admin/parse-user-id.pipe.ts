import { NotFoundException, PipeTransform } from '@nestjs/common';

const MAX_BIGINT = 9_223_372_036_854_775_807n;

/**
 * Turns the {id} path segment into a BIGINT user ID. An ID that cannot exist
 * (not a positive integer, or above the BIGSERIAL range) answers the same 404
 * as an ID that does not exist (NFR-SEC-04).
 */
export class ParseUserIdPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    if (/^[1-9]\d{0,18}$/.test(value)) {
      const id = BigInt(value);
      if (id <= MAX_BIGINT) {
        return id;
      }
    }
    throw new NotFoundException({
      code: 'NOT_FOUND',
      title: 'Not found',
      detail: 'User not found',
    });
  }
}
