import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshSession } from '../lib/api';
import AuthProvider from './AuthProvider';
import RequireAuth from './RequireAuth';
import { notifySessionExpired } from './session';
import type { AuthResponse } from './types';

// Only the network calls are replaced; the real AuthProvider, RequireAuth
// and session module run, so this checks the whole redirect behaviour.
vi.mock('../lib/api', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
  refreshSession: vi.fn(),
}));

const refresh = vi.mocked(refreshSession);

const session: AuthResponse = {
  accessToken: 'token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '1',
    fullName: 'Rahim Uddin',
    mobile: '01711000001',
    email: 'rahim@example.com',
    role: 'CUSTOMER',
  },
};

function renderApp() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<p>Dashboard page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('protected routes and session expiry', () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it('shows a loading state while the session is being restored', () => {
    refresh.mockReturnValue(new Promise(() => {}));
    renderApp();

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('opens the protected page when the refresh cookie restores the session', async () => {
    refresh.mockResolvedValue(session);
    renderApp();

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
  });

  it('redirects to /login when there is no valid session', async () => {
    refresh.mockRejectedValue(new Error('401'));
    renderApp();

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });

  it('redirects to /login when a later refresh fails (session expired)', async () => {
    refresh.mockResolvedValue(session);
    renderApp();
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();

    // The API client calls this when a 401 could not be refreshed.
    act(() => notifySessionExpired());

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });
});
