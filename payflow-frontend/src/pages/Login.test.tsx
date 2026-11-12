import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { api } from '../lib/api';
import Login from './Login';

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }));

const post = vi.mocked(api.post);

const startSession = vi.fn();

function renderLogin() {
  const auth: AuthContextValue = {
    user: null,
    status: 'unauthenticated',
    startSession,
    logout: vi.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function serverError(status: number, data: unknown = {}) {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

async function fillAndSubmit(identifier: string, password: string) {
  const user = userEvent.setup();
  if (identifier) {
    await user.type(screen.getByLabelText(/mobile or email/i), identifier);
  }
  if (password) {
    await user.type(screen.getByLabelText(/password/i), password);
  }
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('Login form (FR-AUTH-02)', () => {
  beforeEach(() => {
    post.mockReset();
    startSession.mockReset();
  });

  it('shows required-field errors and does not call the API', async () => {
    renderLogin();
    await fillAndSubmit('', '');

    expect(await screen.findByTestId('identifier-error')).toHaveTextContent(
      'Mobile or email is required',
    );
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Password is required',
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects an invalid mobile number before calling the API', async () => {
    renderLogin();
    await fillAndSubmit('0171100', 'Str0ng!Pass');

    expect(await screen.findByTestId('identifier-error')).toHaveTextContent(
      /valid 11-digit mobile number or email/i,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the credentials to /auth/login and starts the session', async () => {
    const response = { accessToken: 'token', user: { role: 'CUSTOMER' } };
    post.mockResolvedValue({ data: response });
    renderLogin();
    await fillAndSubmit('01711000001', 'Str0ng!Pass');

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login', {
        identifier: '01711000001',
        password: 'Str0ng!Pass',
      }),
    );
    // TanStack Query passes extra arguments, so only the first one is checked.
    await waitFor(() => expect(startSession).toHaveBeenCalled());
    expect(startSession.mock.calls[0][0]).toEqual(response);
  });

  it.each([
    [
      '401 shows the same message for every wrong login',
      serverError(401, { code: 'INVALID_CREDENTIALS' }),
      'Invalid credentials',
    ],
    [
      '403 ACCOUNT_NOT_ACTIVE explains the account is not active',
      serverError(403, { code: 'ACCOUNT_NOT_ACTIVE' }),
      'Your account is not active yet. Please contact an administrator.',
    ],
    [
      '429 asks the user to try later',
      serverError(429, { code: 'TEMPORARILY_LOCKED' }),
      'Too many failed attempts. Please try again later.',
    ],
    [
      'a network error says the server is unreachable',
      new AxiosError('Network Error'),
      'Cannot reach the server. Please try again.',
    ],
  ])('%s', async (_name, error, message) => {
    post.mockRejectedValue(error);
    renderLogin();
    await fillAndSubmit('01711000001', 'Wrong!Pass1');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(message);
  });

  it('clears the old server error when the form is submitted again', async () => {
    post.mockRejectedValueOnce(serverError(401));
    renderLogin();
    await fillAndSubmit('01711000001', 'Wrong!Pass1');
    expect(await screen.findByTestId('login-error')).toBeInTheDocument();

    post.mockResolvedValueOnce({ data: {} });
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.queryByTestId('login-error')).not.toBeInTheDocument(),
    );
  });
});
