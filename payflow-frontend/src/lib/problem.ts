import { isAxiosError } from 'axios';

// SRS 5.3: every 4xx and 5xx body is an RFC 9457 Problem Details object.
export interface Problem {
  status?: number;
  code?: string;
  title?: string;
  detail?: string;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads the Problem Details body from a failed API call, if there is one. */
export function readProblem(error: unknown): Problem | null {
  if (!isAxiosError(error) || !error.response) {
    return null;
  }
  const body: unknown = error.response.data;
  const data = isRecord(body) ? body : {};
  const text = (key: string) =>
    typeof data[key] === 'string' ? data[key] : undefined;
  const errors = Array.isArray(data.errors)
    ? data.errors
        .map((item) =>
          isRecord(item) && typeof item.message === 'string'
            ? item.message
            : null,
        )
        .filter((message): message is string => message !== null)
    : [];

  return {
    status: error.response.status,
    code: text('code'),
    title: text('title'),
    detail: text('detail'),
    errors,
  };
}

/**
 * One sentence to show the user for any failed call: the server's `detail`,
 * followed by the field messages of a validation failure.
 */
export function problemMessage(error: unknown): string {
  if (isAxiosError(error) && !error.response) {
    return 'Cannot reach the server. Please try again.';
  }
  const problem = readProblem(error);
  if (!problem) {
    return 'Something went wrong. Please try again.';
  }
  if (problem.status === 403 && problem.code === 'FORBIDDEN_ROLE') {
    return 'Your role is not allowed to do this.';
  }
  const message =
    problem.detail ??
    problem.title ??
    'Something went wrong. Please try again.';
  return problem.errors.length > 0
    ? `${message}: ${problem.errors.join('; ')}`
    : message;
}
