import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSummary } from '../admin/usersApi';
import { api } from '../lib/api';
import AdminUserDetail from './AdminUserDetail';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));

const get = vi.mocked(api.get);
const patch = vi.mocked(api.patch);

const user = (overrides: Partial<UserSummary> = {}): UserSummary => ({
  id: '12',
  fullName: 'Karim Hossain',
  mobile: '01711000002',
  email: 'karim@example.com',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  statusReason: null,
  mustResetPw: false,
  balance: '3000.00',
  createdAt: '2026-11-10T08:15:02.114Z',
  updatedAt: '2026-11-11T09:00:00.000Z',
  ...overrides,
});

function problem(status: number, code: string, detail: string) {
  const headers = new AxiosHeaders();
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { status, code, title: detail, detail, errors: [] },
  });
}

function renderAt(loaded: UserSummary) {
  get.mockResolvedValue({ data: loaded });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/users/${loaded.id}`]}>
        <Routes>
          <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          <Route path="/admin/users" element={<p>User list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const form = async (name = 'Karim Hossain') =>
  within(await screen.findByRole('form', { name: `Edit ${name}` }));

describe('Admin user view / edit', () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
  });

  it('shows the header, the editable fields and the locked ones', async () => {
    renderAt(user());
    const page = await form();

    expect(get).toHaveBeenCalledWith('/admin/users/12', expect.anything());
    expect(
      page.getByRole('heading', { level: 1, name: 'Karim Hossain' }),
    ).toBeInTheDocument();
    expect(page.getByText('User ID 12')).toBeInTheDocument();
    expect(page.getByText('K')).toBeInTheDocument();
    expect(page.getByLabelText('Full name')).toHaveValue('Karim Hossain');
    expect(page.getByLabelText('Email address')).toHaveValue(
      'karim@example.com',
    );
    expect(page.getByLabelText('Phone number (mobile)')).toHaveValue(
      '01711000002',
    );
    expect(page.getByText('৳ 3,000.00')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Back to User List/ }),
    ).toHaveAttribute('href', '/admin/users');

    // SRS 1.3 and FR-ADM-08: role and balance are text, never inputs.
    expect(page.queryByLabelText(/role/i)).not.toBeInTheDocument();
    expect(page.queryByLabelText(/balance/i)).not.toBeInTheDocument();
    // No KYC fields (SRS 2.4) and no delete (FR-ADM-02, BR-11).
    expect(page.queryByLabelText(/NID/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it.each<UserSummary['status']>(['PENDING', 'ACTIVE', 'INACTIVE'])(
    'always lists Pending, Active and Suspended, with %s selected',
    async (status) => {
      renderAt(user({ status }));
      const select = (await form()).getByLabelText('Status');

      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => [option.textContent, option.getAttribute('value')]),
      ).toEqual([
        ['Pending', 'PENDING'],
        ['Active', 'ACTIVE'],
        // "Suspended" is the SRS status INACTIVE.
        ['Suspended', 'INACTIVE'],
      ]);
      expect(select).toHaveValue(status);
      expect(select).toBeEnabled();
    },
  );

  it('shows a rejected registration as a disabled extra option', async () => {
    renderAt(user({ status: 'REJECTED', balance: null }));
    const select = (await form()).getByLabelText('Status');

    const options = within(select).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Pending',
      'Active',
      'Suspended',
      'Rejected',
    ]);
    expect(options[3]).toBeDisabled();
    expect(select).toHaveValue('REJECTED');
  });

  it("lists the three choices for an admin but never changes an admin's status", async () => {
    renderAt(user({ role: 'ADMIN', balance: null, fullName: 'Ada Admin' }));
    const select = (await form('Ada Admin')).getByLabelText('Status');

    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(select).toBeDisabled();
  });

  it('shows no helper subtitles under Role and Current balance', async () => {
    renderAt(user());
    await form();

    expect(screen.queryByText(/Roles are fixed/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Balances change only through transactions/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Current balance (BDT)')).toBeInTheDocument();
  });

  it('sends a move the SRS forbids and explains the 409 in plain words', async () => {
    patch.mockRejectedValue(
      problem(
        409,
        'INVALID_STATUS_TRANSITION',
        'A ACTIVE account can move to INACTIVE, not PENDING',
      ),
    );
    renderAt(user());
    const page = await form();

    await userEvent.selectOptions(page.getByLabelText('Status'), 'PENDING');
    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(patch).toHaveBeenCalledWith('/admin/users/12', {
      status: 'PENDING',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account is Active and cannot be changed to Pending.',
    );
  });

  it('sends only the changed fields and reports success', async () => {
    patch.mockResolvedValue({
      data: user({
        fullName: 'Karim H.',
        mobile: '01811000009',
        updatedAt: '2026-11-12T00:00:00.000Z',
      }),
    });
    renderAt(user());
    const page = await form();

    await userEvent.clear(page.getByLabelText('Full name'));
    await userEvent.type(page.getByLabelText('Full name'), 'Karim H.');
    await userEvent.clear(page.getByLabelText('Phone number (mobile)'));
    await userEvent.type(
      page.getByLabelText('Phone number (mobile)'),
      '01811000009',
    );
    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(patch).toHaveBeenCalledWith('/admin/users/12', {
      fullName: 'Karim H.',
      mobile: '01811000009',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      "Saved Karim H.'s details.",
    );
  });

  it('checks the mobile format before sending', async () => {
    renderAt(user());
    const page = await form();

    await userEvent.clear(page.getByLabelText('Phone number (mobile)'));
    await userEvent.type(
      page.getByLabelText('Phone number (mobile)'),
      '0171100',
    );
    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(
      await page.findByText('Enter an 11-digit mobile number like 01711000001'),
    ).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('asks for a reason when Suspended is chosen, then suspends', async () => {
    patch.mockResolvedValue({
      data: user({
        status: 'INACTIVE',
        statusReason: 'Fraud check',
        updatedAt: '2026-11-12T00:00:00.000Z',
      }),
    });
    renderAt(user());
    const page = await form();

    expect(page.queryByLabelText(/Reason/)).not.toBeInTheDocument();
    await userEvent.selectOptions(page.getByLabelText('Status'), 'INACTIVE');
    expect(page.getByText(/signs the user out at once/)).toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));
    expect(
      await page.findByText('A reason is required to suspend'),
    ).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();

    await userEvent.type(
      page.getByLabelText('Reason (required)'),
      'Fraud check',
    );
    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(patch).toHaveBeenCalledWith('/admin/users/12', {
      status: 'INACTIVE',
      reason: 'Fraud check',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Karim Hossain is now suspended.',
    );
  });

  it('says so when nothing changed, without calling the API', async () => {
    renderAt(user());
    const page = await form();

    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nothing to save',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('Cancel puts back the saved values', async () => {
    renderAt(user());
    const page = await form();

    await userEvent.clear(page.getByLabelText('Full name'));
    await userEvent.type(page.getByLabelText('Full name'), 'Changed');
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    expect(page.getByLabelText('Full name')).toHaveValue('Karim Hossain');
  });

  it.each([
    [
      'MOBILE_TAKEN',
      'Phone number (mobile)',
      'This mobile number is already in use',
    ],
    ['EMAIL_TAKEN', 'Email address', 'This email address is already in use'],
  ])('shows 409 %s next to the field', async (code, label, message) => {
    patch.mockRejectedValue(problem(409, code, 'Already in use'));
    renderAt(user());
    const page = await form();

    await userEvent.clear(page.getByLabelText('Email address'));
    await userEvent.type(page.getByLabelText('Email address'), 'x@example.com');
    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(await page.findByText(message)).toBeInTheDocument();
    expect(page.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows other Problem Details errors as a message', async () => {
    patch.mockRejectedValue(
      problem(500, 'INTERNAL_ERROR', 'An unexpected error occurred'),
    );
    renderAt(user());
    const page = await form();

    await userEvent.clear(page.getByLabelText('Full name'));
    await userEvent.type(page.getByLabelText('Full name'), 'Someone');
    await userEvent.click(page.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An unexpected error occurred',
    );
  });

  it('says when the user does not exist', async () => {
    get.mockRejectedValue(problem(404, 'NOT_FOUND', 'User not found'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/users/999']}>
          <Routes>
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This user does not exist.',
    );
  });
});
