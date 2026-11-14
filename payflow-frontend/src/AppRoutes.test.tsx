import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppRoutes from './AppRoutes';
import AuthProvider from './auth/AuthProvider';
import type { AuthResponse, Role } from './auth/types';
import { api, refreshSession } from './lib/api';

// Only the network calls are replaced; the real routes, guards, layout and
// AuthProvider run (AC: navigation is filtered by role; logout clears the
// session; protected routes redirect to login).
vi.mock('./lib/api', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
  refreshSession: vi.fn(),
}));

const refresh = vi.mocked(refreshSession);

const sessionFor = (role: Role): AuthResponse => ({
  accessToken: 'token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '1',
    fullName: 'Test User',
    mobile: '01711000001',
    email: 'test@example.com',
    role,
  },
});

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const menu = () => within(screen.getByRole('navigation', { name: 'Main' }));

describe('role-based navigation', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(api.post).mockClear();
  });

  it.each<[Role, string, string[]]>([
    [
      'CUSTOMER',
      '/dashboard',
      ['Home', 'Send', 'Pay', 'Pending cash-outs', 'History'],
    ],
    ['AGENT', '/agent', ['Float', 'Cash-in', 'Cash-out requests', 'History']],
    [
      'MERCHANT',
      '/merchant',
      ['Payments received', 'Verify reference', 'History'],
    ],
    [
      'ADMIN',
      '/admin',
      ['Dashboard', 'Users', 'Agents', 'Allocations', 'Transactions', 'Audit'],
    ],
  ])('%s sees only its own menu', async (role, home, expected) => {
    refresh.mockResolvedValue(sessionFor(role));
    renderAt(home);

    await screen.findByRole('navigation', { name: 'Main' });
    const links = menu()
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(links).toEqual(expected);
  });

  it('opens the customer pending cash-outs route', async () => {
    refresh.mockResolvedValue(sessionFor('CUSTOMER'));
    renderAt('/dashboard');

    await userEvent.click(
      await screen.findByRole('link', { name: 'Pending cash-outs' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Pending cash-outs' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });

  it.each<[Role, string, string]>([
    ['AGENT', '/agent/cash-in', 'Cash-in'],
    ['MERCHANT', '/merchant/verify', 'Verify reference'],
    ['ADMIN', '/admin/allocations', 'Allocations'],
  ])('%s opens a real screen, not a placeholder', async (role, path, title) => {
    refresh.mockResolvedValue(sessionFor(role));
    renderAt(path);

    expect(
      await screen.findByRole('heading', { name: title }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('shows the agent float as ৳ with two decimals', async () => {
    refresh.mockResolvedValue(sessionFor('AGENT'));
    renderAt('/agent');

    expect(await screen.findByText('৳ 0.00')).toBeInTheDocument();
  });

  it.each<[Role, string]>([
    ['CUSTOMER', '/admin/users'],
    ['CUSTOMER', '/agent/cash-in'],
    ['AGENT', '/cash-outs'],
    ['MERCHANT', '/send'],
    ['ADMIN', '/history'],
  ])('%s is sent to the no-access page for %s', async (role, path) => {
    refresh.mockResolvedValue(sessionFor(role));
    renderAt(path);

    expect(
      await screen.findByRole('heading', { name: 'No access' }),
    ).toBeInTheDocument();
  });

  it('redirects to login when there is no session', async () => {
    refresh.mockRejectedValue(new Error('401'));
    renderAt('/admin/users');

    expect(
      await screen.findByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('clears the session on sign out and protects the routes again', async () => {
    refresh.mockResolvedValue(sessionFor('CUSTOMER'));
    renderAt('/dashboard');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign Out' }),
    );

    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(
      await screen.findByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });
});
