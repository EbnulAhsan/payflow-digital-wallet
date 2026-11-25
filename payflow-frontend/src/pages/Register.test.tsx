import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import Register from './Register';

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }));

const post = vi.mocked(api.post);

interface FormInput {
  fullName: string;
  mobile: string;
  email: string;
  password: string;
}

const valid: FormInput = {
  fullName: 'Rahim Uddin',
  mobile: '01711000001',
  email: 'rahim@example.com',
  password: 'Str0ng!Pass',
};

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function serverError(status: number, data: unknown = {}) {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

function registered(role: 'CUSTOMER' | 'MERCHANT') {
  return {
    data: {
      id: '1',
      fullName: valid.fullName,
      mobile: valid.mobile,
      email: valid.email,
      role,
      status: 'PENDING',
    },
  };
}

async function fillAndSubmit(values: Partial<FormInput>) {
  const user = userEvent.setup();
  if (values.fullName) {
    await user.type(screen.getByLabelText(/full name/i), values.fullName);
  }
  if (values.mobile) {
    await user.type(screen.getByLabelText(/mobile/i), values.mobile);
  }
  if (values.email) {
    await user.type(screen.getByLabelText(/email/i), values.email);
  }
  if (values.password) {
    await user.type(screen.getByLabelText(/password/i), values.password);
  }
  await user.click(
    screen.getByRole('button', { name: /submit for activation/i }),
  );
}

const invalidCases: [string, Partial<FormInput>, string, RegExp][] = [
  ['mobile', { mobile: '0171100' }, 'mobile-error', /valid 11-digit mobile/i],
  ['email', { email: 'rahim@' }, 'email-error', /valid email address/i],
  ['password', { password: 'short1' }, 'password-error', /at least 8/i],
];

const conflictCases: [string, string, string, string][] = [
  [
    '409 MOBILE_TAKEN shows the error next to the mobile field',
    'MOBILE_TAKEN',
    'mobile-error',
    'This mobile number is already registered',
  ],
  [
    '409 EMAIL_TAKEN shows the error next to the email field',
    'EMAIL_TAKEN',
    'email-error',
    'This email address is already registered',
  ],
];

const bannerCases: [string, AxiosError, string][] = [
  [
    '422 asks the user to check the details',
    serverError(422, { code: 'VALIDATION_FAILED' }),
    'Please check the details and try again.',
  ],
  [
    '429 asks the user to try later',
    serverError(429),
    'Too many attempts. Please try again later.',
  ],
  [
    'a network error says the server is unreachable',
    new AxiosError('Network Error'),
    'Cannot reach the server. Please try again.',
  ],
];

describe('Register form (FR-AUTH-01)', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('shows required-field errors and does not call the API', async () => {
    renderRegister();
    await fillAndSubmit({});

    expect(await screen.findByTestId('fullName-error')).toHaveTextContent(
      'Full name is required',
    );
    expect(screen.getByTestId('mobile-error')).toHaveTextContent(
      /valid 11-digit mobile/i,
    );
    expect(screen.getByTestId('email-error')).toHaveTextContent(
      /valid email address/i,
    );
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      /at least 8/i,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it.each(invalidCases)(
    'rejects an invalid %s before calling the API',
    async (_field, override, testId, message) => {
      renderRegister();
      await fillAndSubmit({ ...valid, ...override });

      expect(await screen.findByTestId(testId)).toHaveTextContent(message);
      expect(post).not.toHaveBeenCalled();
    },
  );

  it('sends the registration to /auth/register and says the account is pending', async () => {
    post.mockResolvedValue(registered('CUSTOMER'));
    renderRegister();
    await fillAndSubmit(valid);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/register', {
        role: 'CUSTOMER',
        ...valid,
      }),
    );
    expect(await screen.findByTestId('register-success')).toHaveTextContent(
      /administrator must activate your account/i,
    );
  });

  it('registers a merchant when the Merchant role is chosen', async () => {
    post.mockResolvedValue(registered('MERCHANT'));
    renderRegister();
    await userEvent.click(screen.getByRole('button', { name: 'Merchant' }));
    await fillAndSubmit(valid);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/register', {
        role: 'MERCHANT',
        ...valid,
      }),
    );
  });

  it.each(conflictCases)('%s', async (_name, code, testId, message) => {
    post.mockRejectedValue(serverError(409, { code }));
    renderRegister();
    await fillAndSubmit(valid);

    expect(await screen.findByTestId(testId)).toHaveTextContent(message);
    expect(screen.queryByTestId('register-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-success')).not.toBeInTheDocument();
  });

  it.each(bannerCases)('%s', async (_name, error, message) => {
    post.mockRejectedValue(error);
    renderRegister();
    await fillAndSubmit(valid);

    expect(await screen.findByTestId('register-error')).toHaveTextContent(
      message,
    );
  });
});
