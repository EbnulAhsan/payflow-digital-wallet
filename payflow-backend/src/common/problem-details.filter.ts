import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

interface ProblemResponse {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId: string;
  errors: { message: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const exceptionBody =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = isRecord(exceptionBody) ? exceptionBody : {};
    const code =
      typeof body.code === 'string'
        ? body.code
        : status === 400
          ? 'VALIDATION_FAILED'
          : status === 422
            ? 'VALIDATION_FAILED'
            : status === 401
              ? 'UNAUTHENTICATED'
              : status === 403
                ? 'FORBIDDEN'
                : status === 429
                  ? 'RATE_LIMITED'
                  : status === 404
                    ? 'NOT_FOUND'
                    : 'INTERNAL_SERVER_ERROR';
    const title =
      typeof body.title === 'string'
        ? body.title
        : status === 400
          ? 'Validation failed'
          : status === 422
            ? 'Validation failed'
            : status === 401
              ? 'Unauthenticated'
              : status === 403
                ? 'Forbidden'
                : status === 429
                  ? 'Too many requests'
                  : status === 404
                    ? 'Not found'
                    : 'Internal server error';
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : status === 400
          ? 'Request validation failed'
          : status === 422
            ? 'Request validation failed'
            : status === 429
              ? 'Too many requests; try again later'
              : status >= 500
                ? 'An unexpected error occurred'
                : title;
    const rawErrors = body.message;
    const errors = Array.isArray(rawErrors)
      ? rawErrors
          .filter((message): message is string => typeof message === 'string')
          .map((message) => ({ message }))
      : [];
    const requestId = request.requestId ?? randomUUID();

    if (status >= 500) {
      this.logger.error(
        'Unhandled request failure',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (status === 429) {
      response.setHeader('Retry-After', '60');
    }

    const problem: ProblemResponse = {
      type: `https://payflow.local/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      code,
      detail,
      requestId,
      errors,
    };

    response.status(status).type('application/problem+json').json(problem);
  }
}
